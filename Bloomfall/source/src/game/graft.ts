import * as THREE from 'three';
import { Physics, G, groups, SOLID_FILTER } from './physics';
import { Lattice, FreeLattice, GrowResult, isLatticeCollider } from './lattice';
import type { Player } from './player';
import type { Input } from './input';

export type GraftEvent =
  | { type: 'give' | 'take'; target: Lattice; point: THREE.Vector3 }
  | { type: 'fail'; reason: string; target: Lattice | null }
  | { type: 'grab' | 'drop' | 'throw'; target: FreeLattice };

export const GRAFT_RANGE = 14;

const FAIL_TEXT: Record<string, string> = {
  empty: 'Your Graft is empty. Take space from something first.',
  full: 'Your Graft is full. Give its space to something first.',
  max: 'It cannot grow any larger.',
  min: 'It cannot get any smaller.',
  room: 'No room to grow there.',
  busy: 'It is still changing.',
  locked: 'The lattice is sealed.',
  nothing: 'Aim at lattice: the glowing seams.',
  none: 'You have no Graft yet.',
  heavy: 'Too large to carry. Take some of its space first.',
};

export class Graft {
  owned = false;
  capacity = 1;
  cells = 0;
  infinite = false;
  coreTarget: any = null; // the Heart, when it is under the crosshair
  target: Lattice | null = null;
  targetPoint = new THREE.Vector3();
  targetDist = 0;
  held: FreeLattice | null = null;
  events: GraftEvent[] = [];
  private heldFar = 0;
  private phys: Physics;
  private tmp = new THREE.Vector3();
  cooldown = 0;

  constructor(phys: Physics) {
    this.phys = phys;
  }

  failText(reason: string): string { return FAIL_TEXT[reason] ?? reason; }

  // Aim from the camera. Screens let the ray through. A held object is skipped unless no other
  // lattice is under the crosshair (so you can grow or shrink what you carry by looking at it).
  aim(camera: THREE.Camera): void {
    const origin = camera.getWorldPosition(new THREE.Vector3());
    const dir = camera.getWorldDirection(new THREE.Vector3());
    this.target = null;
    let hit = this.phys.castGraft(origin, dir, GRAFT_RANGE + 2, this.held?.collider ?? null);
    const owner = hit ? this.phys.owners.get(hit.collider.handle) : null;
    this.coreTarget = owner && owner.kind === 'core' && hit!.toi < GRAFT_RANGE ? owner.heart : null;
    let lat = hit ? isLatticeCollider(this.phys, hit.collider) : null;
    if (this.held && !lat) {
      const hh = this.phys.castGraft(origin, dir, 4, null);
      if (hh && isLatticeCollider(this.phys, hh.collider) === this.held) { hit = hh; lat = this.held; }
    }
    // aim assist: lattice within a hand's width of the ray counts, if nothing solid is well in front of it
    if (!lat) {
      const sw = this.phys.sweepLattice(origin, dir, GRAFT_RANGE, 0.16, this.held?.collider ?? null);
      if (sw && (!hit || sw.toi <= hit.toi + 0.35)) {
        lat = isLatticeCollider(this.phys, sw.collider);
        hit = { collider: sw.collider, toi: sw.toi, point: sw.point, normal: new THREE.Vector3() };
      }
    }
    if (hit && lat && hit.toi <= GRAFT_RANGE) {
      this.target = lat;
      this.targetPoint.copy(hit.point);
      this.targetDist = hit.toi;
    }
  }

  give(): void {
    if (!this.owned) return this.fail('none', null);
    if (this.cooldown > 0) return;
    const t = this.target;
    if (!t) return this.fail('nothing', null);
    if (!this.infinite && this.cells <= 0) return this.fail('empty', t);
    const r = t.tryGrow();
    if (r !== 'ok') return this.fail(r, t);
    if (!this.infinite) this.cells--;
    this.cooldown = 0.18;
    this.events.push({ type: 'give', target: t, point: this.targetPoint.clone() });
    if (t === this.held && !(t as FreeLattice).carryable() && t.level > 1) this.drop(false);
  }

  take(): void {
    if (!this.owned) return this.fail('none', null);
    if (this.cooldown > 0) return;
    const t = this.target;
    if (!t && this.coreTarget) return; // the Heart is taken by holding, not by a click
    if (!t) return this.fail('nothing', null);
    if (!this.infinite && this.cells >= this.capacity) return this.fail('full', t);
    const r = t.tryShrink();
    if (r !== 'ok') return this.fail(r, t);
    if (!this.infinite) this.cells++;
    this.cooldown = 0.18;
    this.events.push({ type: 'take', target: t, point: this.targetPoint.clone() });
  }

