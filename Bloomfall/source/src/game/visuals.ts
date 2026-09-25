import * as THREE from 'three';
import type { LatticeVisualFactory } from './lattice';
import { buildSurfaceMaterial, textureSet, TextureSet } from '../engine/materials';
import { loadModel } from '../engine/level';
import { modelUrl } from '../engine/assets';

// Visuals for lattice objects. Uses the Blender-built models when they exist
// (assets/models/lattice_*.glb); otherwise builds simple bevelled stand-ins with the same
// PBR lattice material and a glowing seam texture.

interface GlowMats { seam: THREE.MeshStandardMaterial[]; pips: THREE.Mesh[] }

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
    const { body } = this.material();
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, body);
    const g = new THREE.Group();
    g.add(mesh);
    this.glowMap.set(g, { seam: [body], pips: [] });
    return g;
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
