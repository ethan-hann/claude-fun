import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { Physics, G, groups, SOLID_FILTER } from './physics';
import { buildSurfaceMaterial, TextureSet } from '../engine/materials';
import { DYNAMIC_LAYER } from '../engine/dynshadow';
import { SEAM_COLOR } from './visuals';
import type { Platform } from './player';

// A bloom bridge: plates of lattice unfold one after another from the end of one island to the
// start of the next. After the player crosses, the plates fall away.

const SEG_LEN = 1.9;
const WIDTH = 2.7;
const THICK = 0.28;

interface Seg {
  pivot: THREE.Group; // hinge at the near edge
  mesh: THREE.Object3D;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  center: THREE.Vector3;
  quat: THREE.Quaternion;
  t: number; // unfold progress
  delay: number;
  fall: { v: THREE.Vector3; w: THREE.Vector3; t: number } | null;
}

export class Bridge implements Platform {
  segs: Seg[] = [];
  from: THREE.Vector3;
  to: THREE.Vector3;
  state: 'folded' | 'growing' | 'open' | 'falling' | 'gone' = 'folded';
  onSegment: ((i: number, p: THREE.Vector3) => void) | null = null;
  private phys: Physics;
  private scene: THREE.Scene;
  private seamMats: THREE.MeshStandardMaterial[] = [];
  private time = 0;

