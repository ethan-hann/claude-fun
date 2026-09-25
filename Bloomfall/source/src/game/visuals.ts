import * as THREE from 'three';
import type { LatticeVisualFactory } from './lattice';
import { buildSurfaceMaterial, textureSet, TextureSet } from '../engine/materials';
import { loadModel } from '../engine/level';
import { modelUrl } from '../engine/assets';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Visuals for lattice objects. Uses the Blender-built models when they exist
// (assets/models/lattice_*.glb); otherwise builds simple bevelled stand-ins with the same
// PBR lattice material and a glowing seam texture.

interface GlowMats { seam: THREE.MeshStandardMaterial[]; pips: THREE.Mesh[] }

export interface FramedMats { body: THREE.Material; rail: THREE.Material; seam: THREE.MeshStandardMaterial }

// A box whose texture coordinates are in metres, so long pieces do not stretch the texture.
export function metricBox(w: number, h: number, d: number, tile = 1): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i));
    const u = nx > 0.5 ? z : x;
    const v = ny > 0.5 ? z : y;
    uv.setXY(i, u / tile, v / tile);
  }
  return g;
}

// Steel rails along the twelve edges, and a glowing seam ring inset on every face that is big
// enough to carry one (long faces get cross seams too). Same language as the crates.
export function frameGeometry(w: number, h: number, d: number): { rails: THREE.BufferGeometry; seams: THREE.BufferGeometry | null } {
  const r = Math.min(0.08, Math.min(w, h, d) * 0.22);
  const rails: THREE.BufferGeometry[] = [];
  const add = (sx: number, sy: number, sz: number, x: number, y: number, z: number, list: THREE.BufferGeometry[]) => {
    const g = metricBox(sx, sy, sz, 0.5);
    g.translate(x, y, z);
    list.push(g);
  };
  for (const a of [-1, 1]) for (const b of [-1, 1]) {
    add(w + 0.004, r, r, 0, a * (h / 2 - r / 2 + 0.002), b * (d / 2 - r / 2 + 0.002), rails);
    add(r, h + 0.004, r, a * (w / 2 - r / 2 + 0.002), 0, b * (d / 2 - r / 2 + 0.002), rails);
    add(r, r, d + 0.004, a * (w / 2 - r / 2 + 0.002), b * (h / 2 - r / 2 + 0.002), 0, rails);
  }
  const seams: THREE.BufferGeometry[] = [];
  const inset = r + 0.07;
  const sw = 0.035;
  const lift = 0.004;
  // face: normal axis, the two in-plane axes and their sizes
  const faces: [number, number, number, number, number, number][] = [
    [0, w, 2, d, 1, h], [1, h, 0, w, 2, d], [2, d, 0, w, 1, h],
  ];
  for (const [ax, an, ua, us, va, vs] of faces) {
    if (us < inset * 2 + 0.3 || vs < inset * 2 + 0.3) continue;
    for (const sgn of [-1, 1]) {
      const strip = (u: number, v: number, lu: number, lv: number) => {
        const size = [0, 0, 0];
        const at = [0, 0, 0];
        size[ax] = 0.01; at[ax] = sgn * (an / 2 + lift);
        size[ua] = lu; at[ua] = u;
        size[va] = lv; at[va] = v;
        add(size[0], size[1], size[2], at[0], at[1], at[2], seams);
      };
      const U = us / 2 - inset, V = vs / 2 - inset;
      strip(0, V, U * 2, sw); strip(0, -V, U * 2, sw);
      strip(U, 0, sw, V * 2); strip(-U, 0, sw, V * 2);
      // cross seams every ~1.6 m along long faces
      const n = Math.floor((U * 2) / 1.6);
      for (let i = 1; i <= n; i++) strip(-U + (i * U * 2) / (n + 1), 0, sw, V * 2);
    }
  }
  return { rails: mergeGeometries(rails)!, seams: seams.length ? mergeGeometries(seams)! : null };
}

function seamTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#fff';
  g.lineWidth = 7;
  g.strokeRect(10, 10, 236, 236);
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(128, 18); g.lineTo(128, 60); g.moveTo(128, 196); g.lineTo(128, 238);
  g.moveTo(18, 128); g.lineTo(60, 128); g.moveTo(196, 128); g.lineTo(238, 128);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const SEAM_COLOR = new THREE.Color(0.45, 0.88, 1.0);

export class LatticeVisuals implements LatticeVisualFactory {
  private set!: TextureSet;
  private sets: Record<string, TextureSet> = {};
  private seamTex = seamTexture();
  private models = new Map<string, THREE.Object3D>();
  private glowMap = new WeakMap<THREE.Object3D, GlowMats>();

  async init(): Promise<void> {
    this.set = await textureSet('lattice');
    for (const k of ['lattice', 'plates', 'steel']) this.sets[k] = await textureSet(k);
    for (const n of ['lattice_crate', 'lattice_orb']) {
      if (modelUrl(n)) this.models.set(n, await loadModel(n));
    }
  }

