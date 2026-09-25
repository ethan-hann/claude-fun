import * as THREE from 'three';
import { loadModel } from '../engine/level';
import { buildSurfaceMaterial, TextureSet } from '../engine/materials';
import { SEAM_COLOR } from './visuals';

// First-person Graft: sits at the lower right of the view, sways with movement, opens its petals
// when it gives space and closes them when it takes. A beam of motes flows between the lens and
// the target during each action.

function spriteTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}

export class ViewModel {
  root = new THREE.Group();
  model: THREE.Object3D | null = null;
  petals: THREE.Object3D[] = [];
  petalRest: THREE.Quaternion[] = [];
  cells: THREE.MeshStandardMaterial[] = [];
  lensMat: THREE.MeshStandardMaterial | null = null;
  visible = false;
  private bloom = 0; // -1 closed (take) .. +1 open (give)
  private bloomVel = 0;
  private recoil = 0;
  private swayX = 0;
  private swayY = 0;
  private equip = 0; // raise animation
  private beam: THREE.Points;
  private beamPos: Float32Array;
  private beamPhase: Float32Array;
  private beamT = 0;
  private beamDir = 1;
  private beamTarget = new THREE.Vector3();
  private beamMat: THREE.PointsMaterial;
  private tether: THREE.Line;
  private tetherMat: THREE.LineBasicMaterial;
  private lensWorld = new THREE.Vector3();
  heldTarget: THREE.Object3D | null = null;
  private burst: THREE.Points;
  private burstVel: Float32Array;
  private burstT = 0;
  private burstMat: THREE.PointsMaterial;

