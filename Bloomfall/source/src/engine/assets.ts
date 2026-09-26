// Asset registry. Vite turns every import below into a URL; the single-file build inlines them as
// data URLs so the finished game is one self-contained HTML file.

const textureUrls = import.meta.glob('../../assets/textures/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const levelGlbs = import.meta.glob('../../assets/levels/*.glb', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const levelLightmaps = import.meta.glob('../../assets/levels/*_lm.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const modelUrls = import.meta.glob('../../assets/models/*.glb', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const levelJson = import.meta.glob('../levels/*.json', { eager: true, import: 'default' }) as Record<string, LevelData>;
import skyUrl from '../../assets/sky/sky.webp?url';

export { skyUrl };

function base(path: string): string {
  return path.split('/').pop()!.replace(/\.[^.]+$/, '');
}

export function textureUrl(name: string): string | undefined {
  for (const [k, v] of Object.entries(textureUrls)) if (base(k) === name) return v;
  return undefined;
}

export function hasTextureSet(key: string): boolean {
  return textureUrl(key + '_color') !== undefined;
}

export function levelGlbUrl(key: string): string | undefined {
  for (const [k, v] of Object.entries(levelGlbs)) if (base(k) === key) return v;
  return undefined;
}

export function levelLightmapUrl(key: string): string | undefined {
  for (const [k, v] of Object.entries(levelLightmaps)) if (base(k) === key + '_lm') return v;
  return undefined;
}

export function modelUrl(name: string): string | undefined {
  for (const [k, v] of Object.entries(modelUrls)) if (base(k) === name) return v;
  return undefined;
}

export function levelData(key: string): LevelData | undefined {
  for (const [k, v] of Object.entries(levelJson)) if (base(k) === key) return v;
  return undefined;
}

// ---- level JSON written by blender/build_island.py ----
export type Vec3 = [number, number, number];

export interface ColliderBox { t: 'box'; p: Vec3; h: Vec3; ry?: number; r?: Vec3; k: string; tag?: string }
export interface ColliderHull { t: 'hull'; v: Vec3[]; k: string }
export interface ColliderCyl { t: 'cyl'; p: Vec3; r: number; hh: number; k: string }
export type Collider = ColliderBox | ColliderHull | ColliderCyl;

export interface EntityRec { type: string; id?: string; [k: string]: any }

export interface LevelData {
  key: string;
  title: string;
  colliders: Collider[];
  entities: EntityRec[];
  meta: Record<string, any>;
  lightmapScale: number;
}
