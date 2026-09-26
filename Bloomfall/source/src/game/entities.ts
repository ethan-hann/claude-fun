import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { Physics, G, groups, SOLID_FILTER, v3 } from './physics';
import { FreeLattice, Lattice } from './lattice';
import type { Player, Platform } from './player';
import type { EntityRec } from '../engine/assets';
import { buildSurfaceMaterial, TextureSet } from '../engine/materials';
import { DYNAMIC_LAYER } from '../engine/dynshadow';
import type { LightPool, LightSource } from '../engine/lightpool';

export interface EntityContext {
  phys: Physics;
  scene: THREE.Scene;
  player: Player;
  lattices: Map<string, Lattice>;
  entities: Map<string, Entity>;
  sets: Record<string, TextureSet>;
  emit: (event: string, data?: any) => void;
  origin: THREE.Vector3;
  lights?: LightPool;
}

export abstract class Entity {
  id: string;
  rec: EntityRec;
  islandKey = '';
  constructor(rec: EntityRec) {
    this.id = rec.id ?? '';
    this.rec = rec;
  }
  fixedUpdate(_dt: number, _ctx: EntityContext): void {}
  frameUpdate(_dt: number, _alpha: number, _ctx: EntityContext): void {}
  reset(_ctx: EntityContext): void {}
  get active(): boolean { return false; }
}

function mat(ctx: EntityContext, key: string): THREE.MeshStandardMaterial {
  return buildSurfaceMaterial(key, ctx.sets[key] ?? null, { skyVis: { value: 1 } });
}

function dyn(obj: THREE.Object3D): THREE.Object3D {
  obj.traverse((o) => { o.layers.enable(DYNAMIC_LAYER); (o as THREE.Mesh).castShadow = true; (o as THREE.Mesh).receiveShadow = true; });
  return obj;
}

// ------------------------------------------------------------------------------------------
// Pressure plate: a ring of notches shows how much weight it needs; lit notches show how much
// is on it now. Weight is summed through stacks (a crate on a crate on the plate counts).
// ------------------------------------------------------------------------------------------
export class Plate extends Entity {
  pos: THREE.Vector3;
  radius: number;
  threshold: number;
  weight = 0;
  shown = 0;
  private top: THREE.Mesh;
  private notches: THREE.InstancedMesh;
  private notchMat: THREE.MeshStandardMaterial;
  private on = false;
  private sensorShape: RAPIER.Cylinder;

  constructor(rec: EntityRec, ctx: EntityContext) {
    super(rec);
    this.pos = v3(rec.p).add(ctx.origin);
    this.radius = rec.r ?? 0.9;
    this.threshold = rec.threshold ?? 4;
    const topMat = mat(ctx, 'plates');
    topMat.roughness = 2.2;
    topMat.color.setScalar(0.45);
    // A thin top on a flat base: plates have no collider, so whatever stands on one rests on the
    // floor, and a thick plate would swallow the bottom of it.
    this.top = new THREE.Mesh(new THREE.CylinderGeometry(this.radius * 0.86, this.radius * 0.9, 0.024, 48), topMat);
    this.top.position.copy(this.pos).add(new THREE.Vector3(0, 0.004, 0));
    ctx.scene.add(dyn(this.top));
    const n = this.threshold;
    this.notchMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveIntensity: 1, roughness: 1, metalness: 0 });
    this.notches = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.02, 0.16), this.notchMat, n);
    const m = new THREE.Matrix4();
    const ringR = this.radius * 0.96;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.PI / n;
      m.makeRotationY(-a);
      m.setPosition(this.pos.x + Math.cos(a) * ringR, this.pos.y + 0.01, this.pos.z + Math.sin(a) * ringR);
      this.notches.setMatrixAt(i, m);
      this.notches.setColorAt(i, new THREE.Color(0.1, 0.1, 0.1));
    }
    ctx.scene.add(this.notches);
    this.sensorShape = new ctx.phys.R.Cylinder(0.35, this.radius * 0.85);
  }

  get active(): boolean { return this.on; }

  fixedUpdate(_dt: number, ctx: EntityContext): void {
    const phys = ctx.phys;
    const touching = new Set<number>();
    const c = this.pos.clone().add(new THREE.Vector3(0, 0.35, 0));
    phys.world.intersectionsWithShape(c, { x: 0, y: 0, z: 0, w: 1 }, this.sensorShape, (col) => { touching.add(col.handle); return true; },
      undefined, groups(0xffff, G.DYNAMIC | G.PLAYER | G.HELD));
    // Stacks: walk up through contacts to anything resting on top.
    const onPlate = new Set<number>(touching);
    const queue = [...touching];
    while (queue.length) {
      const h = queue.pop()!;
      const col = phys.world.getCollider(h);
      if (!col) continue;
      const cy = col.translation().y;
      phys.world.contactPairsWith(col, (other) => {
        if (onPlate.has(other.handle)) return;
        const o = phys.owners.get(other.handle);
        if (!o || (o.kind !== 'lattice' && o.kind !== 'player')) return;
        if (o.kind === 'lattice' && !(o.lattice as Lattice).free) return;
        if (other.translation().y > cy + 0.1) { onPlate.add(other.handle); queue.push(other.handle); }
      });
    }
    // the player rides on top of stacks through the character controller, not contacts
    const p = ctx.player;
    let w = 0;
    let playerOn = false;
    for (const h of onPlate) {
      const o = phys.owners.get(h);
      if (!o) continue;
      if (o.kind === 'player') playerOn = true;
      else if (o.kind === 'lattice') {
        const l = o.lattice as FreeLattice;
        if (!l.held) w += l.weight();
      }
    }
    if (!playerOn && p.grounded && p.groundCollider && onPlate.has(p.groundCollider.handle)) playerOn = true;
    if (playerOn) w += 4;
    this.weight = w;
    const was = this.on;
    this.on = w >= this.threshold;
    if (this.on !== was) ctx.emit(this.on ? 'plate-on' : 'plate-off', this);
  }

  frameUpdate(dt: number): void {
    this.shown += (Math.min(this.weight, this.threshold) - this.shown) * Math.min(1, dt * 10);
    const lit = Math.round(this.shown);
    const onCol = new THREE.Color(0.45, 0.9, 1.0);
    const litCol = new THREE.Color(1.0, 0.62, 0.3);
    const offCol = new THREE.Color(0.05, 0.05, 0.06);
    for (let i = 0; i < this.threshold; i++) {
      this.notches.setColorAt(i, this.on ? onCol : i < lit ? litCol : offCol);
    }
    this.notches.instanceColor!.needsUpdate = true;
    this.notchMat.emissiveIntensity = this.on ? 5 : 3;
    const target = this.pos.y + 0.004 - (this.weight > 0 ? 0.01 : 0);
    this.top.position.y += (target - this.top.position.y) * Math.min(1, dt * 12);
  }
}

