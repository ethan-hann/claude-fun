import * as THREE from 'three';
import { textureUrl } from './assets';
import { skyUniforms, SKY_GLSL } from './sky';
import { dynShadowUniforms, DYN_SHADOW_GLSL } from './dynshadow';

// ---------------------------------------------------------------------------------------------
// Texture sets. Every solid surface uses color + normal + ARM (AO, roughness, metalness).
// ---------------------------------------------------------------------------------------------

export interface TextureSet { color: THREE.Texture; normal: THREE.Texture; arm: THREE.Texture }

const loader = new THREE.TextureLoader();
const sets = new Map<string, Promise<TextureSet>>();
let maxAnisotropy = 8;

export function setMaxAnisotropy(n: number): void { maxAnisotropy = n; }

function loadTex(name: string, srgb: boolean): Promise<THREE.Texture> {
  const url = textureUrl(name);
  if (!url) return Promise.reject(new Error(`missing texture ${name}`));
  return loader.loadAsync(url).then((t) => {
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.flipY = false; // glTF-style UVs
    t.anisotropy = maxAnisotropy;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  });
}

export function textureSet(key: string): Promise<TextureSet> {
  let p = sets.get(key);
  if (!p) {
    p = Promise.all([loadTex(key + '_color', true), loadTex(key + '_normal', false), loadTex(key + '_arm', false)])
      .then(([color, normal, arm]) => ({ color, normal, arm }));
    sets.set(key, p);
  }
  return p;
}

// Per-material tuning on top of the texture sets.
export const MATERIAL_TUNING: Record<string, { tint?: number; rough?: number; metal?: number; normal?: number; envI?: number; alphaTest?: number; uvScale?: number }> = {
  wall: { normal: 1.0 },
  ribbed: { normal: 1.2 },
  tiles: { normal: 1.0, rough: 1.35 },
  concrete: { normal: 1.0, rough: 1.3 },
  marble: { normal: 1.0, rough: 1.3 },
  rock: { normal: 1.3 },
  paving: { normal: 1.0, rough: 1.15 },
  leaves: { normal: 1.2 },
  rust: { normal: 1.0 },
  lattice: { metal: 1.0, rough: 0.9, normal: 1.0 },
  steel: { metal: 1.0, rough: 1.0 },
  plates: { metal: 1.0, rough: 1.25 },
  crate_panel: { metal: 1.0, rough: 1.7, tint: 0xa9aeb8 },
  screen: { metal: 1.0, rough: 1.0, alphaTest: 0.5 },
};

export const GLOW_COLORS: Record<string, [number, number, number, number]> = {
  glow_cyan: [0.35, 0.85, 1.0, 6.0],
  glow_warm: [1.0, 0.55, 0.22, 5.0],
  glow_white: [1.0, 0.95, 0.88, 6.0],
};

// ---------------------------------------------------------------------------------------------
// Shader patches (three r186 chunks).
//  - Aerial perspective: fog takes the sky's color in the view direction, plus height haze.
//  - Lightmapped (static) surfaces: the lightmap RGB is sky + bounce light, its alpha is the
//    baked sun visibility. The real-time sun uses min(real-time shadow, baked visibility), the
//    sky's diffuse light comes only from the lightmap, and sky reflections are occluded by the
//    ratio between the baked light and the open sky's light.
//  - Dynamic surfaces: a per-material sky visibility scales image-based light (set from probes).
// ---------------------------------------------------------------------------------------------

export const fogUniforms = {
  uFogDensity: { value: 0.0012 },
  uFogHeightDensity: { value: 0.003 },
  uFogHeightStart: { value: -25.0 },
  uFogHeightFalloff: { value: 0.04 },
  uFogBrightness: { value: 1.0 },
  uFogEnabled: { value: 1.0 },
};

