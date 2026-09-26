import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { Physics, G, groups } from './physics';
import type { Input } from './input';

// Floating capsule: the collider hovers HOVER above the feet and a sphere cast holds the feet
// on the ground. Floor seams and small ledges never touch the capsule, and steps lower than
// HOVER are climbed by the ground spring.
export const PLAYER = {
  radius: 0.3,
  halfHeight: 0.4, // capsule from feet+0.3 to feet+1.7
  hover: 0.3,
  probeRadius: 0.2,
  eye: 1.56, // above the feet
  walk: 4.3,
  sprint: 6.6,
  accelGround: 42,
  accelAir: 9,
  friction: 14,
  gravity: 20,
  jumpVel: 7.2, // apex ~1.3 m
  coyote: 0.12,
  jumpBuffer: 0.15,
  weight: 4, // same as a medium crate
};

// Things the player can stand on that move report their velocity so the player rides along.
export interface Platform { platformVelocity(point: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 }

export class Player {
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  kcc: RAPIER.KinematicCharacterController;
  pos = new THREE.Vector3();
  prevPos = new THREE.Vector3();
  vel = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  grounded = false;
  groundCollider: RAPIER.Collider | null = null;
  groundNormal = new THREE.Vector3(0, 1, 0);
  coyoteT = 0;
  jumpT = 0;
  airTime = 0;
  lastFallSpeed = 0;
  onLand: ((speed: number) => void) | null = null;
  onStep: ((surface: string) => void) | null = null;
  onJump: (() => void) | null = null;
  private stepDist = 0;
  private bobPhase = 0;
  bob = 0;
  private landDip = 0;
  private landVel = 0;
  frozen = false;
  noclip = false;
  sprinting = false;
  private phys: Physics;
  private tmp = new THREE.Vector3();
  private platVel = new THREE.Vector3();
  pushOut = new THREE.Vector3(); // accumulated depenetration requested by growing objects
  groundY = 0;
  private probeShape: RAPIER.Ball;