// ------------------------------------------------------------------------------------------
// Cradle: a lens holder in the Observatory's great instrument, a round hole in the dais. It holds
// while a lattice orb rests in it; its ring lights when it does.
// ------------------------------------------------------------------------------------------
export class Cradle extends Entity {
  pos: THREE.Vector3; // center of the hole's rim
  radius: number;
  private on = false;
  private ringMat: THREE.MeshStandardMaterial;
  private glow = 0;

  constructor(rec: EntityRec, ctx: EntityContext) {
    super(rec);
    this.pos = v3(rec.p).add(ctx.origin);
    this.radius = rec.r ?? 0.4;
    this.ringMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(0.35, 0.85, 1.0), emissiveIntensity: 1.2, roughness: 1 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(this.radius + 0.07, 0.03, 8, 48), this.ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.copy(this.pos).add(new THREE.Vector3(0, 0.012, 0));
    ctx.scene.add(ring);
  }

  get active(): boolean { return this.on; }

  fixedUpdate(_dt: number, ctx: EntityContext): void {
    let on = false;
    let near: FreeLattice | null = null;
    let nearD = Infinity;
    for (const l of ctx.lattices.values()) {
      if (!l.free || l.kind !== 'orb' || l.islandKey !== this.islandKey) continue;
      const f = l as FreeLattice;
      if (f.held) continue;
      const p = f.position();
      const d = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
      if (d < this.radius && p.y < this.pos.y + 0.2 && p.y > this.pos.y - 1.0) { on = true; break; }
      if (f.level === 0 && !f.anim && d < nearD && p.y > this.pos.y - 0.3 && p.y < this.pos.y + 1.2) { near = f; nearD = d; }
    }
    // An empty cradle draws in a small orb left beside it: up over the rim and into the cup.
    if (!on && near && nearD < 1.0) this.pull(near);
    if (on !== this.on) {
      this.on = on;
      ctx.emit(on ? 'cradle-on' : 'cradle-off', this);
    }
  }