const FRAG_PARS = /* glsl */ `
${SKY_GLSL}
${DYN_SHADOW_GLSL}
uniform float uFogDensity;
uniform float uFogHeightDensity;
uniform float uFogHeightStart;
uniform float uFogHeightFalloff;
uniform float uFogBrightness;
uniform float uFogEnabled;
uniform float uSkyVis;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
varying vec3 vBfWorldPos;
vec3 bfFog( vec3 col, vec3 wp ) {
  vec3 dv = wp - cameraPosition;
  float dist = length( dv );
  vec3 dir = dv / max( dist, 1e-4 );
  // integrated exponential height fog along the view ray
  float h0 = cameraPosition.y - uFogHeightStart;
  float dy = dv.y;
  float k = uFogHeightFalloff;
  float heightTerm;
  if ( abs( dy ) > 0.01 ) {
    heightTerm = ( exp( -k * h0 ) - exp( -k * ( h0 + dy ) ) ) / ( k * dy ) ;
  } else {
    heightTerm = exp( -k * h0 );
  }
  float optical = uFogDensity * dist + uFogHeightDensity * dist * clamp( heightTerm, 0.0, 40.0 );
  float f = ( 1.0 - exp( -optical ) ) * uFogEnabled;
  vec3 skyCol = bfDecodeSky( textureLod( uSky, bfEquirectUv( normalize( vec3( dir.x, max( dir.y, -0.25 ), dir.z ) ) ), 6.5 ).rgb );
  float sunAmt = pow( max( dot( dir, uSunDir ), 0.0 ), 8.0 );
  skyCol += uSunColor * sunAmt * 0.15;
  return mix( col, skyCol * uFogBrightness, f );
}
`;

const LIGHTS_BEGIN_PATCH = (src: string): string => {
  // Sun loop. Static (baked) surfaces: sun visibility = baked visibility x the shadow of moving
  // objects (their own map). Moving surfaces keep the cascaded real-time shadow, which includes
  // static casters.
  const anchor = 'getSunLightInfo( sunLight, directLight );';
  if (!src.includes(anchor)) throw new Error('three.js sun light chunk changed');
  src = src.replace(anchor, `getSunLightInfo( sunLight, directLight );
		#ifdef BF_BAKED
		directLight.color *= bfBakedSun * bfDynShadow( vBfWorldPos, bfWorldNormal );
		#endif`);
  return `
  #ifdef BF_BAKED
  vec4 bfLm = texture2D( lightMap, vLightMapUv );
  float bfBakedSun = bfLm.a;
  vec3 bfWorldNormal = inverseTransformDirection( normal, viewMatrix );
  #endif
  ` + src;
};

const LIGHTS_MAPS = /* glsl */ `
#if defined( RE_IndirectDiffuse )
	#ifdef USE_LIGHTMAP
		vec3 lightMapIrradiance = bfLm.rgb * lightMapIntensity;
		irradiance += lightMapIrradiance;
	#endif
	#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
		#ifdef BF_BAKED
			// sky light is already in the lightmap; use the open-sky irradiance only to estimate
			// how much of the sky this point sees (for reflections)
			vec3 bfOpen = getIBLIrradiance( geometryNormal );
			float bfSpecOcc = clamp( dot( lightMapIrradiance, vec3( 0.2126, 0.7152, 0.0722 ) ) / max( dot( bfOpen, vec3( 0.2126, 0.7152, 0.0722 ) ), 1e-3 ), 0.0, 1.0 );
			bfSpecOcc = bfSpecOcc * bfSpecOcc;
		#else
			iblIrradiance += getIBLIrradiance( geometryNormal ) * uSkyVis;
		#endif
	#endif
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
	vec3 iblRadiance = getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );
	#ifdef BF_BAKED
		iblRadiance *= bfSpecOcc;
	#else
		iblRadiance *= uSkyVis;
	#endif
	radiance += iblRadiance;
	#ifdef USE_CLEARCOAT
		clearcoatRadiance += getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness ) * uSkyVis;
	#endif
#endif
`;

let lightsBeginPatched: string | null = null;

export interface PatchOptions { baked?: boolean; skyVis?: { value: number }; uvScale?: { value: number } }

