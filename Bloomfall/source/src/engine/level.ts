import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { levelData, levelGlbUrl, levelLightmapUrl, modelUrl, LevelData } from './assets';
import { surfaceMaterial, GLOW_COLORS } from './materials';

export const gltfLoader = new GLTFLoader();
gltfLoader.setMeshoptDecoder(MeshoptDecoder);
const texLoader = new THREE.TextureLoader();

export interface IslandVisual { group: THREE.Group; data: LevelData; lightmap: THREE.Texture | null }

// Loads the baked static mesh of an island and gives every primitive its PBR material plus the
// island's lightmap (RGB: sky and bounce light, A: baked sun visibility).
export async function loadIslandVisual(key: string): Promise<IslandVisual> {
  const data = levelData(key);
  const url = levelGlbUrl(key);
  if (!data || !url) throw new Error(`island ${key} is missing`);
  const [gltf, lightmap] = await Promise.all([
    gltfLoader.loadAsync(url),
    (async () => {
      const lmUrl = levelLightmapUrl(key);
      if (!lmUrl) return null;
      const t = await texLoader.loadAsync(lmUrl);
      t.colorSpace = THREE.SRGBColorSpace;
      t.flipY = false;
      t.channel = 1;
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
      return t;
    })(),
  ]);
  const group = new THREE.Group();
  group.name = 'island_' + key;
  const meshes: THREE.Mesh[] = [];
  gltf.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
  const cache = new Map<string, Promise<THREE.Material>>();
  await Promise.all(meshes.map(async (mesh) => {
    const name = (mesh.material as THREE.Material).name.split('.')[0];
    let p = cache.get(name);
    if (!p) {
      const glow = GLOW_COLORS[name] !== undefined;
      p = surfaceMaterial(name, glow || !lightmap ? {} : { lightMap: lightmap, lightMapIntensity: Math.PI * data.lightmapScale });
      cache.set(name, p);
    }
    mesh.material = await p;
    // Static geometry casts into the cascaded map (so moving objects are shaded by it) but takes
    // its own sun visibility from the lightmap.
    mesh.castShadow = !name.startsWith('glow') && name !== 'screen';
    mesh.receiveShadow = false;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
  }));
  group.add(gltf.scene);
  return { group, data, lightmap };
}

export async function loadModel(name: string): Promise<THREE.Group> {
  const url = modelUrl(name);
  if (!url) throw new Error(`model ${name} is missing`);
  const gltf = await gltfLoader.loadAsync(url);
  return gltf.scene;
}