  private pull(f: FreeLattice): void {
    const p = f.position();
    const dx = this.pos.x - p.x;
    const dz = this.pos.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return;
    const speed = Math.min(1.4, d * 3.0);
    const v = f.body.linvel();
    // outside the rim, hold the orb's underside a little above it; inside, let it settle
    const vy = d > 0.3 ? THREE.MathUtils.clamp((this.pos.y + 0.33 - p.y) * 6.0, -1.5, 2.0) : v.y;
    f.body.setLinvel({ x: (dx / d) * speed, y: vy, z: (dz / d) * speed }, true);
    f.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  frameUpdate(dt: number): void {
    this.glow += ((this.on ? 1 : 0) - this.glow) * Math.min(1, dt * 4);
    this.ringMat.emissive.setRGB(0.35 + 0.65 * this.glow, 0.85 - 0.05 * this.glow, 1.0 - 0.45 * this.glow);
    this.ringMat.emissiveIntensity = 1.2 + 5.0 * this.glow;
  }

  reset(): void { this.on = false; }
}

// ------------------------------------------------------------------------------------------
// Door: a heavy slab that slides open while every linked plate (or lattice condition) holds.
// ------------------------------------------------------------------------------------------
export class Door extends Entity implements Platform {
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  mesh: THREE.Object3D;
  closedPos: THREE.Vector3;
  openPos: THREE.Vector3;
  t = 0; // 0 closed .. 1 open
  openIf: string[];
  half: THREE.Vector3;
  rot: THREE.Quaternion;
  latched = false;
  latch: boolean;
  private vel = new THREE.Vector3();
  private prev = new THREE.Vector3();
  private lights: THREE.MeshStandardMaterial;
  isOpen = false;

  constructor(rec: EntityRec, ctx: EntityContext) {
    super(rec);
    const size = v3(rec.size);
    this.half = size.clone().multiplyScalar(0.5);
    this.rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rec.ry ?? 0);
    this.closedPos = v3(rec.p).add(ctx.origin).add(new THREE.Vector3(0, this.half.y, 0));
    const mode = rec.mode ?? 'up';
    const travel = rec.travel ?? size.y - 0.15;
    const dir = mode === 'up' ? new THREE.Vector3(0, 1, 0) : mode === 'down' ? new THREE.Vector3(0, -1, 0)
      : new THREE.Vector3(mode === 'left' ? -1 : 1, 0, 0).applyQuaternion(this.rot);
    this.openPos = this.closedPos.clone().addScaledVector(dir, travel);
    this.openIf = rec.openIf ?? [];
    this.latch = !!rec.latch;
    const R = ctx.phys.R;
    this.body = ctx.phys.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(this.closedPos.x, this.closedPos.y, this.closedPos.z)
      .setRotation({ x: this.rot.x, y: this.rot.y, z: this.rot.z, w: this.rot.w }));
    const screen = !!rec.screen;
    this.collider = ctx.phys.world.createCollider(R.ColliderDesc.cuboid(this.half.x, this.half.y, this.half.z)
      .setCollisionGroups(groups(screen ? G.SCREEN : G.KINEMATIC, SOLID_FILTER)), this.body);
    ctx.phys.owners.set(this.collider.handle, { kind: 'door', door: this });
    const g = new THREE.Group();
    if (screen) {
      // perforated panel in a steel frame: the Graft passes through, bodies do not
      const panel = new THREE.Mesh(new THREE.BoxGeometry(size.x - 0.2, size.y - 0.2, 0.03), mat(ctx, 'screen'));
      g.add(panel);
      const frameMat = mat(ctx, 'steel');
      for (const [w, h, x, y] of [[size.x, 0.12, 0, size.y / 2 - 0.06], [size.x, 0.12, 0, -size.y / 2 + 0.06], [0.12, size.y, -size.x / 2 + 0.06, 0], [0.12, size.y, size.x / 2 - 0.06, 0]]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, size.z), frameMat);
        bar.position.set(x, y, 0);
        g.add(bar);
      }
    } else {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), mat(ctx, 'plates'));
      g.add(slab);
    }
    this.lights = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff5a2a, emissiveIntensity: 3, roughness: 1 });
    for (const sx of [-1, 1]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.06, size.y * 0.7, size.z + 0.02), this.lights);
      strip.position.x = sx * (size.x / 2 - 0.18);
      g.add(strip);
    }
    g.position.copy(this.closedPos);
    g.quaternion.copy(this.rot);
    this.mesh = dyn(g);
    ctx.scene.add(g);
    this.prev.copy(this.closedPos);
  }

  get active(): boolean { return this.isOpen; }

  wantOpen(ctx: EntityContext): boolean {
    if (this.latched) return true;
    if (!this.openIf.length) return false;
    for (const id of this.openIf) {
      const e = ctx.entities.get(id);
      if (!e || !e.active) return false;
    }
    return true;
  }

  fixedUpdate(dt: number, ctx: EntityContext): void {
    const want = this.wantOpen(ctx);
    if (want && this.latch) this.latched = true;
    const target = want ? 1 : 0;
    const travel = this.closedPos.distanceTo(this.openPos);
    const speed = (want ? (this.rec.openSpeed ?? 2.2) : (this.rec.closeSpeed ?? 1.6)) / Math.max(travel, 0.1);
    const before = this.t;
    if (this.t < target) this.t = Math.min(target, this.t + speed * dt);
    else if (this.t > target) {
      // do not crush the player
      const next = Math.max(target, this.t - speed * dt);
      const p = new THREE.Vector3().lerpVectors(this.closedPos, this.openPos, next);
      if (ctx.phys.boxOverlaps(p, this.half, this.rot, G.PLAYER, undefined, 0.0)) this.t = Math.min(1, this.t + speed * dt);
      else this.t = next;
    }
    const e = this.t * this.t * (3 - 2 * this.t);
    const p = new THREE.Vector3().lerpVectors(this.closedPos, this.openPos, e);
    this.prev.copy(this.body.translation() as THREE.Vector3);
    this.vel.copy(p).sub(this.prev).divideScalar(dt);
    this.body.setNextKinematicTranslation(p);
    const wasOpen = this.isOpen;
    this.isOpen = this.t > 0.95;
    if (before === 0 && this.t > 0) ctx.emit('door-move', this);
    if (before > 0 && this.t === 0) ctx.emit('door-shut', this);
    if (this.isOpen && !wasOpen) ctx.emit('door-open', this);
  }

  frameUpdate(_dt: number, alpha: number): void {
    const t = this.body.translation();
    this.mesh.position.lerpVectors(this.prev, new THREE.Vector3(t.x, t.y, t.z), alpha);
    this.lights.emissive.setHex(this.t > 0.02 ? 0x55e6ff : 0xff5a2a);
  }

  platformVelocity(_p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 { return out.copy(this.vel); }

  reset(): void {
    this.t = 0;
    this.latched = false;
    this.body.setTranslation(this.closedPos, true);
    this.prev.copy(this.closedPos);
  }
}