  constructor(phys: Physics, scene: THREE.Scene, from: THREE.Vector3, to: THREE.Vector3, sets: Record<string, TextureSet>, model: THREE.Object3D | null) {
    this.phys = phys;
    this.scene = scene;
    this.from = from.clone();
    this.to = to.clone();
    const d = to.clone().sub(from);
    const flat = new THREE.Vector3(d.x, 0, d.z);
    const hlen = flat.length();
    const n = Math.max(2, Math.round(hlen / SEG_LEN));
    const yaw = Math.atan2(flat.x, flat.z);
    const plateMat = buildSurfaceMaterial('lattice', sets.lattice ?? null, { skyVis: { value: 1 } });
    const trimMat = buildSurfaceMaterial('steel', sets.steel ?? null, { skyVis: { value: 1 } });
    for (let i = 0; i < n; i++) {
      const a = from.clone().lerp(to, i / n);
      const b = from.clone().lerp(to, (i + 1) / n);
      // a gentle sag in the middle, like a rope bridge of plates
      const sag = (k: number) => -Math.sin(Math.PI * k) * Math.min(1.2, hlen * 0.02);
      a.y += sag(i / n);
      b.y += sag((i + 1) / n);
      const seg = b.clone().sub(a);
      const len = seg.length();
      const pitch = Math.asin(THREE.MathUtils.clamp(seg.y / len, -1, 1));
      const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-pitch, yaw, 0, 'YXZ'));
      const center = a.clone().add(b).multiplyScalar(0.5).add(new THREE.Vector3(0, -THICK / 2, 0).applyQuaternion(quat));
      const pivot = new THREE.Group();
      pivot.position.copy(a).add(new THREE.Vector3(0, -THICK / 2, 0).applyQuaternion(quat));
      pivot.quaternion.copy(quat);
      let mesh: THREE.Object3D;
      if (model) {
        mesh = model.clone(true);
        mesh.scale.set(WIDTH, 1, len * 1.02);
        mesh.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          const name = (m.material as THREE.Material).name;
          if (name.startsWith('glow')) {
            const g = new THREE.MeshStandardMaterial({ color: 0, emissive: SEAM_COLOR, emissiveIntensity: 3, roughness: 1 });
            this.seamMats.push(g);
            m.material = g;
          } else m.material = name.startsWith('steel') ? trimMat : plateMat;
        });
      } else {
        const g = new THREE.Group();
        const slab = new THREE.Mesh(new THREE.BoxGeometry(WIDTH, THICK, len * 1.02), plateMat);
        g.add(slab);
        const seam = new THREE.MeshStandardMaterial({ color: 0, emissive: SEAM_COLOR, emissiveIntensity: 3, roughness: 1 });
        this.seamMats.push(seam);
        for (const sx of [-1, 1]) {
          const s = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, len * 0.9), seam);
          s.position.set(sx * (WIDTH / 2 - 0.12), THICK / 2 + 0.01, 0);
          g.add(s);
          const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.1), trimMat);
          rail.position.set(sx * (WIDTH / 2 - 0.05), 0.45, -len / 2 + 0.1);
          g.add(rail);
        }
        mesh = g;
      }
      mesh.position.set(0, 0, len / 2);
      pivot.add(mesh);
      pivot.traverse((o) => { o.layers.enable(DYNAMIC_LAYER); (o as THREE.Mesh).castShadow = true; (o as THREE.Mesh).receiveShadow = true; });
      pivot.visible = false;
      scene.add(pivot);
      const body = phys.world.createRigidBody(phys.R.RigidBodyDesc.kinematicPositionBased().setTranslation(center.x, center.y - 50, center.z)
        .setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w }));
      const collider = phys.world.createCollider(phys.R.ColliderDesc.cuboid(WIDTH / 2, THICK / 2, len / 2 + 0.03)
        .setCollisionGroups(groups(G.KINEMATIC, SOLID_FILTER)).setFriction(1.0), body);
      phys.owners.set(collider.handle, { kind: 'platform', platform: this });
      this.segs.push({ pivot, mesh, body, collider, center, quat, t: 0, delay: i * 0.11, fall: null });
    }
  }

  grow(): void {
    if (this.state !== 'folded') return;
    this.state = 'growing';
    this.time = 0;
  }

  // Open instantly (used when continuing a saved game).
  openNow(): void {
    this.state = 'open';
    for (const s of this.segs) {
      s.t = 1;
      s.pivot.visible = true;
      s.pivot.rotation.set(0, 0, 0);
      s.pivot.quaternion.copy(s.quat);
      s.body.setNextKinematicTranslation(s.center);
      s.body.setTranslation(s.center, true);
    }
  }

  collapse(): void {
    if (this.state === 'gone' || this.state === 'falling') return;
    this.state = 'falling';
    this.time = 0;
    this.segs.forEach((s, i) => {
      s.delay = (this.segs.length - 1 - i) * 0.09 + Math.random() * 0.05;
      s.fall = null;
    });
  }

  get length(): number { return this.from.distanceTo(this.to); }

  update(dt: number): void {
    this.time += dt;
    for (const s of this.segs) s.mesh.userData.phase = (s.mesh.userData.phase ?? 0) + dt;
    if (this.state === 'growing') {
      let done = true;
      this.segs.forEach((s, i) => {
        if (this.time < s.delay) { done = false; return; }
        if (s.t === 0) {
          s.pivot.visible = true;
          this.onSegment?.(i, s.center);
        }
        s.t = Math.min(1, s.t + dt / 0.45);
        const e = 1 - Math.pow(1 - s.t, 3);
        // unfold: rotate up from hanging down around the near edge
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (1 - e) * 1.45);
        s.pivot.quaternion.copy(s.quat).multiply(q);
        s.pivot.scale.setScalar(0.3 + 0.7 * e);
        if (s.t >= 1) s.body.setNextKinematicTranslation(s.center);
        else done = false;
      });
      if (done) this.state = 'open';
    } else if (this.state === 'falling') {
      let all = true;
      for (const s of this.segs) {
        if (this.time < s.delay) { all = false; continue; }
        if (!s.fall) {
          s.fall = { v: new THREE.Vector3((Math.random() - 0.5) * 0.6, -0.5, (Math.random() - 0.5) * 0.6), w: new THREE.Vector3((Math.random() - 0.5) * 1.2, 0, (Math.random() - 0.5) * 1.2), t: 0 };
          s.body.setNextKinematicTranslation(new THREE.Vector3(0, -500, 0));
        }
        s.fall.t += dt;
        s.fall.v.y -= 9.8 * dt;
        s.pivot.position.addScaledVector(s.fall.v, dt);
        s.pivot.rotation.x += s.fall.w.x * dt;
        s.pivot.rotation.z += s.fall.w.z * dt;
        if (s.fall.t < 6) all = false;
        else s.pivot.visible = false;
      }
      if (all) this.state = 'gone';
    }
    const glow = this.state === 'growing' ? 6 : 2.6 + Math.sin(this.time * 1.3) * 0.4;
    for (const m of this.seamMats) m.emissiveIntensity = glow;
  }

  platformVelocity(_p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 { return out.set(0, 0, 0); }

  dispose(): void {
    for (const s of this.segs) {
      this.scene.remove(s.pivot);
      this.phys.owners.delete(s.collider.handle);
      this.phys.world.removeRigidBody(s.body);
    }
    this.segs = [];
  }
}
