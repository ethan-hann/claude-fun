import * as THREE from 'three';
import { Effect, EffectAttribute, BlendFunction } from 'postprocessing';
import { SKY_GLSL, skyUniforms } from './sky';
import { fogUniforms } from './materials';

// Volumetric fog, as a post effect on the linear HDR image before bloom and tone mapping. Each
// pixel marches its view ray from the camera to the surface through a fog volume: thick below the
// islands, thinner above, broken into drifting banks by tileable 3D noise, and thin close to the
// camera so the ground under your feet stays clear. Far islands sink into it and come out of it
// as you cross toward them. The in-scattered light is the blurred sky in the view direction plus
// a sun lobe, the same color the surfaces used to fade to, so fogged islands meet the sky without
// a seam. Sky pixels (nothing written to depth) are left alone: the sky is the fog's own color, and
// additive glows drawn over it (the Heart's beam) keep their strength.

const MAX_STEPS = 32;

// Tileable fBm value noise in [0, 1], three octaves on lattices of 4, 8 and 16 cells.
function makeNoise(size = 64): THREE.Data3DTexture {
  const data = new Uint8Array(size * size * size);
  const acc = new Float32Array(size * size * size);
  let seed = 1337;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const octaves: Array<[number, number]> = [[4, 0.55], [8, 0.3], [16, 0.15]];
  for (const [cells, amp] of octaves) {
    const lat = new Float32Array(cells * cells * cells);
    for (let i = 0; i < lat.length; i++) lat[i] = rnd();
    const L = (x: number, y: number, z: number) => lat[((z % cells) * cells + (y % cells)) * cells + (x % cells)];
    const s = (t: number) => t * t * (3 - 2 * t);
    for (let z = 0; z < size; z++) {
      const fz = (z / size) * cells, z0 = Math.floor(fz), tz = s(fz - z0);
      for (let y = 0; y < size; y++) {
        const fy = (y / size) * cells, y0 = Math.floor(fy), ty = s(fy - y0);
        for (let x = 0; x < size; x++) {
          const fx = (x / size) * cells, x0 = Math.floor(fx), tx = s(fx - x0);
          const a = L(x0, y0, z0) + (L(x0 + 1, y0, z0) - L(x0, y0, z0)) * tx;
          const b = L(x0, y0 + 1, z0) + (L(x0 + 1, y0 + 1, z0) - L(x0, y0 + 1, z0)) * tx;
          const c = L(x0, y0, z0 + 1) + (L(x0 + 1, y0, z0 + 1) - L(x0, y0, z0 + 1)) * tx;
          const d = L(x0, y0 + 1, z0 + 1) + (L(x0 + 1, y0 + 1, z0 + 1) - L(x0, y0 + 1, z0 + 1)) * tx;
          const e = a + (b - a) * ty, f = c + (d - c) * ty;
          acc[(z * size + y) * size + x] += (e + (f - e) * tz) * amp;
        }
      }
    }
  }
  // stretch the (roughly bell-shaped) sum to use the whole range
  let lo = Infinity, hi = -Infinity;
  for (const v of acc) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  for (let i = 0; i < acc.length; i++) data[i] = Math.round(((acc[i] - lo) / (hi - lo)) * 255);
  const tex = new THREE.Data3DTexture(data, size, size, size);
  tex.format = THREE.RedFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

// built once and shared by every fog pass (the composer is rebuilt when the quality changes)
let NOISE: THREE.Data3DTexture | null = null;

const FOG_GLSL = /* glsl */ `
${SKY_GLSL}
uniform highp sampler3D uNoise;
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
uniform vec3 uCamPos;
uniform float uDensity;
uniform float uFogY0;
uniform float uFogH;
uniform float uNear;
uniform float uR0;
uniform float uR1;
uniform float uNoiseScale;
uniform vec3 uWind;
uniform float uTime;
uniform float uSteps;
uniform float uBrightness;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uHeartPos;
uniform float uHeartGlow;

float bfIgn( vec2 p ) { return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) ); }

// fog density (per meter) at p, s meters from the camera
float bfFogDensity( vec3 p, float s ) {
  float h = clamp( exp( -( p.y - uFogY0 ) / uFogH ), 0.0, 6.0 );
  vec3 q = p * uNoiseScale;
  float n = texture( uNoise, q + uWind * uTime ).r * 0.7 + texture( uNoise, q * 3.1 - uWind * uTime * 1.6 ).r * 0.3;
  float banks = 0.12 + 1.9 * smoothstep( 0.25, 0.75, n );
  float clear = mix( uNear, 1.0, smoothstep( uR0, uR1, s ) );
  return uDensity * h * banks * clear;
}

void mainImage( const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor ) {
  if ( depth >= 0.999999 ) { outputColor = inputColor; return; }
  vec4 vp = uInvProj * vec4( uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0 );
  vec3 wp = ( uCamWorld * vec4( vp.xyz / vp.w, 1.0 ) ).xyz;
  vec3 dv = wp - uCamPos;
  float dist = length( dv );
  vec3 dir = dv / max( dist, 1e-4 );
  float L = min( dist, 2400.0 );
  // samples bunch up near the camera (quadratic spacing), each at a jittered spot in its segment
  float j = bfIgn( gl_FragCoord.xy );
  float tau = 0.0;
  for ( int i = 0; i < ${MAX_STEPS}; i++ ) {
    if ( float( i ) >= uSteps ) break;
    float a = float( i ) / uSteps;
    float b = float( i + 1 ) / uSteps;
    float sa = L * a * a;
    float sb = L * b * b;
    float s = mix( sa, sb, j );
    tau += bfFogDensity( uCamPos + dir * s, s ) * ( sb - sa );
  }
  float T = exp( -tau );
  // the sky dome's own color in this direction (its broad sun halo and the Heart's glow included, the
  // sharp discs left out), so what the fog swallows fades into the sky behind it
  vec3 fogCol = bfDecodeSky( textureLod( uSky, bfEquirectUv( normalize( vec3( dir.x, max( dir.y, -0.25 ), dir.z ) ) ), 4.0 ).rgb );
  float c = max( dot( dir, uSunDir ), 0.0 );
  fogCol += uSunColor * vec3( 1.0, 0.78, 0.6 ) * ( pow( c, 180.0 ) * 1.2 + pow( c, 12.0 ) * 0.25 );
  vec3 toHeart = uHeartPos - uCamPos;
  float hc = max( dot( dir, normalize( toHeart ) ), 0.0 );
  fogCol += vec3( 0.55, 0.9, 1.0 ) * ( pow( hc, 900.0 ) * 3.0 + pow( hc, 60.0 ) * 0.12 ) * uHeartGlow * smoothstep( 70.0, 240.0, length( toHeart ) );
  outputColor = vec4( inputColor.rgb * T + fogCol * uBrightness * ( 1.0 - T ), inputColor.a );
}
`;

export interface FogSettings { density: number; y0: number; height: number; near: number; r0: number; r1: number; noiseScale: number }

export const FOG_DEFAULTS: FogSettings = { density: 0.11, y0: 20, height: 60, near: 0.08, r0: 50, r1: 170, noiseScale: 0.009 };

export class VolumetricFog extends Effect {
  private camera: THREE.PerspectiveCamera;
  private time = 0;
  private camPos = new THREE.Vector3();

  constructor(camera: THREE.PerspectiveCamera, steps: number, s: FogSettings = FOG_DEFAULTS) {
    const u = (v: unknown) => new THREE.Uniform(v);
    super('VolumetricFog', FOG_GLSL, {
      blendFunction: BlendFunction.SRC,
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map<string, THREE.Uniform>([
        ['uNoise', u(NOISE ??= makeNoise())],
        ['uInvProj', u(new THREE.Matrix4())],
        ['uCamWorld', u(new THREE.Matrix4())],
        ['uCamPos', u(new THREE.Vector3())],
        ['uDensity', u(s.density)],
        ['uFogY0', u(s.y0)],
        ['uFogH', u(s.height)],
        ['uNear', u(s.near)],
        ['uR0', u(s.r0)],
        ['uR1', u(s.r1)],
        ['uNoiseScale', u(s.noiseScale)],
        ['uWind', u(new THREE.Vector3(0.011, 0.0015, 0.006))],
        ['uTime', u(0)],
        ['uSteps', u(steps)],
        ['uBrightness', fogUniforms.uFogBrightness as THREE.Uniform], // dims with the sky in the ending
        // shared with the sky dome
        ['uSky', skyUniforms.uSky as THREE.Uniform],
        ['uSkyLogMin', skyUniforms.uSkyLogMin as THREE.Uniform],
        ['uSkyLogRatio', skyUniforms.uSkyLogRatio as THREE.Uniform],
        ['uSunDir', skyUniforms.uSunDir as THREE.Uniform],
        ['uSunColor', skyUniforms.uSunColor as THREE.Uniform],
        ['uHeartPos', skyUniforms.uHeartPos as THREE.Uniform],
        ['uHeartGlow', skyUniforms.uHeartGlow as THREE.Uniform],
      ]),
    });
    this.camera = camera;
  }

  get settings(): Record<string, THREE.Uniform> {
    const out: Record<string, THREE.Uniform> = {};
    this.uniforms.forEach((v, k) => { out[k] = v; });
    return out;
  }

  update(_renderer: THREE.WebGLRenderer, _input: THREE.WebGLRenderTarget, dt?: number): void {
    this.time += dt ?? 0;
    const c = this.camera;
    c.updateMatrixWorld();
    this.uniforms.get('uInvProj')!.value.copy(c.projectionMatrixInverse);
    this.uniforms.get('uCamWorld')!.value.copy(c.matrixWorld);
    this.uniforms.get('uCamPos')!.value.copy(c.getWorldPosition(this.camPos));
    this.uniforms.get('uTime')!.value = this.time;
  }
}
