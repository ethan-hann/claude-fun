import * as THREE from 'three';
import { buildSurfaceMaterial, TextureSet } from '../engine/materials';
import { DYNAMIC_LAYER } from '../engine/dynshadow';
import { SEAM_COLOR } from './visuals';
import type { LightPool, LightSource } from '../engine/lightpool';

// The bloom: a metal flower on each island's exit dais. It sleeps as a closed bud, opens when the
// player comes near, and flares when the player steps onto it and the bridge grows.

const DEG = Math.PI / 180;
const CLOSED = 100 * DEG; // petals up and leaning in: a bud with a gap at the top
const OPEN = -2 * DEG; // petals flat on the dais
const HINGE_R = 0.6;
const HINGE_Y = 0.24;
const COUNT = 6;

export class BloomFlower {
  group = new THREE.Group();
  private pivots: THREE.Group[] = [];
  private angle = CLOSED;
  private target = CLOSED;
  private seamMat: THREE.MeshStandardMaterial;
  private coreMat: THREE.MeshStandardMaterial;
  private light: LightSource;
  private lightLocal = new THREE.Vector3(0, 0.8, 0);
  private attached = true;
  private flare = 0;
  private t = Math.random() * 10;
  state: 'closed' | 'open' | 'bloomed' = 'closed';
  onOpen: (() => void) | null = null;

  constructor(model: THREE.Object3D, sets: Record<string, TextureSet>, local: THREE.Vector3, lights: LightPool) {
    this.seamMat = new THREE.MeshStandardMaterial({ color: 0, emissive: SEAM_COLOR, emissiveIntensity: 1.5, roughness: 1 });
    this.coreMat = new THREE.MeshStandardMaterial({ color: 0, emissive: new THREE.Color(0.75, 0.95, 1.0), emissiveIntensity: 2, roughness: 0.4 });
    const surf: Record<string, THREE.Material> = {};
    const matFor = (name: string): THREE.Material => {
      const n = name.split('.')[0];
      if (n === 'glow_cyan') return this.seamMat;
      if (n.startsWith('glow')) return this.coreMat;
      surf[n] ??= buildSurfaceMaterial(n, sets[n] ?? sets.lattice, { skyVis: { value: 1 } });
      return surf[n];
    };
    let petal: THREE.Mesh | null = null;
    const parts = model.clone(true);
    parts.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.material = matFor((m.material as THREE.Material).name);
    });
    for (const c of [...parts.children]) {
      if (c.name.startsWith('petal')) { petal = c as THREE.Mesh; parts.remove(c); }
    }
    this.group.add(parts);
    for (let k = 0; k < COUNT; k++) {
      const a = (k / COUNT) * Math.PI * 2;
      const yaw = new THREE.Group();
      yaw.position.set(Math.cos(a) * HINGE_R, HINGE_Y, Math.sin(a) * HINGE_R);
      yaw.rotation.y = -a; // local +X points away from the center
      const hinge = new THREE.Group();
      yaw.add(hinge);
      if (petal) {
        const p = petal.clone();
        p.position.set(0, 0, 0);
        hinge.add(p);
      }
      this.group.add(yaw);
      this.pivots.push(hinge);
    }
    this.light = lights.add(new THREE.Vector3(), new THREE.Color(0.55, 0.9, 1.0), 0, 9);
    this.group.position.copy(local);
    this.group.traverse((o) => {
      o.layers.enable(DYNAMIC_LAYER);
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; }
    });
    this.apply();
  }

  // Player position in the flower's parent space (island local); null when elsewhere.
  update(dt: number, playerLocal: THREE.Vector3 | null, attached: boolean): void {
    this.t += dt;
    this.attached = attached;
    if (this.state === 'closed' && playerLocal) {
      const d = Math.hypot(playerLocal.x - this.group.position.x, playerLocal.z - this.group.position.z);
      if (d < 12 && Math.abs(playerLocal.y - this.group.position.y) < 4) {
        this.state = 'open';
        this.target = OPEN;
        this.onOpen?.();
      }
    }
    const breathe = this.state === 'closed' ? Math.sin(this.t * 0.9) * 3 * DEG : 0;
    const k = 1 - Math.exp(-dt * (this.state === 'closed' ? 3 : 1.6));
    this.angle += (this.target + breathe - this.angle) * k;
    this.flare = Math.max(0, this.flare - dt * 0.45);
    this.apply();
  }

  bloom(): void {
    this.state = 'bloomed';
    this.target = OPEN;
    this.flare = 1;
  }

  reset(): void {
    this.state = 'closed';
    this.target = CLOSED;
    this.angle = CLOSED;
    this.flare = 0;
    this.apply();
  }

  private apply(): void {
    const lift = this.flare > 0 ? Math.sin(Math.min(1, (1 - this.flare) * 3) * Math.PI) * 10 * DEG : 0;
    this.pivots.forEach((p, i) => {
      // petals do not move in lockstep
      const lag = this.state === 'closed' ? 0 : Math.sin(this.t * 0.7 + i * 1.7) * 0.6 * DEG;
      p.rotation.z = this.angle + lift + lag;
    });
    const open = THREE.MathUtils.clamp(1 - (this.angle - OPEN) / (CLOSED - OPEN), 0, 1);
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 2.1);
    const base = this.state === 'closed' ? 1.2 + pulse * 0.8 : 2.5 + open * 1.5 + pulse * 0.5;
    this.coreMat.emissiveIntensity = base + this.flare * 14;
    this.seamMat.emissiveIntensity = 1.2 + open * 1.4 + this.flare * 5;
    this.light.intensity = this.attached ? open * 3 + this.flare * 40 + (this.state === 'closed' ? pulse * 0.6 : 0) : 0;
    this.group.updateWorldMatrix(true, false);
    this.light.position.copy(this.lightLocal).applyMatrix4(this.group.matrixWorld);
  }
}