// ------------------------------------------------------------------------------------------
// Zones: trigger a callback once when the player enters.
// ------------------------------------------------------------------------------------------
export class Zone extends Entity {
  center: THREE.Vector3;
  radius: number;
  height: number;
  box: [number, number] | null; // half extents in x and z; a cylinder when null
  grounded: boolean; // only counts while the player stands on something
  fired = false;
  inside = false;
  constructor(rec: EntityRec, ctx: EntityContext) {
    super(rec);
    this.center = v3(rec.p).add(ctx.origin);
    this.radius = rec.r ?? 2;
    this.height = rec.h ?? 4;
    this.box = rec.size ? [rec.size[0] / 2, rec.size[1] / 2] : null;
    this.grounded = !!rec.grounded;
  }
  contains(p: THREE.Vector3): boolean {
    const dx = p.x - this.center.x, dz = p.z - this.center.z;
    const flat = this.box ? Math.abs(dx) <= this.box[0] && Math.abs(dz) <= this.box[1] : dx * dx + dz * dz <= this.radius * this.radius;
    return flat && p.y >= this.center.y - (this.box ? 0.25 : 1) && p.y <= this.center.y + this.height;
  }
  fixedUpdate(_dt: number, ctx: EntityContext): void {
    const inside = this.contains(ctx.player.feet) && (!this.grounded || ctx.player.grounded);
    if (inside && !this.inside) ctx.emit('zone-enter', this);
    if (!inside && this.inside) ctx.emit('zone-exit', this);
    this.inside = inside;
  }
  get active(): boolean { return this.inside; }
  reset(): void { this.inside = false; }
}

// ------------------------------------------------------------------------------------------
// Pickups: the Graft itself, capacity upgrades, and memory seeds.
// ------------------------------------------------------------------------------------------
export class Pickup extends Entity {
  pos: THREE.Vector3;
  taken = false;
  object: THREE.Object3D;
  kind: string;
  private t = Math.random() * 10;
  private light: LightSource | null = null;
  private shown = true;
  constructor(rec: EntityRec, ctx: EntityContext, object: THREE.Object3D) {
    super(rec);
    this.kind = rec.type;
    this.pos = v3(rec.p).add(ctx.origin);
    this.object = object;
    object.position.copy(this.pos);
    ctx.scene.add(dyn(object));
    // a soft light marks every pickup, the Graft included, so it reads from across a room
    if (ctx.lights) {
      this.light = ctx.lights.add(this.pos.clone().add(new THREE.Vector3(0, 0.3, 0)), new THREE.Color(rec.type === 'seed' ? 0x9fffc8 : 0x7fe3ff), 2.2, 5);
    }
  }
  near(p: THREE.Vector3): boolean { return !this.taken && this.shown && p.distanceTo(this.pos) < 2.2; }
  take(ctx: EntityContext): void {
    if (this.taken) return;
    this.taken = true;
    this.setVisible(false);
    ctx.emit('pickup', this);
  }
  setVisible(v: boolean): void {
    this.shown = v;
    this.object.visible = v && !this.taken;
    if (this.light) this.light.intensity = v && !this.taken ? 2.2 : 0;
  }
  frameUpdate(dt: number): void {
    this.t += dt;
    if (this.kind !== 'graft') {
      this.object.position.set(this.pos.x, this.pos.y + Math.sin(this.t * 1.7) * 0.06, this.pos.z);
      this.object.rotation.y += dt * 0.6;
      if (this.light) this.light.position.copy(this.pos).y += 0.3;
    }
  }
  // Back where it started. The director hides it again when the player already has it (the Graft,
  // the second cell) or kept it (a memory in the save).
  reset(): void { this.setTaken(false); }
  setTaken(v: boolean): void {
    this.taken = v;
    this.setVisible(this.shown);
  }
}

