import * as THREE from 'three';
import world from '../../shared/world.json';
import { skyUrl } from './assets';

// The sky panorama is stored as an 8-bit WebP with each channel log-encoded
// (see tools/process_sky.py). It is decoded here for three things:
//  1. the visible sky dome (with an analytic sun disc and halo),
//  2. a float panorama that PMREM turns into the image-based lighting,
//  3. the aerial-perspective fog, which samples a blurred sky in the view direction.

export const LOG_MIN = world.sky.logMin;
export const LOG_RATIO = Math.log(world.sky.logMax / world.sky.logMin);

export function sunDirection(): THREE.Vector3 {
  const az = THREE.MathUtils.degToRad(world.sun.azimuthDeg);
  const el = THREE.MathUtils.degToRad(world.sun.elevationDeg);
  return new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).normalize();
}

export const SUN_COLOR = new THREE.Color().setRGB(world.sun.color[0], world.sun.color[1], world.sun.color[2]);
export const SUN_INTENSITY = world.sun.intensity;

const DECODE = /* glsl */ `
  uniform sampler2D uSky;
  uniform float uSkyLogMin;
  uniform float uSkyLogRatio;
  vec2 bfEquirectUv( vec3 dir ) {
    float u = atan( dir.z, dir.x ) * 0.15915494309189535 + 0.5;
    float v = asin( clamp( dir.y, -1.0, 1.0 ) ) * 0.3183098861837907 + 0.5;
    return vec2( u, v );
  }
  vec3 bfDecodeSky( vec3 enc ) { return uSkyLogMin * exp( enc * uSkyLogRatio ); }
`;

// Shared uniforms used by the sky dome and by every patched material (fog).
export const skyUniforms = {
  uSky: { value: null as THREE.Texture | null },
  uSkyLogMin: { value: LOG_MIN },
  uSkyLogRatio: { value: LOG_RATIO },
  uSunDir: { value: sunDirection() },
  uSunColor: { value: SUN_COLOR.clone().multiplyScalar(1) },
  uSkyExposure: { value: world.sky.strength },
  uHeartPos: { value: new THREE.Vector3(0, 60, -620) },
  uHeartGlow: { value: 1.0 },
};

export const SKY_GLSL = DECODE;

export class Sky {
  dome: THREE.Mesh;
  texture!: THREE.Texture;
  envMap!: THREE.Texture;
  private renderer: THREE.WebGLRenderer;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    const mat = new THREE.ShaderMaterial({
      uniforms: skyUniforms as any,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          vec4 p = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
          gl_Position = p.xyww; // at the far plane
        }`,
      fragmentShader: /* glsl */ `
        ${DECODE}
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform float uSkyExposure;
        uniform vec3 uHeartPos;
        uniform float uHeartGlow;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize( vDir );
          vec3 col = bfDecodeSky( textureLod( uSky, bfEquirectUv( d ), 0.0 ).rgb );
          float c = dot( d, uSunDir );
          // A swollen, dim red-orange sun: large disc with limb darkening, soft halo.
          float r = acos( clamp( c, -1.0, 1.0 ) );
          float discR = 0.028;
          float disc = 1.0 - smoothstep( discR * 0.94, discR, r );
          float limb = sqrt( max( 0.0, 1.0 - ( r / discR ) * ( r / discR ) ) );
          vec3 sunCol = uSunColor * vec3( 1.0, 0.78, 0.6 );
          col = mix( col, sunCol * ( 18.0 + 22.0 * limb ), disc );
          col += sunCol * ( pow( max( c, 0.0 ), 2200.0 ) * 6.0 + pow( max( c, 0.0 ), 180.0 ) * 1.2 + pow( max( c, 0.0 ), 12.0 ) * 0.25 );
          // the Heartbloom, far off: a point of cold light that every island can see
          vec3 toHeart = uHeartPos - cameraPosition;
          float hc = max( dot( d, normalize( toHeart ) ), 0.0 );
          float near = smoothstep( 70.0, 240.0, length( toHeart ) );
          col += vec3( 0.55, 0.9, 1.0 ) * ( pow( hc, 9000.0 ) * 40.0 + pow( hc, 900.0 ) * 3.0 + pow( hc, 60.0 ) * 0.12 ) * uHeartGlow * near;
          gl_FragColor = vec4( col * uSkyExposure, 1.0 );
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), mat);
    this.dome.scale.setScalar(1000);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -1000;
    this.dome.name = 'sky';
  }

  async load(): Promise<void> {
    const tex = await new THREE.TextureLoader().loadAsync(skyUrl);
    tex.colorSpace = THREE.NoColorSpace; // log-encoded data, not color
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = 4;
    this.texture = tex;
    skyUniforms.uSky.value = tex;
    this.envMap = this.buildEnvironment();
  }

  // Decode the sky into a float panorama, then prefilter it for image-based lighting.
  private buildEnvironment(): THREE.Texture {
    const r = this.renderer;
    const rt = new THREE.WebGLRenderTarget(1024, 512, { type: THREE.HalfFloatType, depthBuffer: false });
    const quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: { uSky: skyUniforms.uSky, uSkyLogMin: skyUniforms.uSkyLogMin, uSkyLogRatio: skyUniforms.uSkyLogRatio },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: /* glsl */ `
          uniform sampler2D uSky; uniform float uSkyLogMin; uniform float uSkyLogRatio;
          varying vec2 vUv;
          void main() {
            vec3 enc = textureLod( uSky, vUv, 1.5 ).rgb;
            gl_FragColor = vec4( uSkyLogMin * exp( enc * uSkyLogRatio ), 1.0 );
          }`,
        depthTest: false,
        depthWrite: false,
      }),
    );
    const scene = new THREE.Scene();
    scene.add(quad);
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const prevTarget = r.getRenderTarget();
    const prevTone = r.toneMapping;
    r.toneMapping = THREE.NoToneMapping;
    r.setRenderTarget(rt);
    r.render(scene, cam);
    r.setRenderTarget(prevTarget);
    r.toneMapping = prevTone;
    rt.texture.mapping = THREE.EquirectangularReflectionMapping;
    rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
    const pmrem = new THREE.PMREMGenerator(r);
    const env = pmrem.fromEquirectangular(rt.texture).texture;
    pmrem.dispose();
    rt.dispose();
    quad.geometry.dispose();
    (quad.material as THREE.Material).dispose();
    return env;
  }

  update(camera: THREE.Camera): void {
    this.dome.position.copy(camera.position);
  }
}
