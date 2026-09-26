import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { Entity, EntityContext } from './entities';
import type { EntityRec } from '../engine/assets';
import { G, groups, SOLID_FILTER, v3 } from './physics';
import { buildSurfaceMaterial } from '../engine/materials';
import type { LightSource } from '../engine/lightpool';

// The Heartbloom's core: a seed of light that keeps making space. It floats over the well in a
// slow flower of lattice petals and two turning rings. Taking it ends the game.

const CORE_VS = /* glsl */ `
  varying vec3 vN;
  varying vec3 vP;
  varying vec3 vView;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vP = position;
    vN = normalize(mat3(modelMatrix) * normal);
    vView = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;

const CORE_FS = /* glsl */ `
  uniform float uTime;
  uniform float uPower;
  varying vec3 vN;
  varying vec3 vP;
  varying vec3 vView;
  void main() {
    float fres = pow(clamp(1.0 - dot(normalize(vN), normalize(vView)), 0.0, 1.0), 2.0);
    vec3 p = normalize(vP);
    float swirl = sin(atan(p.z, p.x) * 3.0 + uTime * 0.7) * 1.5;
    float bands = 0.5 + 0.5 * sin(p.y * 9.0 + uTime * 1.3 + swirl);
    float fine = 0.5 + 0.5 * sin(p.y * 31.0 - uTime * 2.1 + swirl * 2.0);
    vec3 cold = vec3(0.55, 0.9, 1.0);
    vec3 warm = vec3(1.0, 0.86, 0.7);
    vec3 col = cold * (1.6 + 1.4 * bands + 0.5 * fine) + warm * fres * 3.0;
    gl_FragColor = vec4(col * uPower, 1.0);
  }`;

const HALO_FS = /* glsl */ `
  uniform float uPower;
  varying vec3 vN;
  varying vec3 vP;
  varying vec3 vView;
  void main() {
    float f = max(dot(normalize(vN), normalize(vView)), 0.0);
    float a = pow(f, 2.2) * 0.8 * uPower;
    gl_FragColor = vec4(vec3(0.6, 0.92, 1.0) * a * 2.0, a);
  }`;

export class Heart extends Entity {
  center: THREE.Vector3;
  radius: number;
  group = new THREE.Group();
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  progress = 0; // how far the player has taken it (0..1)
  collapse = 0; // the ending: 0 whole .. 1 gone
  private core: THREE.Mesh;
  private halo: THREE.Mesh;
  private coreU = { uTime: { value: 0 }, uPower: { value: 1 } };
  private haloU = { uPower: { value: 1 } };
  private rings: THREE.Mesh[] = [];
  private petals: THREE.Group[] = [];
  private light: LightSource | null = null;
  private t = 0;
  beat = 0; // seconds until the next heartbeat

  constructor(rec: EntityRec, ctx: EntityContext, petal: THREE.Object3D | null) {
    super(rec);
    this.center = v3(rec.p).add(ctx.origin);
    this.radius = rec.r ?? 2.3;
    const r = this.radius;
    this.core = new THREE.Mesh(new THREE.SphereGeometry(r * 0.62, 64, 32),
      new THREE.ShaderMaterial({ uniforms: this.coreU, vertexShader: CORE_VS, fragmentShader: CORE_FS }));
    this.group.add(this.core);
    this.halo = new THREE.Mesh(new THREE.SphereGeometry(r * 1.6, 48, 24),
      new THREE.ShaderMaterial({ uniforms: this.haloU, vertexShader: CORE_VS, fragmentShader: HALO_FS, transparent: true,
        depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide }));
    this.group.add(this.halo);
    const steel = buildSurfaceMaterial('steel', ctx.sets.steel ?? null, { skyVis: { value: 1 } });
    const lattice = buildSurfaceMaterial('lattice', ctx.sets.lattice ?? null, { skyVis: { value: 1 } });
    for (let i = 0; i < 2; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r * (1.05 + i * 0.28), 0.06 + i * 0.02, 12, 96), steel);
      ring.rotation.set(0.4 + i * 0.9, 0, 0.3);
      this.group.add(ring);
      this.rings.push(ring);
    }
    if (petal) {
      const glow = new THREE.MeshStandardMaterial({ color: 0, emissive: new THREE.Color(0.45, 0.88, 1.0), emissiveIntensity: 4, roughness: 1 });
      for (let k = 0; k < 8; k++) {
        const yaw = new THREE.Group();
        yaw.rotation.y = (k / 8) * Math.PI * 2;
        const hinge = new THREE.Group();
        hinge.position.set(r * 0.55, -r * 0.35, 0);
        const p = petal.clone(true);
        p.scale.setScalar(1.55 * r / 2.3);
        p.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          const n = (m.material as THREE.Material).name.split('.')[0];
          m.material = n.startsWith('glow') ? glow : n === 'lattice' ? lattice : steel;
        });
        hinge.add(p);
        yaw.add(hinge);
        this.group.add(yaw);
        this.petals.push(hinge);
      }
    }
    this.group.position.copy(this.center);
    this.group.traverse((o) => { o.frustumCulled = false; });
    ctx.scene.add(this.group);
    const R = ctx.phys.R;
    this.body = ctx.phys.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(this.center.x, this.center.y, this.center.z));
    this.collider = ctx.phys.world.createCollider(R.ColliderDesc.ball(r * 0.75).setCollisionGroups(groups(G.KINEMATIC, SOLID_FILTER)), this.body);
    ctx.phys.owners.set(this.collider.handle, { kind: 'core', heart: this });
    if (ctx.lights) this.light = ctx.lights.add(this.center, new THREE.Color(0.6, 0.92, 1.0), 40, 38);
  }

  frameUpdate(dt: number): void {
    this.t += dt;
    const c = this.collapse;
    const s = Math.max(0.02, 1 - c * 0.985) * (1 - this.progress * 0.25);
    const pulse = 1 + Math.sin(this.t * 5.2) * 0.02 * (1 + this.progress * 3);
    this.core.scale.setScalar(s * pulse);
    this.halo.scale.setScalar(s * (1 + this.progress * 0.4 + c * 2.0));
    this.coreU.uTime.value = this.t;
    this.coreU.uPower.value = 1 + this.progress * 2.5 + c * 6;
    this.haloU.uPower.value = 1 + this.progress * 1.5 + c * 3 - Math.max(0, c - 0.7) * 10;
    this.rings.forEach((r, i) => {
      r.rotation.y += dt * (0.12 + i * 0.07) * (1 + this.progress * 4 + c * 12);
      r.rotation.x += dt * 0.03 * (i ? -1 : 1);
      r.scale.setScalar(Math.max(0.01, 1 - c));
    });
    // petals breathe; while being taken they close over the core
    const lift = 0.62 + Math.sin(this.t * 0.6) * 0.06 + this.progress * 0.8 + c * 0.6;
    this.petals.forEach((p, i) => {
      p.rotation.z = lift + Math.sin(this.t * 0.8 + i) * 0.03;
      p.scale.setScalar(Math.max(0.01, 1 - c));
    });
    if (this.light) this.light.intensity = (40 + this.progress * 60 + c * 200) * (c > 0.9 ? (1 - c) * 10 : 1);
  }

  setVisible(v: boolean): void {
    this.group.visible = v;
    if (this.light) this.light.intensity = v ? 40 : 0;
  }

  reset(): void {
    this.progress = 0;
    this.collapse = 0;
    this.group.visible = true;
  }
}