// ------------------------------------------------------------------------------------------
// Balance: two linked pans. The heavier pan sinks and the lighter one rises by the same amount.
// Used for the counterweight lift and the great scale. A pan's floor can be a screen, so the
// Graft reaches what sits on it from below. Weight is summed like a plate's: through stacks,
// plus 4 for the player.
// ------------------------------------------------------------------------------------------
interface PanRec { p: number[]; size: number[]; screen?: boolean; hook?: number[]; hookFollowsBeam?: boolean }

class Pan implements Platform {
  body: RAPIER.RigidBody;
  colliders: RAPIER.Collider[] = [];
  base: RAPIER.Collider;
  center: THREE.Vector3; // balanced position of the pan's center (top of the base is +0.15)
  home: THREE.Vector3;
  half: THREE.Vector3;
  group = new THREE.Group();
  rods: THREE.Mesh[] = [];
  hook: THREE.Vector3 | null;
  weight = 0;
  vel = 0;
  sensor: RAPIER.Cuboid;

  constructor(r: PanRec, ctx: EntityContext, rodMat: THREE.Material) {
    const R = ctx.phys.R;
    this.center = v3(r.p).add(ctx.origin);
    this.home = this.center.clone();
    this.half = new THREE.Vector3(r.size[0] / 2, 0.15, r.size[1] / 2);
    this.hook = r.hook ? v3(r.hook).add(ctx.origin) : null;
    this.body = ctx.phys.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(this.center.x, this.center.y, this.center.z));
    const h = this.half;
    this.base = ctx.phys.world.createCollider(R.ColliderDesc.cuboid(h.x, h.y, h.z)
      .setCollisionGroups(groups(r.screen ? G.SCREEN : G.KINEMATIC, SOLID_FILTER)).setFriction(1.0), this.body);
    this.colliders.push(this.base);
    // a low rim keeps crates on the pan
    const rim = 0.07, rh = 0.05;
    for (const [sx, sz, hx, hz] of [[1, 0, rim, h.z], [-1, 0, rim, h.z], [0, 1, h.x, rim], [0, -1, h.x, rim]]) {
      const c = ctx.phys.world.createCollider(R.ColliderDesc.cuboid(hx, rh, hz)
        .setTranslation(sx * (h.x - rim), h.y + rh, sz * (h.z - rim))
        .setCollisionGroups(groups(G.KINEMATIC, SOLID_FILTER)), this.body);
      this.colliders.push(c);
    }
    for (const c of this.colliders) ctx.phys.owners.set(c.handle, { kind: 'platform', platform: this });
    this.sensor = new R.Cuboid(h.x - 0.1, 0.45, h.z - 0.1);
    // visuals: floor (plates or perforated screen), steel frame and rim, hanger rods
    const floorMat = mat(ctx, r.screen ? 'screen' : 'plates');
    const floor = new THREE.Mesh(new THREE.BoxGeometry(h.x * 2 - 0.16, r.screen ? 0.03 : h.y * 2 - 0.04, h.z * 2 - 0.16), floorMat);
    floor.position.y = r.screen ? h.y - 0.05 : 0;
    this.group.add(floor);
    const steel = mat(ctx, 'steel');
    const frame = (w: number, hh: number, d: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), steel);
      m.position.set(x, y, z);
      this.group.add(m);
    };
    frame(h.x * 2, h.y * 2, 0.16, 0, 0, h.z - 0.08);
    frame(h.x * 2, h.y * 2, 0.16, 0, 0, -h.z + 0.08);
    frame(0.16, h.y * 2, h.z * 2, h.x - 0.08, 0, 0);
    frame(0.16, h.y * 2, h.z * 2, -h.x + 0.08, 0, 0);
    if (r.screen) {
      frame(h.x * 2 - 0.2, 0.1, 0.1, 0, -0.05, 0);
      frame(0.1, 0.1, h.z * 2 - 0.2, 0, -0.05, 0);
    }
    frame(h.x * 2, rh * 2, rim * 2, 0, h.y + rh, h.z - rim);
    frame(h.x * 2, rh * 2, rim * 2, 0, h.y + rh, -h.z + rim);
    frame(rim * 2, rh * 2, h.z * 2, h.x - rim, h.y + rh, 0);
    frame(rim * 2, rh * 2, h.z * 2, -h.x + rim, h.y + rh, 0);
    ctx.scene.add(dyn(this.group));
    if (this.hook) {
      for (let i = 0; i < 4; i++) {
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 8), rodMat);
        ctx.scene.add(dyn(rod));
        this.rods.push(rod);
      }
    }
  }

  platformVelocity(_p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 { return out.set(0, this.vel, 0); }

  place(offset: number, vel: number): void {
    const p = this.center.clone();
    p.y += offset;
    this.body.setNextKinematicTranslation(p);
    this.vel = vel;
  }

  // weigh everything resting on the pan (through stacks), plus the player
  weigh(ctx: EntityContext): number {
    const phys = ctx.phys;
    const t = this.body.translation();
    const c = new THREE.Vector3(t.x, t.y + this.half.y + 0.5, t.z);
    const touching = new Set<number>();
    phys.world.intersectionsWithShape(c, { x: 0, y: 0, z: 0, w: 1 }, this.sensor, (col) => { touching.add(col.handle); return true; },
      undefined, groups(0xffff, G.DYNAMIC | G.PLAYER));
    const on = new Set<number>(touching);
    const queue = [...touching];
    while (queue.length) {
      const hdl = queue.pop()!;
      const col = phys.world.getCollider(hdl);
      if (!col) continue;
      const cy = col.translation().y;
      phys.world.contactPairsWith(col, (other) => {
        if (on.has(other.handle)) return;
        const o = phys.owners.get(other.handle);
        if (!o || o.kind !== 'lattice' || !(o.lattice as Lattice).free) return;
        if (other.translation().y > cy + 0.1) { on.add(other.handle); queue.push(other.handle); }
      });
    }
    let w = 0;
    let player = false;
    for (const hdl of on) {
      const o = phys.owners.get(hdl);
      if (!o) continue;
      if (o.kind === 'player') player = true;
      else if (o.kind === 'lattice' && !(o.lattice as FreeLattice).held) w += (o.lattice as Lattice).weight();
    }
    const pl = ctx.player;
    if (!player && pl.grounded && pl.groundCollider && (on.has(pl.groundCollider.handle) || this.colliders.includes(pl.groundCollider))) player = true;
    if (player) w += 4;
    this.weight = w;
    return w;
  }

  sync(hook: THREE.Vector3 | null): void {
    const t = this.body.translation();
    this.group.position.set(t.x, t.y, t.z);
    if (!hook) return;
    const h = this.half;
    const corners = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    const up = new THREE.Vector3(0, 1, 0);
    this.rods.forEach((rod, i) => {
      const a = new THREE.Vector3(t.x + corners[i][0] * (h.x - 0.1), t.y + h.y + 0.1, t.z + corners[i][1] * (h.z - 0.1));
      const d = hook.clone().sub(a);
      const len = d.length();
      rod.position.copy(a).addScaledVector(d, 0.5);
      rod.quaternion.setFromUnitVectors(up, d.normalize());
      rod.scale.set(1, len, 1);
    });
  }

  setVisible(v: boolean): void {
    this.group.visible = v;
    for (const r of this.rods) r.visible = v;
  }
}

