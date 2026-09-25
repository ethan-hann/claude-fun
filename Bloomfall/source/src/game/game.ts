import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { Renderer, Quality } from '../engine/renderer';
import { loadIslandVisual, loadModel } from '../engine/level';
import { levelData, EntityRec } from '../engine/assets';
import { textureSet, TextureSet, fogUniforms, buildSurfaceMaterial } from '../engine/materials';
import { Physics, G, v3 } from './physics';
import { Input } from './input';
import { Player, Platform, PLAYER } from './player';
import { Graft } from './graft';
import { Lattice, FreeLattice, AnchoredLattice, isLatticeCollider } from './lattice';
import { LatticeVisuals } from './visuals';
import { Entity, EntityContext, Plate, Door, Zone, Pickup } from './entities';

export const STEP = 1 / 60;

export interface IslandDef { key: string; origin: [number, number, number] }

export class Island {
  key: string;
  origin: THREE.Vector3;
  group: THREE.Group | null = null;
  colliders: RAPIER.Collider[] = [];
  staticBody: RAPIER.RigidBody | null = null;
  lattices: Lattice[] = [];
  entities: Entity[] = [];
  spawn = new THREE.Vector3();
  spawnYaw = 0;
  killY = -30;
  title = '';
  startCells = 0;
  bloomPoint: THREE.Vector3 | null = null;
  arrivePoint: THREE.Vector3 | null = null;
  graftTaken = false;
  attached = true;
  private driftT = -1;
  private driftDir = new THREE.Vector3();
  private phys: Physics | null = null;
  lights: THREE.PointLight[] = [];
  constructor(def: IslandDef) {
    this.key = def.key;
    this.origin = new THREE.Vector3(...def.origin);
  }
  bind(phys: Physics): void { this.phys = phys; }
  // Attached islands are solid and visible. Detached ones are gone (drifted into the haze).
  setAttached(v: boolean): void {
    this.attached = v;
    this.driftT = -1;
    if (this.group) { this.group.visible = v; this.group.position.copy(this.origin); }
    const far = new THREE.Vector3(0, -5000, 0);
    this.staticBody?.setTranslation(v ? this.origin : far, true);
    for (const l of this.lattices) { l.object.visible = v; if (!v) l.body.setTranslation(far, false); }
    for (const e of this.entities) (e as any).setVisible?.(v);
    for (const l of this.lights) l.visible = v;
  }
  resetState(): void { this.graftTaken = false; }
  drift(): void {
    if (!this.attached || this.driftT >= 0) return;
    this.driftT = 0;
    this.driftDir.set(Math.random() - 0.5, -0.35, 0.8).normalize();
    // the city takes back what the island held
    const far = new THREE.Vector3(0, -5000, 0);
    this.staticBody?.setTranslation(far, true);
    for (const l of this.lattices) { l.body.setTranslation(far, false); }
    for (const e of this.entities) (e as any).setVisible?.(false);
    for (const l of this.lattices) l.object.visible = false;
    for (const l of this.lights) l.visible = false;
  }
  updateDrift(dt: number): void {
    if (this.driftT < 0 || !this.group) return;
    this.driftT += dt;
    const t = this.driftT;
    const dist = 0.4 * t * t + 0.5 * t;
    this.group.position.copy(this.origin).addScaledVector(this.driftDir, dist);
    this.group.rotation.z = Math.sin(t * 0.1) * 0.02 * t * 0.2;
    if (dist > 600) { this.group.visible = false; this.driftT = -1; this.attached = false; }
  }
}

export class Game {
  r!: Renderer;
  phys = new Physics();
  input!: Input;
  player!: Player;
  graft!: Graft;
  vis = new LatticeVisuals();
  islands: Island[] = [];
  current: Island | null = null;
  lattices = new Map<string, Lattice>();
  entities = new Map<string, Entity>();
  sets: Record<string, TextureSet> = {};
  ctx!: EntityContext;
  time = 0;
  private acc = 0;
  private last = 0;
  running = false;
  paused = false;
  listeners: ((ev: string, data?: any) => void)[] = [];
  private lights: THREE.PointLight[] = [];

