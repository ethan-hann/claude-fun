import * as THREE from 'three';

// A sun shadow map that contains only moving objects (layer DYNAMIC_LAYER). Static surfaces
// already have baked sun visibility in their lightmap, so they only need to know where moving
// things shade them. Keeping static casters out of this map means baked shadow edges stay smooth
// and free of real-time aliasing.

export const DYNAMIC_LAYER = 1;

export const dynShadowUniforms = {
  uDynShadowMap: { value: null as THREE.Texture | null },
  uDynShadowMatrix: { value: new THREE.Matrix4() },
  uDynShadowTexel: { value: 1 / 2048 },
  uDynShadowOn: { value: 0 },
};

export const DYN_SHADOW_GLSL = /* glsl */ `
uniform sampler2D uDynShadowMap;
uniform mat4 uDynShadowMatrix;
uniform float uDynShadowTexel;
uniform float uDynShadowOn;
float bfDynShadow( vec3 wp, vec3 wn ) {
  if ( uDynShadowOn < 0.5 ) return 1.0;
  vec4 sc = uDynShadowMatrix * vec4( wp + wn * 0.04, 1.0 );
  vec3 p = sc.xyz / sc.w * 0.5 + 0.5;
  if ( p.x <= 0.0 || p.x >= 1.0 || p.y <= 0.0 || p.y >= 1.0 || p.z >= 1.0 ) return 1.0;
  float bias = 0.0015;
  float s = 0.0;
  float r = uDynShadowTexel * 1.6;
  float ang = fract( sin( dot( gl_FragCoord.xy, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ) * 6.2831853;
  for ( int i = 0; i < 8; i ++ ) {
    float fi = float( i );
    float rr = sqrt( ( fi + 0.5 ) / 8.0 ) * r * 1.8;
    float a = ang + fi * 2.39996;
    vec2 o = vec2( cos( a ), sin( a ) ) * rr;
    float d = texture2D( uDynShadowMap, p.xy + o ).r;
    s += step( p.z - bias, d );
  }
  return s / 8.0;
}
`;

export class DynamicShadow {
  camera: THREE.OrthographicCamera;
  target: THREE.WebGLRenderTarget;
  size: number;
  extent: number;
  private depthMat = new THREE.MeshDepthMaterial({ side: THREE.DoubleSide });
  private sunDir: THREE.Vector3;

  constructor(sunDir: THREE.Vector3, size = 2048, extent = 24) {
    this.size = size;
    this.extent = extent;
    this.sunDir = sunDir.clone().normalize();
    this.camera = new THREE.OrthographicCamera(-extent, extent, extent, -extent, 1, 260);
    this.camera.layers.set(DYNAMIC_LAYER);
    this.target = this.makeTarget(size);
    dynShadowUniforms.uDynShadowTexel.value = 1 / size;
  }

  private makeTarget(size: number): THREE.WebGLRenderTarget {
    const depth = new THREE.DepthTexture(size, size, THREE.UnsignedIntType);
    depth.minFilter = THREE.NearestFilter;
    depth.magFilter = THREE.NearestFilter;
    const rt = new THREE.WebGLRenderTarget(size, size, { depthTexture: depth, depthBuffer: true, samples: 0 });
    dynShadowUniforms.uDynShadowMap.value = depth;
    return rt;
  }

  setSize(size: number): void {
    if (size === this.size) return;
    this.target.dispose();
    this.target.depthTexture?.dispose();
    this.size = size;
    this.target = this.makeTarget(size);
    dynShadowUniforms.uDynShadowTexel.value = 1 / size;
  }

  // Center the map on the given point, snapped to whole texels so edges do not shimmer.
  update(renderer: THREE.WebGLRenderer, scene: THREE.Scene, center: THREE.Vector3, enabled: boolean): void {
    dynShadowUniforms.uDynShadowOn.value = enabled ? 1 : 0;
    if (!enabled) return;
    const cam = this.camera;
    const texelWorld = (2 * this.extent) / this.size;
    const up = Math.abs(this.sunDir.y) > 0.99 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    // light-space basis
    const fwd = this.sunDir.clone().negate();
    const right = new THREE.Vector3().crossVectors(fwd, up).normalize();
    const upv = new THREE.Vector3().crossVectors(right, fwd).normalize();
    const cx = Math.round(center.dot(right) / texelWorld) * texelWorld;
    const cy = Math.round(center.dot(upv) / texelWorld) * texelWorld;
    const cz = center.dot(fwd);
    const snapped = right.clone().multiplyScalar(cx).addScaledVector(upv, cy).addScaledVector(fwd, cz);
    cam.position.copy(snapped).addScaledVector(this.sunDir, 130);
    cam.up.copy(upv);
    cam.lookAt(snapped);
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();
    dynShadowUniforms.uDynShadowMatrix.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const prevTarget = renderer.getRenderTarget();
    const prevOverride = scene.overrideMaterial;
    const prevBg = scene.background;
    const prevAutoClear = renderer.autoClear;
    scene.overrideMaterial = this.depthMat;
    scene.background = null;
    renderer.autoClear = true;
    renderer.setRenderTarget(this.target);
    renderer.clear(true, true, false);
    const prevShadow = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.render(scene, cam);
    renderer.shadowMap.autoUpdate = prevShadow;
    renderer.setRenderTarget(prevTarget);
    scene.overrideMaterial = prevOverride;
    scene.background = prevBg;
    renderer.autoClear = prevAutoClear;
  }
}