export class Balance extends Entity {
  pans: Pan[];
  offset: number; // pan A's height above its balanced position; pan B moves the other way
  start: number;
  range: number;
  vel = 0;
  speed: number;
  beam: THREE.Group | null = null;
  pivot: THREE.Vector3 | null = null;
  arm = 0;
  private hooks: (THREE.Vector3 | null)[];
  private homeHooks: (THREE.Vector3 | null)[];
  private homePivot: THREE.Vector3 | null = null;
  private emitT = 0;
  private disabled = false;

  constructor(rec: EntityRec, ctx: EntityContext) {
    super(rec);
    const rodMat = mat(ctx, 'steel');
    this.pans = (rec.pans as PanRec[]).map((p) => new Pan(p, ctx, rodMat));
    this.range = rec.range ?? 2.5;
    this.start = rec.start ?? 0;
    this.offset = this.start;
    this.speed = rec.speed ?? 1.3;
    this.hooks = this.pans.map((p) => p.hook?.clone() ?? null);
    this.homeHooks = this.hooks.map((h) => h?.clone() ?? null);
    if (rec.beam) {
      // the great scale's beam tilts about its pivot so its ends stay over the pans
      this.pivot = v3(rec.beam.p).add(ctx.origin);
      this.homePivot = this.pivot.clone();
      const a = this.pans[0].center, b = this.pans[1].center;
      this.arm = Math.hypot(a.x - b.x, a.z - b.z) / 2;
      const g = new THREE.Group();
      const iron = mat(ctx, 'steel');
      const gold = mat(ctx, 'plates');
      const beam = new THREE.Mesh(new THREE.BoxGeometry(this.arm * 2 + 0.6, 0.55, 0.5), iron);
      g.add(beam);
      const crest = new THREE.Mesh(new THREE.BoxGeometry(this.arm * 1.2, 0.2, 0.62), gold);
      crest.position.y = 0.35;
      g.add(crest);
      for (const s of [-1, 1]) {
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.7, 20), gold);
        cap.rotation.x = Math.PI / 2;
        cap.position.x = s * this.arm;
        g.add(cap);
      }
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.8, 24), gold);
      hub.rotation.x = Math.PI / 2;
      g.add(hub);
      g.position.copy(this.pivot);
      g.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
      this.beam = dyn(g) as THREE.Group;
      ctx.scene.add(this.beam);
    }
    this.place(0);
  }

  private place(dt: number): void {
    const [a, b] = this.pans;
    a.place(this.offset, this.vel);
    b.place(-this.offset, -this.vel);
    void dt;
  }

  fixedUpdate(dt: number, ctx: EntityContext): void {
    if (this.disabled) return;
    const [a, b] = this.pans;
    const wa = a.weigh(ctx), wb = b.weigh(ctx);
    const dir = wa === wb ? 0 : wa > wb ? -1 : 1;
    // speed grows a little with the difference, so a big imbalance feels heavy
    const target = dir * this.speed * Math.min(1.5, 0.7 + Math.abs(wa - wb) / 16);
    const acc = 2.2;
    this.vel += THREE.MathUtils.clamp(target - this.vel, -acc * dt, acc * dt);
    this.offset += this.vel * dt;
    if (this.offset > this.range) { this.offset = this.range; if (this.vel > 0) this.vel = 0; }
    if (this.offset < -this.range) { this.offset = -this.range; if (this.vel < 0) this.vel = 0; }
    this.place(dt);
    this.emitT -= dt;
    if (Math.abs(this.vel) > 0.2 && this.emitT <= 0) { this.emitT = 1.2; ctx.emit('balance-move', this); }
  }

  frameUpdate(): void {
    const [a, b] = this.pans;
    if (this.beam && this.pivot) {
      const s = THREE.MathUtils.clamp(this.offset / this.arm, -0.95, 0.95);
      const tilt = Math.asin(s);
      // rotate about the beam's own length axis: pan A's end goes up with the offset
      this.beam.rotation.z = -tilt;
      const dirA = new THREE.Vector3(a.center.x - this.pivot.x, 0, a.center.z - this.pivot.z).normalize();
      const hookA = this.pivot.clone().addScaledVector(dirA, this.arm * Math.cos(tilt)).add(new THREE.Vector3(0, this.arm * s, 0));
      const hookB = this.pivot.clone().addScaledVector(dirA, -this.arm * Math.cos(tilt)).add(new THREE.Vector3(0, -this.arm * s, 0));
      a.sync(hookA);
      b.sync(hookB);
    } else {
      a.sync(this.hooks[0]);
      b.sync(this.hooks[1]);
    }
  }

  reset(): void {
    for (const p of this.pans) p.center.copy(p.home);
    this.hooks.forEach((h, i) => h?.copy(this.homeHooks[i]!));
    if (this.pivot && this.homePivot) { this.pivot.copy(this.homePivot); this.beam?.position.copy(this.homePivot); }
    this.offset = this.start;
    this.vel = 0;
    this.place(0);
    for (const p of this.pans) p.body.setTranslation(p.center.clone().add(new THREE.Vector3(0, p === this.pans[0] ? this.offset : -this.offset, 0)), true);
  }

  setVisible(v: boolean): void {
    this.disabled = !v;
    for (const p of this.pans) {
      p.setVisible(v);
      if (!v) p.body.setTranslation({ x: 0, y: -5000, z: 0 }, true);
    }
    if (this.beam) this.beam.visible = v;
    if (v) this.reset();
  }

  // follow the island chunk it hangs from
  shift(d: THREE.Vector3): void {
    for (const p of this.pans) { p.center.add(d); }
    for (const h of this.hooks) h?.add(d);
    this.pivot?.add(d);
    this.beam?.position.add(d);
  }
}

