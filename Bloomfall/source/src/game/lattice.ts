import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { Physics, G, groups, SOLID_FILTER } from './physics';
import type { Platform } from './player';
import { DYNAMIC_LAYER } from '../engine/dynshadow';

// Lattice: matter made of held space. The Graft can take space out of it (it shrinks) or give
// space back (it grows). Free lattice (crates, orbs) are physics bodies. Anchored lattice
// (pillars, spans, bulkheads) slide on fixed tracks inside the architecture.

export type LatticeKind = 'crate' | 'orb' | 'pillar' | 'span' | 'bulkhead';

export const FREE_SIZES = [0.5, 1.0, 2.0];
export const FREE_WEIGHTS = [1, 4, 16];
const FREE_MASS = [14, 55, 480];

export type GrowResult = 'ok' | 'max' | 'min' | 'room' | 'busy' | 'locked';

export interface LatticeVisualFactory {
  crate(): THREE.Object3D;
  orb(): THREE.Object3D;
  pillar(w: number, d: number, h: number): THREE.Object3D;
  span(w: number, t: number, l: number): THREE.Object3D;
  bulkhead(w: number, h: number, d: number): THREE.Object3D;
  setGlow(obj: THREE.Object3D, glow: number, highlight: number): void;
  setLevelPips(obj: THREE.Object3D, level: number, levels: number): void;
}

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export abstract class Lattice implements Platform {
  id: string;
  kind: LatticeKind;
  level: number;
  initialLevel: number;
  maxLevel: number;
  minLevel = 0;
  object: THREE.Object3D;
  body!: RAPIER.RigidBody;
  collider!: RAPIER.Collider;
  islandKey = '';
  glow = 0; // flash after a change
  highlight = 0; // targeted by the Graft
  locked = false;
  animating = false;
  protected phys: Physics;
  protected vis: LatticeVisualFactory;

  constructor(phys: Physics, vis: LatticeVisualFactory, id: string, kind: LatticeKind, level: number, maxLevel: number, object: THREE.Object3D) {
    this.phys = phys;
    this.vis = vis;
    this.id = id;
    this.kind = kind;
    this.level = level;
    this.initialLevel = level;
    this.maxLevel = maxLevel;
    this.object = object;
    object.traverse((o) => { o.layers.enable(DYNAMIC_LAYER); (o as THREE.Mesh).castShadow = true; (o as THREE.Mesh).receiveShadow = true; });
  }

  get free(): boolean { return this.kind === 'crate' || this.kind === 'orb'; }

  abstract tryGrow(): GrowResult;
  abstract tryShrink(): GrowResult;
  abstract update(dt: number): void;
  abstract reset(): void;
  abstract weight(): number;
  abstract platformVelocity(point: THREE.Vector3, out: THREE.Vector3): THREE.Vector3;
  abstract label(): string;

  protected register(): void {
    this.phys.owners.set(this.collider.handle, { kind: 'lattice', lattice: this });
  }

  flash(): void { this.glow = 1; }

  updateVisualState(dt: number): void {
    this.glow = Math.max(0, this.glow - dt * 1.4);
    this.vis.setGlow(this.object, this.glow, this.highlight);
    this.vis.setLevelPips(this.object, this.level, this.maxLevel + 1);
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.object);
    this.phys.owners.delete(this.collider.handle);
    this.phys.world.removeRigidBody(this.body);
  }
}

// ------------------------------------------------------------------------------------------
// Free lattice: crates and orbs
// ------------------------------------------------------------------------------------------

interface GrowAnim { t: number; dur: number; fromSize: number; toSize: number; fromPos: THREE.Vector3; toPos: THREE.Vector3; fromRot: THREE.Quaternion; toRot: THREE.Quaternion }

export class FreeLattice extends Lattice {
  spawnPos: THREE.Vector3;
  spawnRot: THREE.Quaternion;
  size: number; // current edge / diameter
  held = false;
  anim: GrowAnim | null = null;
  topVel = new THREE.Vector3(); // velocity of the top surface while growing (for riders)
  prevPos = new THREE.Vector3();
  prevRot = new THREE.Quaternion();
  lastImpact = 0;
  onDropped: (() => void) | null = null;