  // Each object gets its own material: its own glow level and sky visibility.
  private material(): { body: THREE.MeshStandardMaterial; seam: THREE.MeshStandardMaterial } {
    const body = buildSurfaceMaterial('lattice', this.set, { skyVis: { value: 1 }, uvScale: { value: 1 } });
    body.emissiveMap = this.seamTex;
    body.emissive.copy(SEAM_COLOR);
    body.emissiveIntensity = 1.5;
    return { body, seam: body };
  }

  private fromModel(name: string): THREE.Object3D | null {
    const m = this.models.get(name);
    if (!m) return null;
    const obj = m.clone(true);
    const seams: THREE.MeshStandardMaterial[] = [];
    const pips: THREE.Mesh[] = [];
    const uvScale = { value: 1 };
    const cache = new Map<string, THREE.MeshStandardMaterial>();
    obj.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mn = (mesh.material as THREE.Material).name.split('.')[0];
      if (/^pip\d/.test(mesh.name) || /^pip\d/.test(mesh.parent?.name ?? '')) {
        const pm = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xfff4e0, emissiveIntensity: 4, roughness: 1, metalness: 0 });
        mesh.material = pm;
        mesh.userData.pip = Number((/pip(\d)/.exec(mesh.name) ?? /pip(\d)/.exec(mesh.parent?.name ?? '') ?? ['', '0'])[1]);
        pips.push(mesh);
        return;
      }
      if (mn.startsWith('glow')) {
        const g = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: SEAM_COLOR, emissiveIntensity: 2.5, roughness: 1, metalness: 0 });
        mesh.material = g;
        seams.push(g);
        return;
      }
      let mat = cache.get(mn);
      if (!mat) {
        // crate panels get their own tuning: darker and rougher than the architectural plates
        mat = buildSurfaceMaterial(mn === 'plates' ? 'crate_panel' : mn, this.sets[mn] ?? this.set, { skyVis: { value: 1 }, uvScale });
        cache.set(mn, mat);
      }
      mesh.material = mat;
    });
    obj.userData.uvScale = uvScale;
    this.glowMap.set(obj, { seam: seams, pips });
    return obj;
  }

  private box(w: number, h: number, d: number): THREE.Object3D {
    const mats = this.framedMats();
    const g = this.framedMesh(w, h, d, mats);
    this.register(g, mats);
    return g;
  }

  // Materials for one anchored lattice piece: its seams glow on their own.
  framedMats(): FramedMats {
    const body = buildSurfaceMaterial('lattice', this.set, { skyVis: { value: 1 }, uvScale: { value: 1 } });
    const rail = buildSurfaceMaterial('steel', this.sets.steel ?? this.set, { skyVis: { value: 1 }, uvScale: { value: 1 } });
    const seam = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: SEAM_COLOR, emissiveIntensity: 2.5, roughness: 1, metalness: 0 });
    return { body, rail, seam };
  }

  framedMesh(w: number, h: number, d: number, mats: FramedMats): THREE.Group {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(metricBox(w, h, d, 1), mats.body));
    const f = frameGeometry(w, h, d);
    g.add(new THREE.Mesh(f.rails, mats.rail));
    if (f.seams) g.add(new THREE.Mesh(f.seams, mats.seam));
    return g;
  }

  register(obj: THREE.Object3D, mats: FramedMats): void {
    this.glowMap.set(obj, { seam: [mats.seam], pips: [] });
  }

  crate(): THREE.Object3D {
    return this.fromModel('lattice_crate') ?? this.box(1, 1, 1);
  }

  orb(): THREE.Object3D {
    const m = this.fromModel('lattice_orb');
    if (m) return m;
    const { body } = this.material();
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 40, 24), body);
    const g = new THREE.Group();
    g.add(mesh);
    this.glowMap.set(g, { seam: [body], pips: [] });
    return g;
  }

  pillar(w: number, d: number, h: number): THREE.Object3D { return this.box(w, h, d); }
  span(w: number, t: number, l: number): THREE.Object3D { return this.box(w, t, l); }
  bulkhead(w: number, h: number, d: number): THREE.Object3D { return this.box(w, h, d); }

  setGlow(obj: THREE.Object3D, glow: number, highlight: number): void {
    const g = this.glowMap.get(obj);
    if (!g) return;
    const k = 2.0 + glow * 9 + highlight * 2.2;
    for (const m of g.seam) m.emissiveIntensity = k;
    const uv = obj.userData.uvScale as { value: number } | undefined;
    if (uv) uv.value = obj.scale.x;
  }

  setLevelPips(obj: THREE.Object3D, level: number, _levels: number): void {
    const g = this.glowMap.get(obj);
    if (!g) return;
    for (const p of g.pips) {
      const lit = (p.userData.pip as number) <= level;
      (p.material as THREE.MeshStandardMaterial).emissiveIntensity = lit ? 5 : 0.0;
      (p.material as THREE.MeshStandardMaterial).color.setScalar(lit ? 0 : 0.02);
    }
  }
}