  constructor(private scene: THREE.Scene, private camera: THREE.PerspectiveCamera) {
    camera.add(this.root);
    const N = 90;
    this.beamPos = new Float32Array(N * 3);
    this.beamPhase = new Float32Array(N).map(() => Math.random());
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.beamPos, 3));
    this.beamMat = new THREE.PointsMaterial({ size: 0.06, map: spriteTexture(), color: new THREE.Color(0.5, 1.4, 1.9), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    this.beam = new THREE.Points(g, this.beamMat);
    this.beam.frustumCulled = false;
    scene.add(this.beam);
    const tg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.tetherMat = new THREE.LineBasicMaterial({ color: new THREE.Color(0.4, 1.1, 1.5), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.tether = new THREE.Line(tg, this.tetherMat);
    this.tether.frustumCulled = false;
    scene.add(this.tether);
    const M = 40;
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(M * 3), 3));
    this.burstVel = new Float32Array(M * 3);
    this.burstMat = new THREE.PointsMaterial({ size: 0.09, map: this.beamMat.map, color: new THREE.Color(0.6, 1.5, 2.0), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    this.burst = new THREE.Points(bg, this.burstMat);
    this.burst.frustumCulled = false;
    scene.add(this.burst);
  }

  async load(sets: Record<string, TextureSet>): Promise<void> {
    const m = await loadModel('glove');
    const cache = new Map<string, THREE.Material>();
    m.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      const mn = (mesh.material as THREE.Material).name.split('.')[0];
      if (mn === 'glow_cyan') {
        const cm = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: SEAM_COLOR, emissiveIntensity: 0.2, roughness: 0.3 });
        mesh.material = cm;
        const i = Number((/cell(\d)/.exec(mesh.name) ?? /cell(\d)/.exec(mesh.parent?.name ?? '') ?? ['', '0'])[1]);
        this.cells[i] = cm;
        return;
      }
      if (mn === 'glow_white') {
        this.lensMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(0.8, 1.0, 1.0), emissiveIntensity: 2, roughness: 0.2 });
        mesh.material = this.lensMat;
        return;
      }
      let mat = cache.get(mn);
      if (!mat) {
        mat = buildSurfaceMaterial(mn, sets[mn] ?? sets.lattice, { skyVis: { value: 0.75 }, uvScale: { value: 1 } });
        cache.set(mn, mat);
      }
      mesh.material = mat;
    });
    m.traverse((o) => {
      if (/^petal\d/.test(o.name)) {
        this.petals.push(o);
        this.petalRest.push(o.quaternion.clone());
      }
    });
    this.model = m;
    // model forward is -Z already (exported Y-up from Blender +Y forward -> game -Z)
    m.position.set(0.2, -0.19, -0.34);
    m.rotation.set(0.05, -0.14, 0.12);
    m.scale.setScalar(0.92);
    this.root.add(m);
    this.root.visible = false;
  }

  show(v: boolean): void {
    if (v && !this.visible) this.equip = 0;
    this.visible = v;
    this.root.visible = v;
  }

  action(kind: 'give' | 'take' | 'fail', target: THREE.Vector3 | null): void {
    if (kind === 'give') { this.bloomVel += 9; this.recoil = 1; }
    if (kind === 'take') { this.bloomVel -= 9; this.recoil = 0.7; }
    if (kind === 'fail') { this.recoil = 0.35; this.bloomVel -= 3; }
    if (target && kind !== 'fail') {
      this.beamT = 0.55;
      this.beamDir = kind === 'give' ? 1 : -1;
      this.beamTarget.copy(target);
      this.startBurst(target, kind === 'give' ? 1 : -1);
    }
  }

  private startBurst(p: THREE.Vector3, dir: number): void {
    const pos = this.burst.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(i, p.x, p.y, p.z);
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar((0.8 + Math.random() * 1.6) * dir);
      this.burstVel[i * 3] = v.x; this.burstVel[i * 3 + 1] = v.y; this.burstVel[i * 3 + 2] = v.z;
    }
    pos.needsUpdate = true;
    this.burstT = 0.7;
  }

  update(dt: number, opts: { cells: number; capacity: number; infinite: boolean; lookDX: number; lookDY: number; speed: number; bob: number; grounded: boolean; aiming: boolean }): void {
    if (!this.model) return;
    this.equip = Math.min(1, this.equip + dt * 1.6);
    // spring for petal bloom
    this.bloomVel += (-this.bloom * 60 - this.bloomVel * 9) * dt;
    this.bloom += this.bloomVel * dt;
    const breathe = Math.sin(performance.now() * 0.0016) * 0.05;
    const open = THREE.MathUtils.clamp(this.bloom + breathe + (opts.aiming ? 0.12 : 0), -0.9, 1.4);
    this.petals.forEach((p, i) => {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -open * 0.55);
      p.quaternion.copy(this.petalRest[i]).multiply(q);
    });
    // cells
    for (let i = 0; i < this.cells.length; i++) {
      const m = this.cells[i];
      if (!m) continue;
      const cap = opts.infinite ? 3 : opts.capacity;
      const on = opts.infinite || i < opts.cells;
      const avail = i < cap;
      const target = !avail ? 0.0 : on ? 5.5 + Math.sin(performance.now() * 0.004 + i) * 0.8 : 0.35;
      m.emissiveIntensity += (target - m.emissiveIntensity) * Math.min(1, dt * 10);
      m.color.setScalar(avail ? 0 : 0.03);
    }
    if (this.lensMat) this.lensMat.emissiveIntensity = 1.5 + Math.max(0, this.bloom) * 6 + this.beamT * 4;
    // sway, bob and recoil
    this.swayX += (-opts.lookDX * 0.0006 - this.swayX) * Math.min(1, dt * 8);
    this.swayY += (opts.lookDY * 0.0006 - this.swayY) * Math.min(1, dt * 8);
    this.recoil = Math.max(0, this.recoil - dt * 4);
    const bob = opts.bob;
    const lower = (1 - this.easeOut(this.equip)) * 0.35;
    this.model.position.set(0.2 + this.swayX + bob * 0.25, -0.19 + this.swayY - Math.abs(bob) * 0.5 - lower, -0.34 + this.recoil * 0.04);
    this.model.rotation.set(0.05 + this.recoil * 0.12 - lower, -0.14 + this.swayX * 0.8, 0.12 + this.swayX * 1.2);
    // beam from the lens to the target
    const lens = this.petals.length ? this.model.localToWorld(new THREE.Vector3(0, 0, 0)) : this.lensWorld;
    this.model.updateWorldMatrix(true, false);
    this.lensWorld.set(0, 0.03, -0.2).applyMatrix4(this.model.matrixWorld);
    void lens;
    this.beamT = Math.max(0, this.beamT - dt);
    const a = this.beamT > 0 ? Math.min(1, this.beamT * 3) : 0;
    this.beamMat.opacity = a;
    if (a > 0) {
      const n = this.beamPhase.length;
      const t = performance.now() * 0.001;
      for (let i = 0; i < n; i++) {
        let f = (this.beamPhase[i] + t * 1.6) % 1;
        if (this.beamDir < 0) f = 1 - f;
        const p = new THREE.Vector3().lerpVectors(this.lensWorld, this.beamTarget, f);
        const w = Math.sin(f * Math.PI) * 0.06;
        p.x += Math.sin(i * 12.9 + t * 7) * w;
        p.y += Math.cos(i * 7.3 + t * 6) * w;
        p.z += Math.sin(i * 3.1 + t * 5) * w;
        this.beamPos[i * 3] = p.x; this.beamPos[i * 3 + 1] = p.y; this.beamPos[i * 3 + 2] = p.z;
      }
      (this.beam.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    }
    // burst at the target
    this.burstT = Math.max(0, this.burstT - dt);
    this.burstMat.opacity = Math.min(1, this.burstT * 2);
    if (this.burstT > 0) {
      const pos = this.burst.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        pos.setXYZ(i, pos.getX(i) + this.burstVel[i * 3] * dt, pos.getY(i) + this.burstVel[i * 3 + 1] * dt, pos.getZ(i) + this.burstVel[i * 3 + 2] * dt);
      }
      pos.needsUpdate = true;
    }
    // tether to a carried object
    const tp = this.tether.geometry.getAttribute('position') as THREE.BufferAttribute;
    if (this.heldTarget && this.visible) {
      const h = this.heldTarget.getWorldPosition(new THREE.Vector3());
      tp.setXYZ(0, this.lensWorld.x, this.lensWorld.y, this.lensWorld.z);
      tp.setXYZ(1, h.x, h.y, h.z);
      tp.needsUpdate = true;
      this.tetherMat.opacity = 0.35 + Math.sin(performance.now() * 0.01) * 0.1;
    } else this.tetherMat.opacity = 0;
  }

  private easeOut(t: number): number { return 1 - Math.pow(1 - t, 3); }
}