  constructor(phys: Physics, vis: LatticeVisualFactory, id: string, kind: 'crate' | 'orb', pos: THREE.Vector3, level: number, rotY = 0) {
    super(phys, vis, id, kind, level, 2, kind === 'crate' ? vis.crate() : vis.orb());
    this.spawnPos = pos.clone();
    this.spawnRot = new THREE.Quaternion().setFromAxisAngle(UP, rotY);
    this.size = FREE_SIZES[level];
    const R = phys.R;
    this.body = phys.world.createRigidBody(R.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z)
      .setRotation({ x: this.spawnRot.x, y: this.spawnRot.y, z: this.spawnRot.z, w: this.spawnRot.w })
      .setLinearDamping(0.05).setAngularDamping(kind === 'orb' ? 0.25 : 0.6)
      .setCcdEnabled(true));
    this.collider = phys.world.createCollider(this.shapeDesc(this.size), this.body);
    this.applyMass();
    this.register();
    this.syncObject(1);
    this.prevPos.copy(pos);
    this.prevRot.copy(this.spawnRot);
  }

  private shapeDesc(size: number): RAPIER.ColliderDesc {
    const R = this.phys.R;
    const h = size / 2;
    const d = this.kind === 'crate' ? R.ColliderDesc.roundCuboid(h - 0.02, h - 0.02, h - 0.02, 0.02) : R.ColliderDesc.ball(h);
    d.setCollisionGroups(groups(G.DYNAMIC, SOLID_FILTER)).setFriction(this.kind === 'crate' ? 0.7 : 0.9).setRestitution(0.05);
    d.setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS);
    d.setContactForceEventThreshold(40);
    return d;
  }

  private applyMass(): void {
    const m = FREE_MASS[this.level];
    const h = this.size / 2;
    const inertia = this.kind === 'crate' ? (m * (2 * h) * (2 * h)) / 6 : 0.4 * m * h * h;
    this.collider.setMassProperties(m, { x: 0, y: 0, z: 0 }, { x: inertia, y: inertia, z: inertia }, { x: 0, y: 0, z: 0, w: 1 });
  }

  private setShapeSize(size: number): void {
    const h = size / 2;
    const shape = this.collider.shape as any;
    if (this.kind === 'crate') this.collider.setHalfExtents({ x: h - 0.02, y: h - 0.02, z: h - 0.02 });
    else this.collider.setRadius(h);
    void shape;
  }

  weight(): number { return FREE_WEIGHTS[this.level]; }
  carryable(): boolean { return this.level <= 1 && !this.anim; }
  label(): string { return (this.kind === 'crate' ? 'Lattice crate' : 'Lattice orb'); }

  position(out = new THREE.Vector3()): THREE.Vector3 {
    const t = this.body.translation();
    return out.set(t.x, t.y, t.z);
  }

  rotation(out = new THREE.Quaternion()): THREE.Quaternion {
    const r = this.body.rotation();
    return out.set(r.x, r.y, r.z, r.w);
  }

  // Is something solid right under this object?
  private supported(): boolean {
    const p = this.position();
    const h = this.size / 2;
    const hit = this.phys.castRay(p, new THREE.Vector3(0, -1, 0), h + 0.12, G.STATIC | G.SCREEN | G.KINEMATIC | G.DYNAMIC, this.collider);
    return !!hit;
  }

  private uprightRotation(): THREE.Quaternion {
    if (this.kind === 'orb') return this.rotation();
    // keep the yaw, drop any tilt
    const q = this.rotation();
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    // choose the local axis closest to horizontal for the yaw reference
    const axes = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)].map((a) => a.applyQuaternion(q));
    let best = axes[0];
    for (const a of axes) if (Math.abs(a.y) < Math.abs(best.y)) best = a;
    void fwd;
    const yaw = Math.atan2(best.x, best.z);
    return new THREE.Quaternion().setFromAxisAngle(UP, yaw);
  }

  // Find where an object of the given size fits, near the current spot. Static geometry,
  // screens and anchored lattice must be clear; other free objects will be pushed aside.
  private findFit(size: number, rot: THREE.Quaternion, pivotBottom: boolean): THREE.Vector3 | null {
    const p = this.position();
    const h = size / 2;
    const base = pivotBottom ? new THREE.Vector3(p.x, p.y - this.size / 2 + h + 0.005, p.z) : p.clone();
    const mask = G.STATIC | G.SCREEN | G.KINEMATIC;
    const half = new THREE.Vector3(h, h, h);
    const test = (c: THREE.Vector3) => (this.kind === 'crate'
      ? !this.phys.boxOverlaps(c, half, rot, mask, this.collider, 0.03)
      : !this.phys.ballOverlaps(c, h, mask, this.collider));
    if (test(base)) return base;
    const offsets: THREE.Vector3[] = [];
    const steps = [0.25, 0.5, 0.75, 1.0];
    for (const s of steps) {
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.707, 0.707], [-0.707, 0.707], [0.707, -0.707], [-0.707, -0.707]]) {
        offsets.push(new THREE.Vector3(dx * s, 0, dz * s));
      }
      offsets.push(new THREE.Vector3(0, s, 0));
    }
    for (const up of [0, 0.25, 0.5]) {
      for (const o of offsets) {
        const c = base.clone().add(o);
        c.y += up;
        if (test(c)) return c;
      }
    }
    return null;
  }

  tryGrow(): GrowResult {
    if (this.locked) return 'locked';
    if (this.anim) return 'busy';
    if (this.level >= this.maxLevel) return 'max';
    const toSize = FREE_SIZES[this.level + 1];
    const rot = this.uprightRotation();
    const pos = this.findFit(toSize, rot, !this.held && this.supported());
    if (!pos) return 'room';
    this.level++;
    this.startAnim(toSize, pos, rot);
    return 'ok';
  }

  tryShrink(): GrowResult {
    if (this.locked) return 'locked';
    if (this.anim) return 'busy';
    if (this.level <= this.minLevel) return 'min';
    const toSize = FREE_SIZES[this.level - 1];
    const p = this.position();
    const rot = this.uprightRotation();
    const pos = (!this.held && this.supported()) ? new THREE.Vector3(p.x, p.y - this.size / 2 + toSize / 2 + 0.005, p.z) : p;
    this.level--;
    this.startAnim(toSize, pos, rot);
    return 'ok';
  }

  private startAnim(toSize: number, toPos: THREE.Vector3, toRot: THREE.Quaternion): void {
    this.anim = { t: 0, dur: 0.5, fromSize: this.size, toSize, fromPos: this.position(), toPos, fromRot: this.rotation(), toRot };
    this.body.setBodyType(this.phys.R.RigidBodyType.KinematicPositionBased, true);
    this.animating = true;
    this.flash();
  }

  update(dt: number): void {
    this.prevPos.copy(this.position());
    this.prevRot.copy(this.rotation());
    this.topVel.set(0, 0, 0);
    if (this.anim) {
      const a = this.anim;
      const prevT = a.t;
      a.t = Math.min(1, a.t + dt / a.dur);
      const e = easeInOut(a.t);
      const ePrev = easeInOut(prevT);
      const size = THREE.MathUtils.lerp(a.fromSize, a.toSize, e);
      const pos = new THREE.Vector3().lerpVectors(a.fromPos, a.toPos, e);
      const rot = new THREE.Quaternion().slerpQuaternions(a.fromRot, a.toRot, e);
      this.size = size;
      this.setShapeSize(size);
      this.body.setNextKinematicTranslation(pos);
      this.body.setNextKinematicRotation(rot);
      // velocity of the top face, used to carry riders
      const prevTop = THREE.MathUtils.lerp(a.fromPos.y, a.toPos.y, ePrev) + THREE.MathUtils.lerp(a.fromSize, a.toSize, ePrev) / 2;
      const top = pos.y + size / 2;
      const prevPos = new THREE.Vector3().lerpVectors(a.fromPos, a.toPos, ePrev);
      this.topVel.set((pos.x - prevPos.x) / dt, (top - prevTop) / dt, (pos.z - prevPos.z) / dt);
      if (a.t >= 1) {
        this.anim = null;
        this.animating = false;
        this.size = a.toSize;
        this.setShapeSize(this.size);
        this.body.setBodyType(this.phys.R.RigidBodyType.Dynamic, true);
        this.body.setTranslation(a.toPos, true);
        this.body.setRotation(a.toRot, true);
        this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        this.applyMass();
      }
    }
    this.updateVisualState(dt);
  }

  // Render-time transform, interpolated between physics steps.
  syncObject(alpha: number): void {
    const p = this.position();
    const r = this.rotation();
    if (alpha < 1) {
      p.lerpVectors(this.prevPos, p, alpha);
      r.slerpQuaternions(this.prevRot, r, alpha);
    }
    this.object.position.copy(p);
    this.object.quaternion.copy(r);
    this.object.scale.setScalar(this.size);
  }

  platformVelocity(point: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    if (this.anim) return out.copy(this.topVel);
    const v = this.body.linvel();
    return out.set(v.x, Math.max(v.y, 0) * 0 + v.y, v.z);
  }

  reset(): void {
    this.anim = null;
    this.animating = false;
    this.held = false;
    this.level = this.initialLevel;
    this.size = FREE_SIZES[this.level];
    this.body.setBodyType(this.phys.R.RigidBodyType.Dynamic, true);
    this.setShapeSize(this.size);
    this.applyMass();
    this.respawn(true);
  }

  // Back to the spawn point (after falling into the void). Keeps the current size unless reset.
  respawn(keepLevel = false): void {
    void keepLevel;
    const p = this.spawnPos.clone();
    // spawn points are authored for the initial size; lift the object so a larger one clears the floor
    p.y += (this.size - FREE_SIZES[this.initialLevel]) / 2 + 0.02;
    this.body.setTranslation(p, true);
    this.body.setRotation(this.spawnRot, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.prevPos.copy(p);
    this.prevRot.copy(this.spawnRot);
    this.flash();
  }
}