export function patchMaterial(mat: THREE.MeshStandardMaterial, opts: PatchOptions = {}): void {
  const skyVis = opts.skyVis ?? { value: 1 };
  (mat as any).userData.skyVis = skyVis;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, skyUniforms, fogUniforms, dynShadowUniforms, { uSkyVis: skyVis });
    if (opts.uvScale) shader.uniforms.uUvScale = opts.uvScale;
    if (opts.baked) shader.defines = { ...(shader.defines ?? {}), BF_BAKED: '' };
    let vs = shader.vertexShader;
    vs = vs.replace('#include <common>', '#include <common>\nvarying vec3 vBfWorldPos;' + (opts.uvScale ? '\nuniform float uUvScale;' : ''));
    vs = vs.replace('#include <fog_vertex>', `#include <fog_vertex>
      vec4 bfWp = vec4( transformed, 1.0 );
      #ifdef USE_BATCHING
        bfWp = batchingMatrix * bfWp;
      #endif
      #ifdef USE_INSTANCING
        bfWp = instanceMatrix * bfWp;
      #endif
      vBfWorldPos = ( modelMatrix * bfWp ).xyz;`);
    if (opts.uvScale) {
      vs = vs.replace('#include <uv_vertex>', `#include <uv_vertex>
      #ifdef USE_MAP
        vMapUv *= uUvScale;
      #endif
      #ifdef USE_NORMALMAP
        vNormalMapUv *= uUvScale;
      #endif
      #ifdef USE_ROUGHNESSMAP
        vRoughnessMapUv *= uUvScale;
      #endif
      #ifdef USE_METALNESSMAP
        vMetalnessMapUv *= uUvScale;
      #endif
      #ifdef USE_AOMAP
        vAoMapUv *= uUvScale;
      #endif`);
    }
    shader.vertexShader = vs;
    let fs = shader.fragmentShader;
    fs = fs.replace('#include <common>', '#include <common>\n' + FRAG_PARS);
    if (!lightsBeginPatched) lightsBeginPatched = LIGHTS_BEGIN_PATCH(THREE.ShaderChunk.lights_fragment_begin);
    fs = fs.replace('#include <lights_fragment_begin>', lightsBeginPatched);
    fs = fs.replace('#include <lights_fragment_maps>', LIGHTS_MAPS);
    fs = fs.replace('#include <fog_fragment>', 'gl_FragColor.rgb = bfFog( gl_FragColor.rgb, vBfWorldPos );');
    const dbg = (window as any).__lmDebug as number | undefined;
    if (dbg && opts.baked) {
      fs = fs.replace('#include <dithering_fragment>', `#include <dithering_fragment>
        gl_FragColor.rgb = ${dbg === 1 ? 'bfLm.rgb' : dbg === 2 ? 'vec3( bfLm.a )' : 'vec3( bfDynShadow( vBfWorldPos, bfWorldNormal ) )'};`);
    }
    shader.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => (opts.baked ? 'bf-baked' : 'bf-dyn') + (opts.uvScale ? '-uv' : '');
}

// ---------------------------------------------------------------------------------------------
// Material factories
// ---------------------------------------------------------------------------------------------

export type SurfaceOpts = { lightMap?: THREE.Texture; lightMapIntensity?: number; skyVis?: { value: number }; uvScale?: { value: number }; side?: THREE.Side };

export function buildSurfaceMaterial(key: string, set: TextureSet | null, opts: SurfaceOpts = {}): THREE.MeshStandardMaterial {
  const glow = GLOW_COLORS[key];
  if (glow || !set) {
    const m = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 1, metalness: 0 });
    if (glow) {
      m.emissive.setRGB(glow[0], glow[1], glow[2]);
      m.emissiveIntensity = glow[3];
    }
    patchMaterial(m, { skyVis: { value: 0 } });
    m.name = key;
    return m;
  }
  const tune = MATERIAL_TUNING[key] ?? {};
  const m = new THREE.MeshStandardMaterial({
    map: set.color,
    normalMap: set.normal,
    roughnessMap: set.arm,
    metalnessMap: set.arm,
    aoMap: set.arm,
    roughness: tune.rough ?? 1,
    metalness: tune.metal ?? 1,
    side: opts.side ?? THREE.FrontSide,
  });
  m.aoMapIntensity = opts.lightMap ? 0.6 : 1.0;
  m.normalScale.set(tune.normal ?? 1, -(tune.normal ?? 1));
  if (tune.tint !== undefined) m.color.setHex(tune.tint);
  if (tune.alphaTest) {
    m.alphaTest = tune.alphaTest;
    m.side = THREE.DoubleSide;
  }
  if (opts.lightMap) {
    m.lightMap = opts.lightMap;
    m.lightMapIntensity = opts.lightMapIntensity ?? 1;
  }
  patchMaterial(m, { baked: !!opts.lightMap, skyVis: opts.skyVis, uvScale: opts.uvScale });
  m.name = key;
  return m;
}

export async function surfaceMaterial(key: string, opts: SurfaceOpts = {}): Promise<THREE.MeshStandardMaterial> {
  const set = GLOW_COLORS[key] ? null : await textureSet(key);
  return buildSurfaceMaterial(key, set, opts);
}