  constructor(phys: Physics) {
    this.phys = phys;
    const R = phys.R;
    this.body = phys.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 5, 0));
    const cd = R.ColliderDesc.capsule(PLAYER.halfHeight, PLAYER.radius)
      .setCollisionGroups(groups(G.PLAYER, G.STATIC | G.SCREEN | G.DYNAMIC | G.KINEMATIC | G.SENSOR))
      .setFriction(0.0);
    this.collider = phys.world.createCollider(cd, this.body);
    phys.owners.set(this.collider.handle, { kind: 'player', player: this });
    this.probeShape = new R.Ball(PLAYER.probeRadius);
    this.kcc = phys.world.createCharacterController(0.02);
    this.kcc.setUp({ x: 0, y: 1, z: 0 });
    this.kcc.setMaxSlopeClimbAngle(THREE.MathUtils.degToRad(50));
    this.kcc.setMinSlopeSlideAngle(THREE.MathUtils.degToRad(55));
    this.kcc.disableAutostep();
    this.kcc.disableSnapToGround();
    this.kcc.setApplyImpulsesToDynamicBodies(true);
    this.kcc.setCharacterMass(60);
    this.kcc.setSlideEnabled(true);
  }

  // capsule center sits this far above the feet
  static readonly CENTER = PLAYER.hover + PLAYER.radius + PLAYER.halfHeight;

  get feet(): THREE.Vector3 { return this.tmp.set(this.pos.x, this.pos.y - Player.CENTER, this.pos.z); }

  teleport(feet: THREE.Vector3, yaw?: number): void {
    this.pos.set(feet.x, feet.y + Player.CENTER + 0.02, feet.z);
    this.prevPos.copy(this.pos);
    this.vel.set(0, 0, 0);
    this.body.setTranslation(this.pos, true);
    this.body.setNextKinematicTranslation(this.pos);
    if (yaw !== undefined) { this.yaw = yaw; this.pitch = 0; }
    this.grounded = false;
    this.groundCollider = null;
  }

  look(dx: number, dy: number): void {
    const s = 0.0022;
    this.yaw -= dx * s;
    this.pitch -= dy * s;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.5, 1.5);
  }

  fixedUpdate(dt: number, input: Input, platformOf: (c: RAPIER.Collider) => Platform | null): void {
    this.prevPos.copy(this.pos);
    if (this.frozen) {
      this.vel.set(0, 0, 0);
      return;
    }
    const mv = input.move();
    this.sprinting = input.down.has('sprint') && mv.y > 0.3;
    const speed = this.sprinting ? PLAYER.sprint : PLAYER.walk;
    const fwdX = -Math.sin(this.yaw), fwdZ = -Math.cos(this.yaw);
    const rgtX = Math.cos(this.yaw), rgtZ = -Math.sin(this.yaw);
    const wishX = (fwdX * mv.y + rgtX * mv.x) * speed;
    const wishZ = (fwdZ * mv.y + rgtZ * mv.x) * speed;
    const accel = this.grounded ? PLAYER.accelGround : PLAYER.accelAir;
    // accelerate toward the wished velocity
    const dvx = wishX - this.vel.x, dvz = wishZ - this.vel.z;
    const dl = Math.hypot(dvx, dvz);
    const maxDv = accel * dt;
    if (dl > maxDv) { this.vel.x += (dvx / dl) * maxDv; this.vel.z += (dvz / dl) * maxDv; }
    else { this.vel.x = wishX; this.vel.z = wishZ; }
    if (this.grounded && mv.x === 0 && mv.y === 0) {
      const f = Math.max(0, 1 - PLAYER.friction * dt);
      this.vel.x *= f;
      this.vel.z *= f;
    }

    // jumping with coyote time and input buffering
    if (input.pressed.has('jump')) this.jumpT = PLAYER.jumpBuffer;
    else this.jumpT = Math.max(0, this.jumpT - dt);
    this.coyoteT = this.grounded ? PLAYER.coyote : Math.max(0, this.coyoteT - dt);
    let jumped = false;
    if (this.jumpT > 0 && this.coyoteT > 0) {
      this.vel.y = PLAYER.jumpVel;
      this.jumpT = 0;
      this.coyoteT = 0;
      jumped = true;
      this.onJump?.();
    }
    if (!this.grounded || jumped) this.vel.y -= PLAYER.gravity * dt;
    this.vel.y = Math.max(this.vel.y, -55);

    // ride moving platforms
    this.platVel.set(0, 0, 0);
    if (this.grounded && this.groundCollider && !jumped) {
      const plat = platformOf(this.groundCollider);
      if (plat) plat.platformVelocity(this.feet.clone(), this.platVel);
    }

    const desired = new THREE.Vector3(
      (this.vel.x + this.platVel.x) * dt + this.pushOut.x,
      this.pushOut.y,
      (this.vel.z + this.platVel.z) * dt + this.pushOut.z,
    );
    this.pushOut.set(0, 0, 0);
    // vertical: follow the ground spring when grounded, else fall
    if (this.grounded && !jumped) {
      const err = this.groundY - this.feet.y; // positive: ground is above the feet
      const follow = err > 0 ? Math.min(err, 9 * dt + err * 0.35) : Math.max(err, -12 * dt);
      desired.y += follow + this.platVel.y * dt * (err > 0.02 ? 0 : 1);
    } else {
      desired.y += this.vel.y * dt;
    }

    if (this.noclip) {
      this.pos.add(desired);
      this.body.setNextKinematicTranslation(this.pos);
      this.grounded = false;
      return;
    }

    this.body.setTranslation(this.pos, false);
    this.kcc.computeColliderMovement(this.collider, desired, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      groups(G.PLAYER, G.STATIC | G.SCREEN | G.DYNAMIC | G.KINEMATIC));
    const m = this.kcc.computedMovement();
    const wasGrounded = this.grounded;
    // hit the ceiling
    if (desired.y > 0 && m.y < desired.y * 0.3 && this.vel.y > 0) this.vel.y = 0;
    this.pos.x += m.x;
    this.pos.y += m.y;
    this.pos.z += m.z;

    // ground probe: a sphere cast down from inside the capsule
    this.probeGround(jumped);
    this.body.setNextKinematicTranslation(this.pos);

    if (this.grounded) {
      if (!wasGrounded) {
        this.onLand?.(-this.lastFallSpeed);
        this.landVel -= Math.min(Math.abs(this.lastFallSpeed), 14) * 0.015;
      }
      if (this.vel.y < 0) this.vel.y = 0;
      this.airTime = 0;
      const hs = Math.hypot(m.x, m.z);
      this.stepDist += hs;
      this.bobPhase += hs * 2.1;
      const stride = this.sprinting ? 2.1 : 1.65;
      if (this.stepDist > stride) { this.stepDist = 0; this.onStep?.('stone'); }
    } else {
      this.airTime += dt;
      this.lastFallSpeed = this.vel.y;
    }
    // soft landing dip spring
    this.landVel += (-this.landDip * 90 - this.landVel * 14) * dt;
    this.landDip += this.landVel * dt;
  }

  private probeGround(jumped: boolean): void {
    const start = this.pos.clone();
    const feetY = start.y - Player.CENTER;
    // reach: to the feet plus the hover gap when grounded (so small steps down stay grounded)
    const reach = (start.y - feetY) - PLAYER.probeRadius + (this.grounded ? 0.32 : 0.04);
    const hit = this.phys.world.castShape(start, { x: 0, y: 0, z: 0, w: 1 }, { x: 0, y: -1, z: 0 }, this.probeShape, 0.0, reach, true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, groups(G.PLAYER, G.STATIC | G.SCREEN | G.DYNAMIC | G.KINEMATIC), this.collider);
    const rising = this.vel.y > 0.5 || jumped;
    if (hit && !rising) {
      const n = hit.normal1;
      const slopeOk = n.y > Math.cos(THREE.MathUtils.degToRad(52));
      const contactY = hit.witness1.y;
      if (slopeOk && contactY <= feetY + PLAYER.hover + 0.02) {
        this.grounded = true;
        this.groundCollider = hit.collider;
        this.groundNormal.set(n.x, n.y, n.z);
        this.groundY = contactY;
        return;
      }
    }
    this.grounded = false;
    this.groundCollider = null;
  }

  // Interpolated eye position for rendering.
  eyePosition(alpha: number, out: THREE.Vector3): THREE.Vector3 {
    out.lerpVectors(this.prevPos, this.pos, alpha);
    out.y += PLAYER.eye - Player.CENTER;
    const hspeed = Math.hypot(this.vel.x, this.vel.z);
    const bobAmt = this.grounded ? Math.min(hspeed / PLAYER.walk, 1.4) : 0;
    this.bob = Math.sin(this.bobPhase) * 0.028 * bobAmt;
    out.y += Math.abs(this.bob) * 0.9 + this.landDip;
    return out;
  }

  applyCamera(cam: THREE.Camera, alpha: number): void {
    this.eyePosition(alpha, cam.position);
    cam.rotation.order = 'YXZ';
    cam.rotation.y = this.yaw;
    cam.rotation.x = this.pitch;
    cam.rotation.z = Math.cos(this.bobPhase * 0.5) * 0.004 * Math.min(Math.hypot(this.vel.x, this.vel.z) / PLAYER.walk, 1.4);
  }

  forward(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
  }
}