  async init(defs: IslandDef[], quality: Quality = 'high'): Promise<void> {
    this.r = new Renderer();
    document.body.appendChild(this.r.renderer.domElement);
    this.r.quality = quality;
    await Promise.all([this.r.init(), this.phys.init()]);
    for (const k of ['plates', 'steel', 'lattice', 'marble', 'wall', 'rust']) this.sets[k] = await textureSet(k);
    await this.vis.init();
    this.gloveModel = await loadModel('glove');
    this.gloveModel.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const n = (m.material as THREE.Material).name.split('.')[0];
      m.material = n.startsWith('glow') ? new THREE.MeshStandardMaterial({ color: 0, emissive: 0x8fe8ff, emissiveIntensity: n === 'glow_white' ? 3 : 1.2 })
        : buildSurfaceMaterial(n, this.sets[n] ?? this.sets.lattice, { skyVis: { value: 1 } });
    });
    this.input = new Input(this.r.renderer.domElement);
    this.player = new Player(this.phys);
    this.graft = new Graft(this.phys);
    this.ctx = {
      phys: this.phys, scene: this.r.scene, player: this.player, lattices: this.lattices, entities: this.entities,
      sets: this.sets, emit: (e, d) => this.emit(e, d), origin: new THREE.Vector3(),
    };
    for (const d of defs) {
      const isl = new Island(d);
      await this.loadIsland(isl);
      this.islands.push(isl);
    }
    this.current = this.islands[0];
    this.respawn();
  }

  emit(ev: string, data?: any): void {
    for (const l of this.listeners) l(ev, data);
  }

  async loadIsland(isl: Island): Promise<void> {
    const data = levelData(isl.key)!;
    const vis = await loadIslandVisual(isl.key);
    vis.group.position.copy(isl.origin);
    vis.group.updateMatrixWorld(true);
    this.r.scene.add(vis.group);
    isl.group = vis.group;
    isl.title = data.title;
    isl.colliders = this.phys.addStatic(data.colliders, isl.origin);
    isl.staticBody = isl.colliders[0]?.parent() ?? null;
    isl.bind(this.phys);
    isl.killY = isl.origin.y + (data.meta.killY ?? -30);
    isl.startCells = data.meta.startCells ?? 0;
    this.ctx.origin = isl.origin;
    for (const rec of data.entities) this.createEntity(isl, rec);
  }

  private createEntity(isl: Island, rec: EntityRec): void {
    const o = isl.origin;
    const id = rec.id ? `${isl.key}.${rec.id}` : `${isl.key}.${rec.type}${Math.random().toString(36).slice(2, 7)}`;
    const scene = this.r.scene;
    switch (rec.type) {
      case 'spawn':
        isl.spawn.copy(v3(rec.p).add(o));
        isl.spawnYaw = THREE.MathUtils.degToRad(rec.yaw ?? 0);
        break;
      case 'crate':
      case 'orb': {
        const p = v3(rec.p).add(o);
        const l = new FreeLattice(this.phys, this.vis, id, rec.type, p, rec.level ?? 0, THREE.MathUtils.degToRad(rec.ry ?? 0));
        l.islandKey = isl.key;
        scene.add(l.object);
        isl.lattices.push(l);
        this.lattices.set(id, l);
        break;
      }
      case 'pillar': {
        const w = rec.size[0], d = rec.size[1];
        const heights: number[] = rec.heights;
        const depth = rec.depth ?? 4;
        const H = depth + heights[heights.length - 1];
        const base = v3(rec.p).add(o).add(new THREE.Vector3(0, -H / 2, 0));
        const obj = this.vis.pillar(w, d, H);
        const l = new AnchoredLattice(this.phys, this.vis, id, 'pillar', obj, base, new THREE.Vector3(0, 1, 0), heights, rec.level ?? 0,
          new THREE.Vector3(w / 2, H / 2, d / 2), THREE.MathUtils.degToRad(rec.ry ?? 0), rec.speed ?? 2.2);
        this.addAnchored(isl, l);
        break;
      }
      case 'span': {
        const dir = new THREE.Vector3(rec.dir[0], 0, rec.dir[1]).normalize();
        const len = rec.length;
        const t = rec.thickness ?? 0.4;
        const w = rec.width ?? 2;
        const anchor = v3(rec.p).add(o);
        const base = anchor.clone().addScaledVector(dir, -len / 2).add(new THREE.Vector3(0, -t / 2, 0));
        const ry = Math.atan2(dir.x, dir.z);
        const obj = this.vis.span(w, t, len);
        const l = new AnchoredLattice(this.phys, this.vis, id, 'span', obj, base, dir, rec.extensions ?? [0, len], rec.level ?? 0,
          new THREE.Vector3(w / 2, t / 2, len / 2), ry, rec.speed ?? 3.0);
        this.addAnchored(isl, l);
        break;
      }
      case 'bulkhead': {
        const [w, h, d] = rec.size;
        const base = v3(rec.p).add(o);
        const obj = this.vis.bulkhead(w, h, d);
        const l = new AnchoredLattice(this.phys, this.vis, id, 'bulkhead', obj, base, new THREE.Vector3(0, 1, 0), [-h / 2, h / 2], rec.level ?? 1,
          new THREE.Vector3(w / 2, h / 2, d / 2), THREE.MathUtils.degToRad(rec.ry ?? 0), rec.speed ?? 2.6);
        this.addAnchored(isl, l);
        break;
      }
      case 'plate': {
        const e = new Plate(rec, this.ctx);
        this.addEntity(isl, id, e);
        break;
      }
      case 'door': {
        const r2 = { ...rec, openIf: (rec.openIf ?? []).map((x: string) => `${isl.key}.${x}`) };
        const e = new Door(r2, this.ctx);
        this.addEntity(isl, id, e);
        break;
      }
      case 'zone': {
        const e = new Zone(rec, this.ctx);
        this.addEntity(isl, id, e);
        break;
      }
      case 'light': {
        const l = new THREE.PointLight(new THREE.Color(rec.color[0], rec.color[1], rec.color[2]), rec.intensity, rec.range || 12, 2);
        l.position.copy(v3(rec.p).add(o));
        scene.add(l);
        this.lights.push(l);
        isl.lights.push(l);
        break;
      }
      case 'bloom':
        isl.bloomPoint = v3(rec.p).add(o);
        break;
      case 'arrive':
        isl.arrivePoint = v3(rec.p).add(o);
        break;
      case 'pickup': {
        const obj = this.pickupObject(rec.kind);
        const e = new Pickup({ ...rec, type: rec.kind }, this.ctx, obj);
        this.addEntity(isl, id, e);
        break;
      }
      default:
        break;
    }
  }

  private gloveModel: THREE.Object3D | null = null;

  private pickupObject(kind: string): THREE.Object3D {
    const g = new THREE.Group();
    if (kind === 'graft' && this.gloveModel) {
      const m = this.gloveModel.clone(true);
      m.rotation.set(0, Math.PI * 0.35, Math.PI / 2);
      m.position.y = 0.06;
      g.add(m);
      return g;
    }
    const glow = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: kind === 'seed' ? new THREE.Color(0.6, 1.0, 0.75) : new THREE.Color(0.45, 0.9, 1.0), emissiveIntensity: 4, roughness: 0.3 });
    const shell = buildSurfaceMaterial('steel', this.sets.steel, { skyVis: { value: 1 } });
    if (kind === 'seed') {
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.09, 24, 16), glow);
      core.scale.set(1, 1.35, 1);
      g.add(core);
      for (let i = 0; i < 5; i++) {
        const petal = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), shell);
        petal.scale.set(0.9, 1.6, 0.4);
        petal.rotation.set(0.5, (i / 5) * Math.PI * 2, 0);
        petal.position.set(Math.sin((i / 5) * Math.PI * 2) * 0.05, -0.06, Math.cos((i / 5) * Math.PI * 2) * 0.05);
        g.add(petal);
      }
    } else {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.22, 20), glow);
      g.add(cap);
      for (const y of [-0.13, 0.13]) {
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 20), shell);
        ring.position.y = y;
        g.add(ring);
      }
    }
    return g;
  }

  isInterior(): boolean {
    const hit = this.phys.castRay(this.r.camera.position, new THREE.Vector3(0, 1, 0), 10, G.STATIC, null);
    return !!hit;
  }

  private addAnchored(isl: Island, l: AnchoredLattice): void {
    l.islandKey = isl.key;
    this.r.scene.add(l.object);
    isl.lattices.push(l);
    this.lattices.set(l.id, l);
  }

  private addEntity(isl: Island, id: string, e: Entity): void {
    e.id = id;
    isl.entities.push(e);
    this.entities.set(id, e);
  }

  platformOf = (c: RAPIER.Collider): Platform | null => {
    const o = this.phys.owners.get(c.handle);
    if (!o) return null;
    if (o.kind === 'lattice') return o.lattice as Lattice;
    if (o.kind === 'door') return o.door as Door;
    if (o.kind === 'platform') return o.platform as Platform;
    return null;
  };

  respawn(): void {
    const isl = this.current!;
    this.player.teleport(isl.spawn, isl.spawnYaw);
  }

  // Push the player out of anything that moved into it (growing crates, rising lattice, doors).
  private depenetrate(): void {
    const pc = this.player.collider;
    const push = new THREE.Vector3();
    for (const l of this.lattices.values()) {
      if (!l.animating && l.kind !== 'crate' && l.kind !== 'orb') continue;
      if ((l as FreeLattice).held) continue;
      const c = pc.contactCollider(l.collider, 0.0);
      if (c && c.distance < -0.001) {
        const n = new THREE.Vector3(c.normal1.x, c.normal1.y, c.normal1.z);
        push.addScaledVector(n, c.distance);
      }
    }
    if (push.lengthSq() > 0) {
      if (push.length() > 0.6) push.setLength(0.6);
      this.player.pushOut.add(push);
    }
  }

  fixedUpdate(dt: number, first: boolean): void {
    const input = this.input;
    for (const l of this.lattices.values()) l.update(dt);
    for (const e of this.entities.values()) e.fixedUpdate(dt, this.ctx);
    this.depenetrate();
    this.player.fixedUpdate(dt, input, this.platformOf);
    // game logic aims from the latest physics pose; rendering re-applies it with interpolation
    this.player.applyCamera(this.r.camera, 1);
    this.r.camera.updateMatrixWorld();
    if (first) {
      this.graft.update(dt, input, this.r.camera, this.player);
      if (input.pressed.has('use')) this.use();
    } else {
      this.graft.updateHeld(dt, this.r.camera, this.player);
    }
    this.phys.step((h, force) => {
      const o = this.phys.owners.get(h);
      if (o && o.kind === 'lattice' && (o.lattice as Lattice).free) this.emit('impact', { lattice: o.lattice, force });
    });
    // falls
    const isl = this.current!;
    if (this.player.pos.y < isl.killY) this.emit('fell');
    for (const l of this.lattices.values()) {
      if (!l.free) continue;
      const fl = l as FreeLattice;
      if (fl.position().y < isl.killY - 10) {
        if (this.graft.held === fl) this.graft.drop(false);
        fl.respawn();
        this.emit('lattice-respawn', fl);
      }
    }
    this.time += dt;
  }

  use(): void {
    const g = this.graft;
    if (g.held) { g.drop(); return; }
    for (const e of this.entities.values()) {
      if (e instanceof Pickup && e.near(this.player.feet)) { e.take(this.ctx); return; }
    }
    if (g.canGrab()) g.grab();
  }

  frameHook: ((dt: number, lookDX: number, lookDY: number) => void) | null = null;

  frame(now: number): void {
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    let lx = 0, ly = 0;
    if (!this.paused) {
      this.input.pollGamepad(dt);
      const look = this.input.consumeLook();
      lx = look.dx; ly = look.dy;
      this.player.look(look.dx, look.dy);
      this.acc += dt;
      let first = true;
      let n = 0;
      while (this.acc >= STEP && n < 6) {
        this.fixedUpdate(STEP, first);
        first = false;
        this.acc -= STEP;
        n++;
      }
      if (n === 6) this.acc = 0;
    } else {
      this.input.consumeLook();
    }
    this.frameHook?.(dt, lx, ly);
    this.input.endFrame();
    this.renderFrame(dt);
  }

  renderFrame(dt: number): void {
    const alpha = this.acc / STEP;
    for (const l of this.lattices.values()) (l as any).syncObject(alpha);
    for (const e of this.entities.values()) e.frameUpdate(dt, alpha, this.ctx);
    if (!this.paused) {
      this.player.applyCamera(this.r.camera, alpha);
      this.r.focus.copy(this.player.pos);
    }
    for (const l of this.lattices.values()) l.highlight += ((l === this.graft.target ? 1 : 0) - l.highlight) * Math.min(1, dt * 12);
    this.r.render(dt);
  }

  start(): void {
    this.running = true;
    this.last = performance.now();
    const loop = (t: number) => {
      if (!this.running) return;
      this.frame(t);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // Advance the simulation without rendering (for tests), then render once.
  simulate(seconds: number, render = true): void {
    const steps = Math.round(seconds / STEP);
    for (let i = 0; i < steps; i++) {
      const look = this.input.consumeLook();
      this.player.look(look.dx, look.dy);
      this.fixedUpdate(STEP, true);
      this.input.endFrame();
    }
    this.acc = 0;
    if (render) this.renderFrame(STEP);
  }
}

void G; void PLAYER; void isLatticeCollider; void fogUniforms;