  private fail(reason: GrowResult | string, t: Lattice | null): void {
    this.events.push({ type: 'fail', reason, target: t });
  }

  canGrab(): boolean {
    const t = this.target;
    return !!t && t.free && !this.held && this.targetDist < 3.4;
  }

  grab(): void {
    const t = this.target as FreeLattice;
    if (!t || !t.free) return;
    if (!t.carryable()) return this.fail('heavy', t);
    this.held = t;
    t.held = true;
    t.collider.setCollisionGroups(groups(G.HELD, G.STATIC | G.SCREEN | G.DYNAMIC | G.KINEMATIC));
    t.body.setGravityScale(0, true);
    t.body.setAngularDamping(8);
    this.heldFar = 0;
    this.events.push({ type: 'grab', target: t });
  }

  drop(event = true): void {
    const t = this.held;
    if (!t) return;
    this.held = null;
    t.held = false;
    t.collider.setCollisionGroups(groups(G.DYNAMIC, SOLID_FILTER));
    t.body.setGravityScale(1, true);
    t.body.setAngularDamping(t.kind === 'orb' ? 0.25 : 0.6);
    // do not fling things at full carry speed
    const v = t.body.linvel();
    const s = Math.hypot(v.x, v.y, v.z);
    if (s > 6) t.body.setLinvel({ x: (v.x / s) * 6, y: (v.y / s) * 6, z: (v.z / s) * 6 }, true);
    if (event) this.events.push({ type: 'drop', target: t });
  }

  throwHeld(dir: THREE.Vector3): void {
    const t = this.held;
    if (!t) return;
    this.drop(false);
    const speed = t.level === 0 ? 10 : 5;
    t.body.setLinvel({ x: dir.x * speed, y: dir.y * speed + 1.5, z: dir.z * speed }, true);
    this.events.push({ type: 'throw', target: t });
  }

  // Carry: steer the held body toward a point in front of the eye with velocity control, so it
  // still collides with the world and cannot be pushed through walls.
  updateHeld(dt: number, camera: THREE.Camera, player: Player): void {
    const t = this.held;
    if (!t) return;
    if (!t.carryable() && !t.animating) { this.drop(); return; }
    const eye = camera.getWorldPosition(new THREE.Vector3());
    const fwd = camera.getWorldDirection(new THREE.Vector3());
    const dist = 0.9 + t.size * 0.9;
    const hold = eye.clone().addScaledVector(fwd, dist);
    // carried a little low, so the crosshair and the way ahead stay clear
    hold.y -= 0.18 + t.size * 0.42;
    // keep it from being held inside the player's feet
    hold.y = Math.max(hold.y, player.feet.y + t.size * 0.5 + 0.05);
    const p = t.position(this.tmp);
    const d = hold.clone().sub(p);
    const far = d.length();
    const v = d.multiplyScalar(14);
    const maxV = 16;
    if (v.length() > maxV) v.setLength(maxV);
    const pv = player.vel;
    t.body.setLinvel({ x: v.x + pv.x * 0.3, y: v.y, z: v.z + pv.z * 0.3 }, true);
    // turn with the player (crates only)
    if (t.kind === 'crate') {
      const q = t.rotation();
      const target = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), player.yaw);
      const diff = target.clone().multiply(q.clone().invert());
      if (diff.w < 0) { diff.x = -diff.x; diff.y = -diff.y; diff.z = -diff.z; diff.w = -diff.w; }
      const angle = 2 * Math.acos(Math.min(1, diff.w));
      const s = Math.sqrt(1 - diff.w * diff.w);
      if (s > 1e-4 && angle > 1e-3) {
        const k = 8 * angle;
        t.body.setAngvel({ x: (diff.x / s) * k, y: (diff.y / s) * k, z: (diff.z / s) * k }, true);
      } else t.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
    this.heldFar = far > 1.3 ? this.heldFar + dt : 0;
    if (this.heldFar > 0.35) this.drop();
    // standing on what you carry is not allowed
    if (player.groundCollider && player.groundCollider.handle === t.collider.handle) this.drop();
  }

  update(dt: number, input: Input, camera: THREE.Camera, player: Player): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.aim(camera);
    if (input.pressed.has('give')) this.give();
    if (input.pressed.has('take')) this.take();
    if (input.pressed.has('throw') && this.held) this.throwHeld(camera.getWorldDirection(new THREE.Vector3()));
    this.updateHeld(dt, camera, player);
  }
}
