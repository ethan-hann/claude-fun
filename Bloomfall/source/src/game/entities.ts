import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { Physics, G, groups, SOLID_FILTER, v3 } from './physics';
import { FreeLattice, Lattice } from './lattice';
import type { Player, Platform } from './player';
import type { EntityRec } from '../engine/assets';
import { buildSurfaceMaterial, TextureSet } from '../engine/materials';
import { DYNAMIC_LAYER } from '../engine/dynshadow';

export interface EntityContext {
  phys: Physics;
  scene: THREE.Scene;
  player: Player;
  lattices: Map<string, Lattice>;
  entities: Map<string, Entity>;
  sets: Record<string, TextureSet>;
  emit: (event: string, data?: any) => void;
  origin: THREE.Vector3;
}

export abstract class Entity {
  id: string;
  rec: EntityRec;
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
    this.top = new THREE.Mesh(new THREE.CylinderGeometry(this.radius * 0.86, this.radius * 0.9, 0.08, 48), topMat);
    this.top.position.copy(this.pos).add(new THREE.Vector3(0, 0.04, 0));
    ctx.scene.add(dyn(this.top));
    const n = this.threshold;
    this.notchMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveIntensity: 1, roughness: 1, metalness: 0 });
    this.notches = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.03, 0.16), this.notchMat, n);
    const m = new THREE.Matrix4();
    const ringR = this.radius * 0.96;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.PI / n;
      m.makeRotationY(-a);
      m.setPosition(this.pos.x + Math.cos(a) * ringR, this.pos.y + 0.035, this.pos.z + Math.sin(a) * ringR);
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
    const target = this.pos.y + 0.04 - (this.weight > 0 ? 0.03 : 0);
    this.top.position.y += (target - this.top.position.y) * Math.min(1, dt * 12);
  }
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
  fired = false;
  inside = false;
  constructor(rec: EntityRec, ctx: EntityContext) {
    super(rec);
    this.center = v3(rec.p).add(ctx.origin);
    this.radius = rec.r ?? 2;
    this.height = rec.h ?? 4;
  }
  contains(p: THREE.Vector3): boolean {
    const dx = p.x - this.center.x, dz = p.z - this.center.z;
    return dx * dx + dz * dz <= this.radius * this.radius && p.y >= this.center.y - 1 && p.y <= this.center.y + this.height;
  }
  fixedUpdate(_dt: number, ctx: EntityContext): void {
    const inside = this.contains(ctx.player.feet);
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
  private light: THREE.PointLight | null = null;
  constructor(rec: EntityRec, ctx: EntityContext, object: THREE.Object3D) {
    super(rec);
    this.kind = rec.type;
    this.pos = v3(rec.p).add(ctx.origin);
    this.object = object;
    object.position.copy(this.pos);
    ctx.scene.add(dyn(object));
    if (rec.type === 'seed' || rec.type === 'upgrade') {
      this.light = new THREE.PointLight(rec.type === 'seed' ? 0x9fffc8 : 0x7fe3ff, 2.2, 5, 2);
      this.light.position.copy(this.pos);
      ctx.scene.add(this.light);
    }
  }
  near(p: THREE.Vector3): boolean { return !this.taken && p.distanceTo(this.pos) < 2.2; }
  take(ctx: EntityContext): void {
    if (this.taken) return;
    this.taken = true;
    this.object.visible = false;
    if (this.light) this.light.visible = false;
    ctx.emit('pickup', this);
  }
  frameUpdate(dt: number): void {
    this.t += dt;
    if (this.kind !== 'graft') {
      this.object.position.y = this.pos.y + Math.sin(this.t * 1.7) * 0.06;
      this.object.rotation.y += dt * 0.6;
    }
  }
  reset(): void { /* pickups stay taken */ }
}
