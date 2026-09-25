import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { Collider as ColRec, Vec3 } from '../engine/assets';

// Collision groups: 16 bits of membership, 16 bits of filter.
export const G = {
  STATIC: 1 << 0,
  SCREEN: 1 << 1, // perforated screens: block bodies and the player, not the Graft
  DYNAMIC: 1 << 2, // crates and orbs
  KINEMATIC: 1 << 3, // pillars, spans, bulkheads, doors, lifts
  PLAYER: 1 << 4,
  SENSOR: 1 << 5,
  HELD: 1 << 6, // a carried object: does not collide with the player
};

export function groups(member: number, filter: number): number {
  return ((member & 0xffff) << 16) | (filter & 0xffff);
}

export const SOLID_FILTER = G.STATIC | G.SCREEN | G.DYNAMIC | G.KINEMATIC | G.PLAYER | G.HELD;

export class Physics {
  world!: RAPIER.World;
  R = RAPIER;
  // collider handle -> game object (entities register themselves)
  owners = new Map<number, any>();

  async init(): Promise<void> {
    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0, y: -16, z: 0 });
    this.world.integrationParameters.numSolverIterations = 8;
    this.world.timestep = 1 / 60;
  }

  private events: RAPIER.EventQueue | null = null;

  step(onForce?: (colliderHandle: number, force: number) => void): void {
    if (!this.events) this.events = new RAPIER.EventQueue(true);
    this.world.step(this.events);
    this.events.drainContactForceEvents((e) => {
      if (!onForce) return;
      const f = e.totalForceMagnitude();
      onForce(e.collider1(), f);
      onForce(e.collider2(), f);
    });
    this.events.drainCollisionEvents(() => {});
  }

  // Static colliders from a level JSON, offset by the island's world position. One fixed body per
  // chunk, so a chunk can be moved as a whole.
  addStatic(recs: ColRec[], offset: THREE.Vector3): Map<string, { body: RAPIER.RigidBody; colliders: RAPIER.Collider[] }> {
    const out = new Map<string, { body: RAPIER.RigidBody; colliders: RAPIER.Collider[] }>();
    const bodyFor = (c: string) => {
      let e = out.get(c);
      if (!e) {
        e = { body: this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(offset.x, offset.y, offset.z)), colliders: [] };
        out.set(c, e);
      }
      return e;
    };
    bodyFor('main');
    for (const r of recs) {
      let desc: RAPIER.ColliderDesc | null = null;
      if (r.t === 'box') {
        desc = RAPIER.ColliderDesc.cuboid(Math.max(r.h[0], 0.005), Math.max(r.h[1], 0.005), Math.max(r.h[2], 0.005));
        desc.setTranslation(r.p[0], r.p[1], r.p[2]);
        if (r.r) {
          const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(r.r[0], r.r[1], r.r[2], 'XYZ'));
          desc.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
        } else if (r.ry) {
          const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r.ry);
          desc.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
        }
      } else if (r.t === 'hull') {
        desc = RAPIER.ColliderDesc.convexHull(new Float32Array(r.v.flat()));
      } else if (r.t === 'cyl') {
        desc = RAPIER.ColliderDesc.cylinder(r.hh, r.r);
        desc.setTranslation(r.p[0], r.p[1], r.p[2]);
      }
      if (!desc) continue;
      const screen = r.k === 'screen';
      desc.setCollisionGroups(groups(screen ? G.SCREEN : G.STATIC, SOLID_FILTER));
      desc.setFriction(0.8);
      const e = bodyFor((r as any).c ?? 'main');
      const c = this.world.createCollider(desc, e.body);
      if (screen) this.owners.set(c.handle, { kind: 'screen' });
      e.colliders.push(c);
    }
    return out;
  }

  removeColliders(cols: RAPIER.Collider[]): void {
    for (const c of cols) {
      const b = c.parent();
      this.world.removeCollider(c, false);
      if (b && b.numColliders() === 0) this.world.removeRigidBody(b);
    }
  }

  // Ray used by the Graft: sees through screens, ignores the player, sensors and a held object.
  castGraft(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, exclude?: RAPIER.Collider | null): { collider: RAPIER.Collider; toi: number; point: THREE.Vector3; normal: THREE.Vector3 } | null {
    const ray = new RAPIER.Ray(origin, dir);
    const filter = groups(0xffff, G.STATIC | G.DYNAMIC | G.KINEMATIC | G.HELD);
    const hit = this.world.castRayAndGetNormal(ray, maxDist, true, undefined, filter, exclude ?? undefined);
    if (!hit) return null;
    const p = ray.pointAt(hit.timeOfImpact);
    return { collider: hit.collider, toi: hit.timeOfImpact, point: new THREE.Vector3(p.x, p.y, p.z), normal: new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z) };
  }

  // A thin sphere swept along the Graft's ray: the first lattice it touches, if any.
  sweepLattice(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, radius: number, exclude?: RAPIER.Collider | null): { collider: RAPIER.Collider; toi: number; point: THREE.Vector3 } | null {
    const shape = new RAPIER.Ball(radius);
    const hit = this.world.castShape(origin, { x: 0, y: 0, z: 0, w: 1 }, dir, shape, 0, maxDist, true, undefined,
      groups(0xffff, G.DYNAMIC | G.KINEMATIC | G.HELD), exclude ?? undefined, undefined,
      (c) => this.owners.get(c.handle)?.kind === 'lattice');
    if (!hit) return null;
    return { collider: hit.collider, toi: hit.time_of_impact, point: origin.clone().addScaledVector(dir, hit.time_of_impact) };
  }

  castRay(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, filterMask: number, exclude?: RAPIER.Collider | null, excludeBody?: RAPIER.RigidBody | null): { collider: RAPIER.Collider; toi: number; normal: THREE.Vector3 } | null {
    const ray = new RAPIER.Ray(origin, dir);
    const hit = this.world.castRayAndGetNormal(ray, maxDist, true, undefined, groups(0xffff, filterMask), exclude ?? undefined, excludeBody ?? undefined);
    if (!hit) return null;
    return { collider: hit.collider, toi: hit.timeOfImpact, normal: new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z) };
  }

  // Does a box of half extents h at position p (rotation q) overlap anything in mask?
  boxOverlaps(p: THREE.Vector3, h: THREE.Vector3, q: THREE.Quaternion, mask: number, excludeCollider?: RAPIER.Collider, shrink = 0.02): boolean {
    const shape = new RAPIER.Cuboid(Math.max(h.x - shrink, 0.01), Math.max(h.y - shrink, 0.01), Math.max(h.z - shrink, 0.01));
    let found = false;
    this.world.intersectionsWithShape(p, q, shape, () => { found = true; return false; }, undefined, groups(0xffff, mask), excludeCollider);
    return found;
  }

  ballOverlaps(p: THREE.Vector3, r: number, mask: number, excludeCollider?: RAPIER.Collider): boolean {
    const shape = new RAPIER.Ball(Math.max(r - 0.02, 0.01));
    let found = false;
    this.world.intersectionsWithShape(p, { x: 0, y: 0, z: 0, w: 1 }, shape, () => { found = true; return false; }, undefined, groups(0xffff, mask), excludeCollider);
    return found;
  }
}

export function v3(a: Vec3 | number[]): THREE.Vector3 {
  return new THREE.Vector3(a[0], a[1], a[2]);
}