// ------------------------------------------------------------------------------------------
// Toppler: a tall column that stands until lattice grows against its base. Then it tips over
// in its authored direction, pivoting on the front edge of its base, and comes to rest at its
// authored angle: flat across a chasm (a bridge) or leaning on a ledge (a ramp).
// ------------------------------------------------------------------------------------------
export class Toppler extends Entity {
  base: THREE.Vector3; // bottom center while standing
  height: number;
  width: number;
  dir: THREE.Vector3;
  endAngle: number;
  angle = 0;
  omega = 0;
  state: 'standing' | 'falling' | 'fallen' = 'standing';
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  group = new THREE.Group();
  private axis: THREE.Vector3;
  private pivot: THREE.Vector3;
  private homeBase: THREE.Vector3;
  private hit = false;

  constructor(rec: EntityRec, ctx: EntityContext, model: THREE.Object3D | null) {
    super(rec);
    this.base = v3(rec.p).add(ctx.origin);
    this.homeBase = this.base.clone();
    this.height = rec.height ?? 8.5;
    this.width = rec.width ?? 1.1;
    this.dir = new THREE.Vector3(rec.dir[0], 0, rec.dir[1]).normalize();
    this.endAngle = THREE.MathUtils.degToRad(rec.endAngle ?? 90);
    this.axis = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), this.dir).normalize(); // tips toward dir
    this.pivot = this.base.clone().addScaledVector(this.dir, this.width / 2);
    const R = ctx.phys.R;
    this.body = ctx.phys.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased());
    this.collider = ctx.phys.world.createCollider(R.ColliderDesc.cuboid(this.width / 2, this.height / 2, this.width / 2)
      .setCollisionGroups(groups(G.KINEMATIC, SOLID_FILTER)).setFriction(1.0), this.body);
    ctx.phys.owners.set(this.collider.handle, { kind: 'platform', platform: { platformVelocity: (_p: THREE.Vector3, o: THREE.Vector3) => o.set(0, 0, 0) } });
    if (model) {
      const m = model.clone(true);
      m.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const n = (mesh.material as THREE.Material).name.split('.')[0];
        mesh.material = mat(ctx, ctx.sets[n] ? n : 'marble');
      });
      m.rotation.y = Math.atan2(this.dir.x, this.dir.z);
      m.scale.y = this.height / 8.5; // the column model is 8.5 m tall
      this.group.add(m);
    }
    ctx.scene.add(dyn(this.group));
    this.apply();
  }

  // A lattice grew: does its new size reach the base of this column?
  push(l: Lattice, grownSize: number): boolean {
    if (this.state !== 'standing') return false;
    const p = l.body.translation();
    const reach = grownSize / 2 + this.width / 2 + 0.4;
    const dx = p.x - this.base.x, dz = p.z - this.base.z;
    if (Math.abs(dx) > reach || Math.abs(dz) > reach) return false;
    if (p.y - grownSize / 2 > this.base.y + 2.5) return false;
    this.state = 'falling';
    this.angle = 0.02;
    this.omega = 0.45;
    return true;
  }

  private transform(): { pos: THREE.Vector3; quat: THREE.Quaternion } {
    const q = new THREE.Quaternion().setFromAxisAngle(this.axis, this.angle);
    const center = this.base.clone().add(new THREE.Vector3(0, this.height / 2, 0)).sub(this.pivot).applyQuaternion(q).add(this.pivot);
    return { pos: center, quat: q };
  }

  private apply(): void {
    const { pos, quat } = this.transform();
    this.body.setNextKinematicTranslation(pos);
    this.body.setNextKinematicRotation(quat);
    const q = new THREE.Quaternion().setFromAxisAngle(this.axis, this.angle);
    this.group.position.copy(this.base).sub(this.pivot).applyQuaternion(q).add(this.pivot);
    this.group.quaternion.copy(q);
  }

  fixedUpdate(dt: number, ctx: EntityContext): void {
    if (this.state === 'falling') {
      // a rod tipping about its end: angular acceleration grows with the lean
      this.omega += (1.5 * 9.8 / this.height) * Math.sin(this.angle) * dt;
      this.angle += this.omega * dt;
      if (this.angle >= this.endAngle) {
        this.angle = this.endAngle;
        if (!this.hit) { this.hit = true; ctx.emit('toppled', this); }
        this.omega = -this.omega * 0.12;
        if (Math.abs(this.omega) < 0.08) { this.omega = 0; this.state = 'fallen'; }
      }
    }
    this.apply();
  }

  // a point on the column's axis, h meters above its base, wherever the column now lies
  pointAt(h: number): THREE.Vector3 {
    const q = new THREE.Quaternion().setFromAxisAngle(this.axis, this.angle);
    return this.base.clone().add(new THREE.Vector3(0, h, 0)).sub(this.pivot).applyQuaternion(q).add(this.pivot);
  }

  // the point where the fallen column struck (for dust and sound)
  impactPoint(): THREE.Vector3 {
    const q = new THREE.Quaternion().setFromAxisAngle(this.axis, this.angle);
    return this.base.clone().add(new THREE.Vector3(0, this.height * 0.8, 0)).sub(this.pivot).applyQuaternion(q).add(this.pivot);
  }

  reset(): void {
    this.base.copy(this.homeBase);
    this.pivot = this.base.clone().addScaledVector(this.dir, this.width / 2);
    this.state = 'standing';
    this.angle = 0;
    this.omega = 0;
    this.hit = false;
    const { pos, quat } = this.transform();
    this.body.setTranslation(pos, true);
    this.body.setRotation(quat, true);
    this.apply();
  }

  shift(d: THREE.Vector3): void {
    this.base.add(d);
    this.pivot.add(d);
  }

  setVisible(v: boolean): void {
    this.group.visible = v;
    if (!v) this.body.setTranslation({ x: 0, y: -5000, z: 0 }, true);
    else this.reset();
  }
}