// ------------------------------------------------------------------------------------------
// Anchored lattice: moves along a fixed track between level positions.
// ------------------------------------------------------------------------------------------

export class AnchoredLattice extends Lattice {
  // Level i places the body at base + axis * offsets[i].
  base: THREE.Vector3;
  axis: THREE.Vector3;
  offsets: number[];
  half: THREE.Vector3;
  rot: THREE.Quaternion;
  offset: number; // current
  speed: number;
  private vel = new THREE.Vector3();
  private prev = new THREE.Vector3();
  names: string;

  constructor(phys: Physics, vis: LatticeVisualFactory, id: string, kind: 'pillar' | 'span' | 'bulkhead', object: THREE.Object3D,
    base: THREE.Vector3, axis: THREE.Vector3, offsets: number[], level: number, half: THREE.Vector3, rotY: number, speed = 2.4) {
    super(phys, vis, id, kind, level, offsets.length - 1, object);
    this.base = base.clone();
    this.axis = axis.clone().normalize();
    this.offsets = offsets;
    this.half = half.clone();
    this.rot = new THREE.Quaternion().setFromAxisAngle(UP, rotY);
    this.offset = offsets[level];
    this.speed = speed;
    this.names = kind === 'pillar' ? 'Lattice pillar' : kind === 'span' ? 'Lattice span' : 'Lattice bulkhead';
    const R = phys.R;
    const p = this.positionFor(this.offset);
    this.body = phys.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(p.x, p.y, p.z)
      .setRotation({ x: this.rot.x, y: this.rot.y, z: this.rot.z, w: this.rot.w }));
    const cd = R.ColliderDesc.cuboid(half.x, half.y, half.z)
      .setCollisionGroups(groups(G.KINEMATIC, SOLID_FILTER)).setFriction(0.9);
    this.collider = phys.world.createCollider(cd, this.body);
    this.register();
    this.object.position.copy(p);
    this.object.quaternion.copy(this.rot);
    this.prev.copy(p);
  }

  positionFor(offset: number, out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(this.base).addScaledVector(this.axis, offset);
  }

  weight(): number { return 0; }
  label(): string { return this.names; }

  // Would moving to `offset` push into static geometry or other anchored lattice?
  private sweepBlocked(from: number, to: number): boolean {
    if (to <= from) return false; // retracting frees space
    const steps = Math.max(1, Math.ceil((to - from) / 0.25));
    for (let i = 1; i <= steps; i++) {
      const o = from + ((to - from) * i) / steps;
      const p = this.positionFor(o);
      if (this.phys.boxOverlaps(p, this.half, this.rot, G.STATIC | G.SCREEN | G.KINEMATIC, this.collider, 0.04)) return true;
    }
    return false;
  }

  tryGrow(): GrowResult {
    if (this.locked) return 'locked';
    if (this.level >= this.maxLevel) return 'max';
    if (this.sweepBlocked(this.offset, this.offsets[this.level + 1])) return 'room';
    this.level++;
    this.flash();
    return 'ok';
  }

  tryShrink(): GrowResult {
    if (this.locked) return 'locked';
    if (this.level <= this.minLevel) return 'min';
    this.level--;
    this.flash();
    return 'ok';
  }

  update(dt: number): void {
    const target = this.offsets[this.level];
    const cur = this.positionFor(this.offset);
    this.prev.copy(cur);
    const d = target - this.offset;
    if (Math.abs(d) > 1e-4) {
      const stepLen = Math.min(Math.abs(d), this.speed * dt);
      this.offset += Math.sign(d) * stepLen;
      this.animating = true;
    } else {
      this.offset = target;
      this.animating = false;
    }
    const p = this.positionFor(this.offset);
    this.vel.subVectors(p, this.prev).divideScalar(dt);
    this.body.setNextKinematicTranslation(p);
    this.updateVisualState(dt);
  }

  syncObject(alpha: number): void {
    const p = this.positionFor(this.offset);
    this.object.position.lerpVectors(this.prev, p, alpha);
  }

  platformVelocity(_point: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.vel);
  }

  reset(): void {
    this.level = this.initialLevel;
    this.offset = this.offsets[this.level];
    const p = this.positionFor(this.offset);
    this.body.setTranslation(p, true);
    this.body.setNextKinematicTranslation(p);
    this.prev.copy(p);
    this.object.position.copy(p);
    this.flash();
  }
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export function isLatticeCollider(phys: Physics, c: RAPIER.Collider | null | undefined): Lattice | null {
  if (!c) return null;
  const o = phys.owners.get(c.handle);
  return o && o.kind === 'lattice' ? (o.lattice as Lattice) : null;
}

void _q; void _v;
