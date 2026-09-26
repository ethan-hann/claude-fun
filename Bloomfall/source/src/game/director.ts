import * as THREE from 'three';
import { Game, Island } from './game';
import { UI, Settings, applyUiScale } from './ui';
import { Audio } from './audio';
import { ECHOES, SEEDS, EPILOGUE, CHAPTERS } from './story';
import { Bridge } from './bridge';
import { ViewModel } from './viewmodel';
import { Zone, Pickup, Plate, Door, Toppler } from './entities';
import { FREE_SIZES } from './lattice';
import { FreeLattice, Lattice } from './lattice';
import type { Quality } from '../engine/renderer';
import { islandScripts, IslandScript } from './scripts';
import { BloomFlower } from './bloom';
import { loadModel } from '../engine/level';
import { Dust } from './fx';
import { Heart } from './heart';
import { skyUniforms } from '../engine/sky';
import { fogUniforms } from '../engine/materials';
import world from '../../shared/world.json';

export interface IslandPlan { key: string; origin: [number, number, number]; capacity: number; infinite?: boolean }

const SAVE_KEY = 'bloomfall.save.v1';
const TITLE_A = new THREE.Vector3(-60, 26, -70);
const TITLE_B = new THREE.Vector3(-50, 21, -90);
const TITLE_LOOK = new THREE.Vector3(20, 10, -190);
const SETTINGS_KEY = 'bloomfall.settings.v1';

interface SaveData { island: number; reached?: number; seeds: string[]; time: number; resets: number; falls: number; done?: boolean }

function loadJSON<T>(key: string): T | null {
  try { const s = localStorage.getItem(key); return s ? (JSON.parse(s) as T) : null; } catch { return null; }
}
function saveJSON(key: string, v: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ }
}

export class Director {
  game: Game;
  ui: UI;
  audio = new Audio();
  vm!: ViewModel;
  plan: IslandPlan[];
  index = 0;
  bridges: (Bridge | null)[] = [];
  flowers: (BloomFlower | null)[] = [];
  dust!: Dust;
  heartPos = new THREE.Vector3(0, 60, -620);
  private coreHoldBeam = 0;
  private endT = 0;
  private endHeart: Heart | null = null;
  private endCam: { pos: THREE.Vector3; quat: THREE.Quaternion } | null = null;
  private fly: { group: THREE.Object3D; start: THREE.Vector3; t0: number; spin: number }[] = [];
  private endFlags = new Set<string>();
  state: 'title' | 'playing' | 'paused' | 'ending' | 'credits' = 'title';
  save: SaveData = { island: 0, seeds: [], time: 0, resets: 0, falls: 0 };
  settings: Settings;
  private shownCards = new Set<string>();
  private firedEchoes = new Set<string>();
  private cardDismiss: { key: string; test: () => boolean } | null = null;
  private lookAccum = 0;
  private moveAccum = 0;
  private resetHold = 0;
  private respawning = false;
  private titleT = 0;
  private scripts: Record<string, IslandScript>;
  private lastPlateWeights = new Map<string, number>();
  private impactCooldown = new Map<number, number>();
  private hintIdx = 0;
  arrived = new Set<number>();

  constructor(game: Game, plan: IslandPlan[]) {
    this.game = game;
    this.plan = plan;
    this.settings = { quality: 'high', sensitivity: 1, invertY: false, fov: 74, volume: 0.8, music: 0.6, uiScale: 1, ...(loadJSON<Settings>(SETTINGS_KEY) ?? {}) };
    applyUiScale(this.settings.uiScale);
    this.ui = new UI(this.settings);
    this.scripts = islandScripts(this);
    const s = loadJSON<SaveData>(SAVE_KEY);
    if (s) this.save = s;
  }

  get island(): Island { return this.game.islands[this.index]; }

  // Bridges start at the edge of the bloom dais, facing the next island.
  private bridgeStart(bloom: THREE.Vector3, to: THREE.Vector3): THREE.Vector3 {
    const d = new THREE.Vector3(to.x - bloom.x, 0, to.z - bloom.z).normalize();
    return bloom.clone().addScaledVector(d, 2.3);
  }

  async init(): Promise<void> {
    const g = this.game;
    this.vm = new ViewModel(g.r.scene, g.r.camera);
    this.dust = new Dust(g.r.scene);
    g.r.scene.add(g.r.camera);
    await this.vm.load(g.sets);
    // bridges between consecutive islands
    for (let i = 0; i < g.islands.length - 1; i++) {
      const a = g.islands[i];
      const b = g.islands[i + 1];
      if (a.bloomPoint && b.arrivePoint) {
        const br = new Bridge(g.phys, g.r.scene, this.bridgeStart(a.bloomPoint, b.arrivePoint), b.arrivePoint, g.sets, null);
        br.onSegment = (k, p) => this.audio.bridgeSegment(p, k);
        this.bridges.push(br);
      } else this.bridges.push(null);
    }
    // the bloom flower on each island's exit dais (a child of the island, so it drifts with it)
    const bloomModel = await loadModel('bloom');
    for (const isl of g.islands) {
      if (!isl.bloomPoint || !isl.group) { this.flowers.push(null); continue; }
      const f = new BloomFlower(bloomModel, g.sets, isl.bloomPoint.clone().sub(isl.origin), g.r.lights);
      f.onOpen = () => this.audio.bloomOpen(isl.bloomPoint!.clone());
      isl.group.add(f.group);
      this.flowers.push(f);
    }
    // the Heart glows in the sky from every island
    for (const e of g.entities.values()) if (e instanceof Heart) this.heartPos.copy(e.center);
    skyUniforms.uHeartPos.value.copy(this.heartPos);
    g.listeners.push((ev, d) => this.onEvent(ev, d));
    g.player.onStep = () => this.audio.footstep(g.player.feet.clone(), 'stone', g.player.sprinting);
    g.player.onLand = (v) => { if (v > 3) this.audio.land(g.player.feet.clone(), v); };
    g.player.onJump = () => this.audio.jump(g.player.feet.clone());
    g.input.onLockChange = (locked) => { if (!locked && this.state === 'playing') this.pause(); };
    this.ui.handlers = {
      onNew: () => this.newGame(),
      onContinue: () => this.continueGame(),
      onResume: () => this.resume(),
      onResetIsland: () => { this.resume(); this.resetIsland(); },
      onQuit: () => this.toTitle(),
      onSettings: (s) => this.applySettings(s),
      onChapter: (i) => {
        if (i === 0) return this.newGame();
        this.save.island = i;
        saveJSON(SAVE_KEY, this.save);
        this.startAt(i, false);
      },
    };
    this.applySettings(this.settings);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.state === 'paused') { e.preventDefault(); this.resume(); }
    });
  }

  applySettings(s: Settings): void {
    this.settings = s;
    saveJSON(SETTINGS_KEY, s);
    const g = this.game;
    applyUiScale(s.uiScale);
    g.input.sensitivity = s.sensitivity;
    g.input.invertY = s.invertY;
    g.r.camera.fov = s.fov;
    g.r.camera.updateProjectionMatrix();
    if (g.r.quality !== s.quality) g.r.setQuality(s.quality as Quality);
    this.audio.setVolumes(s.volume, s.music);
  }

  // ---------------------------------------------------------------- flow
  showTitle(): void {
    this.state = 'title';
    this.ui.setHudVisible(false);
    const has = !!loadJSON<SaveData>(SAVE_KEY);
    const s = loadJSON<SaveData>(SAVE_KEY);
    const label = s && s.island > 0 ? `Continue: ${CHAPTERS[this.plan[s.island]?.key]?.name ?? ''}` : 'Continue';
    this.ui.setTitleContinue(has, label);
    const reached = Math.max(s?.reached ?? 0, s?.island ?? 0);
    this.ui.setChapters(this.plan.map((p, i) => ({ numeral: CHAPTERS[p.key]?.numeral ?? '', name: CHAPTERS[p.key]?.name ?? p.key, enabled: i <= reached })));
    this.ui.showScreen('title');
    this.game.paused = true;
    this.titleT = 0;
  }

  newGame(): void {
    this.save = { island: 0, reached: Math.max(this.save.reached ?? 0, this.save.island ?? 0), seeds: this.save.seeds ?? [], time: 0, resets: 0, falls: 0 };
    saveJSON(SAVE_KEY, this.save);
    this.startAt(0, true);
  }

  continueGame(): void {
    const s = loadJSON<SaveData>(SAVE_KEY);
    if (!s) return this.newGame();
    this.save = s;
    this.startAt(Math.min(s.island, this.plan.length - 1), false);
  }

  private startAt(i: number, fresh: boolean): void {
    this.clearEnding();
    this.audio.start();
    this.audio.ui();
    const g = this.game;
    this.ui.showScreen(null);
    this.ui.setHudVisible(true);
    this.shownCards.clear();
    this.firedEchoes.clear();
    this.arrived.clear();
    // islands before i are gone; the rest are in place
    if (g.graft.held) g.graft.drop(false);
    g.islands.forEach((isl, k) => {
      for (const l of isl.lattices) { l.disabled = false; l.reset(); }
      isl.setAttached(k >= i);
      isl.resetState();
    });
    this.flowers.forEach((f) => f?.reset());
    this.bridges.forEach((b, k) => {
      if (!b) return;
      b.dispose();
      const a = g.islands[k], c = g.islands[k + 1];
      const nb = new Bridge(g.phys, g.r.scene, this.bridgeStart(a.bloomPoint!, c.arrivePoint!), c.arrivePoint!, g.sets, null);
      nb.onSegment = (n, p) => this.audio.bridgeSegment(p, n);
      this.bridges[k] = nb;
    });
    for (const e of g.entities.values()) e.reset(g.ctx);
    this.index = i;
    g.current = g.islands[i];
    this.arrived.add(i);
    for (const s of Object.values(this.scripts)) s.reset?.();
    this.setupGraft();
    g.islands.forEach((isl) => this.syncPickups(isl));
    g.respawn();
    g.paused = false;
    this.state = 'playing';
    g.input.requestLock();
    this.ui.fade(1, 0);
    setTimeout(() => this.ui.fade(0, 2.2), 50);
    this.ui.chapter(g.current.key);
    if (i === 0 && fresh) this.echoOnce('wake', 1.5);
    this.scripts[g.current.key]?.arrive?.(false);
  }

  // After a reset, pickups the player already has stay gone: the Graft once it is worn, the second
  // cell once the Graft holds two, and memories kept in the save.
  private syncPickups(isl: Island): void {
    const gr = this.game.graft;
    for (const e of isl.entities) {
      if (!(e instanceof Pickup)) continue;
      if (e.kind === 'graft') e.setTaken(gr.owned);
      else if (e.kind === 'upgrade') e.setTaken(gr.capacity >= (e.rec.capacity ?? 2));
      else if (e.kind === 'seed') e.setTaken(this.save.seeds.includes(isl.key));
    }
  }

  private setupGraft(): void {
    const p = this.plan[this.index];
    const gr = this.game.graft;
    if (gr.held) gr.drop(false);
    gr.owned = this.index > 0 || this.island.graftTaken;
    gr.capacity = p.capacity;
    gr.infinite = !!p.infinite;
    gr.cells = this.island.startCells;
    this.vm.show(gr.owned);
  }

  pause(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.game.paused = true;
    const s = this.save;
    const mins = Math.floor(s.time / 60);
    this.ui.setPauseStats(`<b>${CHAPTERS[this.island.key]?.numeral ?? ''} · ${CHAPTERS[this.island.key]?.name ?? ''}</b><br>Memories kept: <b>${s.seeds.length} of 6</b><br>Time: <b>${mins} min</b>`);
    this.ui.showScreen('pause');
    this.ui.setHudVisible(false);
    this.game.input.exitLock();
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.ui.showScreen(null);
    this.ui.setHudVisible(true);
    this.game.paused = false;
    this.game.input.requestLock();
    this.audio.ui();
  }

  toTitle(): void {
    this.game.input.exitLock();
    this.ui.clearEcho();
    this.ui.card(null);
    this.showTitle();
  }

  // ---------------------------------------------------------------- events
  private onEvent(ev: string, d: any): void {
    const g = this.game;
    switch (ev) {
      case 'zone-enter': this.onZone(d as Zone); break;
      case 'pickup': this.onPickup(d as Pickup); break;
      case 'fell': this.onFell(); break;
      case 'plate-on': this.audio.plate((d as Plate).pos, true); this.scripts[this.island.key]?.plate?.(d, true); break;
      case 'plate-off': this.audio.plate((d as Plate).pos, false); this.scripts[this.island.key]?.plate?.(d, false); break;
      case 'door-move': this.audio.doorMove((d as Door).closedPos, 1.6); break;
      case 'door-open': this.audio.doorStop((d as Door).openPos); this.dismissCardOn('door'); break;
      case 'door-shut': this.audio.doorStop((d as Door).closedPos); break;
      case 'lattice-respawn': this.ui.toast('It fell into the haze. The city returned it.', 3); break;
      case 'toppled': {
        const t = d as Toppler;
        const p = t.impactPoint();
        this.dust.burst(p, 1.3, 90);
        this.dust.burst(t.base.clone(), 0.8, 40);
        this.audio.impact(p, 3, 60);
        this.audio.rumble(p, 2.2, 0.55);
        g.shake = Math.max(g.shake, 0.55);
        break;
      }
      case 'impact': {
        const { lattice, force } = d as { lattice: FreeLattice; force: number };
        const h = lattice.collider.handle;
        const now = g.time;
        if ((this.impactCooldown.get(h) ?? 0) > now) break;
        this.impactCooldown.set(h, now + 0.12);
        this.audio.impact(lattice.position(), lattice.size, force / (lattice.size * lattice.size * 40));
        break;
      }
    }
  }

  echoOnce(key: string, delay = 0): void {
    if (this.firedEchoes.has(key)) return;
    this.firedEchoes.add(key);
    const lines = ECHOES[key];
    if (!lines) return;
    setTimeout(() => this.ui.echo(lines.map((l) => l.text)), delay * 1000);
  }

  showCard(key: string, dismiss?: () => boolean, seconds = 0): void {
    if (this.shownCards.has(key)) return;
    this.shownCards.add(key);
    this.ui.card(key, seconds);
    this.cardDismiss = dismiss ? { key, test: dismiss } : null;
  }

  private dismissCardOn(what: string): void {
    const k = this.ui.currentCard;
    if (!k) return;
    const map: Record<string, string[]> = { door: ['carry', 'weight'], give: ['give'], take: ['take'], grab: ['carry'], graft: ['graft'] };
    if (map[what]?.includes(k)) this.ui.card(null);
  }

  private onZone(z: Zone): void {
    const r = z.rec;
    const gr = this.game.graft;
    if (r.card) {
      const key = r.card as string;
      const skip = (key === 'graft' && gr.owned) || ((key === 'take' || key === 'give') && !gr.owned);
      if (!skip) {
        const tests: Record<string, () => boolean> = {
          look: () => this.lookAccum > 500,
          move: () => this.moveAccum > 5,
          jump: () => this.game.player.pos.z < this.game.current!.origin.z + 12.4 && this.game.player.grounded,
          step: () => this.game.player.feet.y > this.game.current!.origin.y + 1.9,
          ride: () => this.game.player.feet.y > this.game.current!.origin.y + 2.9,
          span: () => this.game.player.pos.z < this.game.current!.origin.z - 3.4,
          pillar: () => this.game.player.feet.y > this.game.current!.origin.y + 2.5,
        };
        // cards without a completion test leave on their own after a while
        this.showCard(key, tests[key], tests[key] || ['carry', 'take', 'give', 'graft', 'weight'].includes(key) ? 0 : 30);
      }
    }
    if (r.echo) this.echoOnce(r.echo as string, 0.3);
    // standing still with an empty Graft for a while: remind the player where space comes from
    if (r.takeback && gr.owned && !gr.infinite) {
      setTimeout(() => {
        if (this.game.graft.cells === 0 && z.inside && !this.ui.currentCard && this.state === 'playing') this.showCard('takeback', undefined, 12);
      }, 10000);
    }
    if (r.card === 'weight' && gr.owned && gr.cells === 0 && !gr.infinite) {
      setTimeout(() => { if (this.game.graft.cells === 0 && this.ui.currentCard !== 'weight') this.showCard('takeback', undefined, 10); }, 9000);
    }
    if (r.bloom) this.startBloom();
    if (r.arrive) this.arrive();
    this.scripts[this.island.key]?.zone?.(r.id ?? '', z);
  }

  private onPickup(p: Pickup): void {
    const gr = this.game.graft;
    if (p.kind === 'graft') {
      gr.owned = true;
      this.island.graftTaken = true;
      gr.cells = 0;
      this.vm.show(true);
      this.audio.pickup();
      this.ui.card(null);
      this.echoOnce('graft', 0.8);
    } else if (p.kind === 'upgrade') {
      gr.capacity = Math.max(gr.capacity, p.rec.capacity ?? 2);
      this.audio.pickup();
      this.showCard('capacity', undefined, 7);
      if (p.rec.echo) this.echoOnce(p.rec.echo, 0.5);
    } else if (p.kind === 'seed') {
      const key = this.island.key;
      if (!this.save.seeds.includes(key)) this.save.seeds.push(key);
      saveJSON(SAVE_KEY, this.save);
      const s = SEEDS[key];
      this.audio.memory();
      if (s) this.ui.memory(s.title, s.text, `Memory ${this.save.seeds.length} of 6`);
    }
  }

  private onFell(): void {
    if (this.respawning) return;
    this.respawning = true;
    this.save.falls++;
    this.ui.fade(1, 0.35);
    setTimeout(() => {
      const g = this.game;
      if (g.graft.held) g.graft.drop(false);
      g.respawn();
      this.ui.fade(0, 0.8);
      this.respawning = false;
    }, 420);
  }

  resetIsland(): void {
    const g = this.game;
    this.save.resets++;
    this.ui.fade(1, 0.25);
    setTimeout(() => {
      if (g.graft.held) g.graft.drop(false);
      const isl = this.island;
      for (const l of isl.lattices) if (!l.disabled) l.reset();
      for (const e of isl.entities) e.reset(g.ctx);
      this.syncPickups(isl);
      g.graft.cells = isl.startCells;
      this.scripts[isl.key]?.resetIsland?.();
      g.respawn();
      this.ui.fade(0, 0.6);
    }, 280);
  }

  private startBloom(): void {
    const b = this.bridges[this.index];
    if (!b || b.state !== 'folded') return;
    b.grow();
    this.flowers[this.index]?.bloom();
    this.audio.swell();
    this.audio.rumble(b.from, 2.5, 0.25);
    const key = this.island.key;
    if (key === 'a_vault') this.echoOnce('bloom_a', 1.2);
    this.scripts[key]?.bloom?.();
  }

  private arrive(): void {
    const next = this.index + 1 < this.game.islands.length && this.game.current !== this.game.islands[this.index + 1] ? this.index + 1 : -1;
    void next;
  }

  // Called when the player reaches the next island's arrival zone.
  enterIsland(i: number): void {
    if (this.arrived.has(i)) return;
    this.arrived.add(i);
    const g = this.game;
    const prev = this.index;
    this.index = i;
    g.current = g.islands[i];
    this.save.island = i;
    this.save.reached = Math.max(this.save.reached ?? 0, i);
    // lattice stays with its island
    const held = g.graft.held;
    if (held && g.islands[prev].lattices.includes(held)) {
      g.graft.drop(false);
      held.respawn();
      this.ui.toast('Lattice cannot leave its island. The city took it back.', 3.5);
    }
    saveJSON(SAVE_KEY, this.save);
    this.setupGraft();
    this.ui.chapter(g.current.key);
    this.audio.swell();
    // the bridge behind falls, and the island behind drifts away
    const br = this.bridges[prev];
    setTimeout(() => { br?.collapse(); if (br) this.audio.rumble(br.from, 4, 0.35); }, 2500);
    setTimeout(() => g.islands[prev].drift(), 4500);
    this.scripts[g.current.key]?.arrive?.(true);
  }

  // ---------------------------------------------------------------- per frame
  update(dt: number): void {
    const g = this.game;
    this.ui.update(dt);
    this.audio.update(dt);
    for (const b of this.bridges) b?.update(dt);
    for (const isl of g.islands) { isl.updateDrift(dt); isl.updateChunks(dt); }
    this.dust.update(dt);
    const cur = g.current;
    this.flowers.forEach((f, k) => {
      if (!f) return;
      const isl = g.islands[k];
      f.update(dt, isl === cur && this.state === 'playing' ? g.player.feet.clone().sub(isl.origin) : null, isl.attached && !!isl.group?.visible);
    });
    if (this.state === 'title') {
      this.titleT += dt;
      // a slow drift past the island chain, the sunset to the left and the Heart far ahead
      const k = 0.5 - 0.5 * Math.cos(this.titleT * 0.035);
      const shot = (window as any).__titleCam as number[] | undefined;
      const a = shot ? new THREE.Vector3(shot[0], shot[1], shot[2]) : TITLE_A;
      const b = shot ? new THREE.Vector3(shot[0], shot[1], shot[2]) : TITLE_B;
      const look = shot ? new THREE.Vector3(shot[3], shot[4], shot[5]) : TITLE_LOOK;
      const c = g.r.camera;
      c.position.lerpVectors(a, b, k);
      c.lookAt(look);
      g.r.focus.copy(c.position).add(new THREE.Vector3(0, -8, -30));
      this.vm.show(false);
      return;
    }
    if (this.state === 'ending') { this.updateEnding(dt); return; }
    if (this.state !== 'playing') return;
    this.save.time += dt;
    const input = g.input;
    // arrival: when the player's feet are on the next island's arrival pad
    const nextI = this.index + 1;
    if (nextI < g.islands.length) {
      const nb = g.islands[nextI];
      if (nb.arrivePoint && g.player.feet.distanceTo(nb.arrivePoint) < 3.2) this.enterIsland(nextI);
    }
    // tutorial card dismissal
    const look = { dx: input.lookDX, dy: input.lookDY };
    this.lookAccum += Math.abs(look.dx) + Math.abs(look.dy);
    this.moveAccum += Math.hypot(g.player.vel.x, g.player.vel.z) * dt;
    if (this.cardDismiss && this.ui.currentCard === this.cardDismiss.key && this.cardDismiss.test()) {
      this.ui.card(null);
      this.cardDismiss = null;
    }
    // hold R to reset the island
    if (input.down.has('reset')) {
      this.resetHold += dt;
      if (this.resetHold > 1.2) { this.resetHold = 0; this.resetIsland(); }
    } else this.resetHold = Math.max(0, this.resetHold - dt * 3);
    this.ui.resetProgress(this.resetHold / 1.2);
    if (input.framePressed.has('pause')) this.pause();
    // graft feedback
    const gr = g.graft;
    for (const e of gr.events) {
      if (e.type === 'give' || e.type === 'take') {
        this.vm.action(e.type, e.point);
        const size = (e.target as FreeLattice).size ?? 1;
        if (e.type === 'give') this.audio.give(e.point, size); else this.audio.take(e.point, size);
        this.audio.growHum(e.point, e.type === 'give');
        this.dismissCardOn(e.type);
        // growing lattice against a column's base tips it over
        if (e.type === 'give' && e.target.free) {
          for (const en of this.island.entities) {
            if (en instanceof Toppler && en.push(e.target, FREE_SIZES[e.target.level])) this.audio.groan(en.base.clone());
          }
        }
        this.scripts[this.island.key]?.graft?.(e.type, e.target);
      } else if (e.type === 'fail') {
        this.vm.action('fail', null);
        this.audio.fail();
        this.ui.toast(gr.failText(e.reason));
      } else if (e.type === 'grab') {
        this.audio.grab(e.target.position());
        this.dismissCardOn('grab');
      } else if (e.type === 'drop' || e.type === 'throw') {
        this.audio.drop(e.target.position());
      }
    }
    gr.events.length = 0;
    this.vm.heldTarget = gr.held ? gr.held.object : null;
    // the Heart: hold Take on it
    const heart = this.island.entities.find((e) => e instanceof Heart) as Heart | undefined;
    if (heart) {
      const holding = gr.owned && !!gr.coreTarget && input.down.has('take');
      heart.progress = THREE.MathUtils.clamp(heart.progress + (holding ? dt / 3.2 : -dt * 0.7), 0, 1);
      this.audio.coreHold(heart.progress, holding);
      if (holding) {
        this.coreHoldBeam -= dt;
        if (this.coreHoldBeam <= 0) { this.coreHoldBeam = 0.22; this.vm.action('take', heart.center.clone()); }
        g.shake = Math.max(g.shake, heart.progress * 0.35);
      }
      this.ui.fade(heart.progress * 0.45, 0.15, true);
      if (heart.progress >= 1) this.startEnding(heart);
    }
    this.updateHud();
    // plate notch clicks
    for (const e of g.entities.values()) {
      if (e instanceof Plate) {
        const w = Math.min(e.weight, e.threshold);
        const prev = this.lastPlateWeights.get(e.id) ?? 0;
        if (w > prev) this.audio.notch(e.pos);
        this.lastPlateWeights.set(e.id, w);
      }
    }
    this.scripts[this.island.key]?.update?.(dt);
    // hints
    if (input.framePressed.has('hint')) this.showHint();
  }

  private showHint(): void {
    const hints = this.scripts[this.island.key]?.hints?.() ?? [];
    if (!hints.length) return;
    const h = hints[this.hintIdx % hints.length];
    this.hintIdx++;
    this.ui.toast(h, 6);
  }

  private updateHud(): void {
    const g = this.game;
    const gr = g.graft;
    const t: Lattice | null = gr.target;
    this.ui.setCells(gr.owned, gr.cells, gr.capacity, gr.infinite);
    if (t && gr.owned) {
      const free = t.free;
      this.ui.setTarget({
        name: t.label(), level: t.level, levels: t.maxLevel + 1,
        canGive: t.level < t.maxLevel && (gr.infinite || gr.cells > 0),
        canTake: t.level > t.minLevel && (gr.infinite || gr.cells < gr.capacity),
        carry: free && !gr.held && (t as FreeLattice).carryable() && gr.targetDist < 3.4,
      });
      this.ui.setCrosshair('lattice');
    } else if (t && !gr.owned && t.free && gr.targetDist < 3.4) {
      this.ui.setTarget(null);
      this.ui.setCrosshair('grab');
    } else {
      this.ui.setTarget(null);
      this.ui.setCrosshair('none');
    }
    // prompts
    let prompt: string | null = null;
    if (gr.held) prompt = '{E} Set down    {F} Throw';
    else {
      for (const e of this.island.entities) {
        if (e instanceof Pickup && e.near(g.player.feet)) {
          prompt = e.kind === 'graft' ? '{E} Take the Graft' : e.kind === 'seed' ? '{E} Gather the memory' : '{E} Take the cell';
          break;
        }
      }
      if (!prompt && t && t.free && gr.targetDist < 3.4 && (t as FreeLattice).carryable() && !gr.owned) prompt = '{E} Pick up';
      if (!prompt && t && t.free && gr.targetDist < 3.4 && !(t as FreeLattice).carryable() && !gr.owned) prompt = 'Too heavy to lift';
    }
    this.ui.prompt(prompt);
  }

  frameViewModel(dt: number, lookDX: number, lookDY: number): void {
    const g = this.game;
    const gr = g.graft;
    this.vm.update(dt, {
      cells: gr.cells, capacity: gr.capacity, infinite: gr.infinite, lookDX, lookDY,
      speed: Math.hypot(g.player.vel.x, g.player.vel.z), bob: g.player.bob, grounded: g.player.grounded, aiming: !!gr.target,
    });
    const cam = g.r.camera;
    this.audio.setListener(cam.getWorldPosition(new THREE.Vector3()), cam.getWorldDirection(new THREE.Vector3()));
    this.audio.interior = THREE.MathUtils.lerp(this.audio.interior, this.game.isInterior() ? 1 : 0, Math.min(1, dt * 2));
    this.audio.heartProximity = THREE.MathUtils.clamp(1 - cam.position.distanceTo(this.heartPos) / 700, 0, 1);
  }

  // ---------------------------------------------------------------- the ending
  private startEnding(heart: Heart): void {
    const g = this.game;
    this.state = 'ending';
    this.endT = 0;
    this.endHeart = heart;
    this.endFlags.clear();
    this.fly = [];
    g.controlsLocked = true;
    this.ui.card(null);
    this.ui.clearEcho();
    this.ui.setHudVisible(false);
    this.ui.prompt(null);
    this.audio.ending();
  }

  private updateEnding(dt: number): void {
    const g = this.game;
    const t = (this.endT += dt);
    const h = this.endHeart!;
    const once = (k: string) => { if (this.endFlags.has(k)) return false; this.endFlags.add(k); return true; };
    h.progress = 1;
    h.collapse = THREE.MathUtils.clamp((t - 0.5) / 9.0, 0, 1);
    if (t < 8.5) g.shake = Math.max(g.shake, 0.3 + 0.25 * Math.sin(t * 2.0) ** 2);
    if (t < 2.5) this.ui.fade(0.45 - 0.2 * (t / 2.5), 0.2, true);
    // the camera leaves the Tender and pulls back to watch the city fall inward
    if (t > 2.2 && once('cam')) {
      const cam = g.r.camera;
      this.endCam = { pos: cam.position.clone(), quat: cam.quaternion.clone() };
      this.vm.show(false);
      g.cameraOverride = (c) => {
        const k = THREE.MathUtils.smoothstep(this.endT, 2.2, 7.5);
        // look back along the road the Tender came: the islands come home from there
        const far = h.center.clone().add(new THREE.Vector3(-9, 9, -40));
        c.position.lerpVectors(this.endCam!.pos, far, k);
        const look = new THREE.Matrix4().lookAt(c.position, h.center, new THREE.Vector3(0, 1, 0));
        const q = new THREE.Quaternion().setFromRotationMatrix(look);
        c.quaternion.copy(this.endCam!.quat).slerp(q, THREE.MathUtils.smoothstep(this.endT, 2.2, 4.0));
      };
    }
    // every island rushes back and folds into the Heart
    if (t > 2.5 && once('fly')) {
      g.islands.forEach((isl, k) => {
        if (!isl.group) return;
        const cur = isl === g.current;
        const away = isl.origin.clone().sub(h.center).setY(0).normalize();
        if (away.lengthSq() < 0.1) away.set(0, 0, 1);
        const side = new THREE.Vector3(-away.z, 0, away.x);
        const n = g.islands.length;
        const start = cur ? isl.origin.clone() : h.center.clone().addScaledVector(away, 150 + (n - k) * 30)
          .addScaledVector(side, (k % 2 ? 1 : -1) * (25 + k * 12)).add(new THREE.Vector3(0, (k % 3 - 1) * 22, 0));
        isl.group.visible = true;
        isl.group.position.copy(start);
        this.fly.push({ group: isl.group, start, t0: cur ? 5.0 : 2.4 + (n - 1 - k) * 0.45, spin: (Math.random() - 0.5) * 1.2 });
        if (cur) {
          for (const l of isl.lattices) l.object.visible = false;
          for (const e of isl.entities) if (!(e instanceof Heart)) (e as any).setVisible?.(false);
        }
      });
    }
    for (const f of this.fly) {
      const e = THREE.MathUtils.clamp((t - f.t0) / 5.0, 0, 1);
      const s = Math.max(0.001, 1 - e * e);
      f.group.position.copy(h.center).addScaledVector(f.start.clone().sub(h.center), s);
      f.group.scale.setScalar(s);
      f.group.rotation.y = f.spin * e * e;
    }
    // the sky goes out
    const dark = THREE.MathUtils.smoothstep(t, 3.0, 9.5);
    skyUniforms.uSkyExposure.value = THREE.MathUtils.lerp(world.sky.strength, 0.015, dark);
    fogUniforms.uFogBrightness.value = THREE.MathUtils.lerp(world.sky.strength, 0.015, dark);
    g.r.scene.environmentIntensity = THREE.MathUtils.lerp(world.sky.strength, 0.02, dark);
    if (t > 9.4 && once('flash')) { this.ui.fade(1, 0.35, true); this.audio.chime(0); this.audio.coreHold(0, false); }
    if (t > 10.2 && once('black')) this.ui.fade(1, 1.8, false);
    if (t > 12.5 && once('done')) this.finishGame(true);
  }

  // Undo everything the ending changed (for a new game after the credits).
  private clearEnding(): void {
    const g = this.game;
    g.controlsLocked = false;
    g.cameraOverride = null;
    for (const f of this.fly) { f.group.scale.setScalar(1); f.group.rotation.set(0, 0, 0); }
    this.fly = [];
    skyUniforms.uSkyExposure.value = world.sky.strength;
    fogUniforms.uFogBrightness.value = world.sky.strength;
    g.r.scene.environmentIntensity = world.sky.strength;
    this.endHeart = null;
    this.audio.restoreBuses();
  }

  finishGame(stats: boolean): void {
    this.state = 'credits';
    this.save.done = true;
    saveJSON(SAVE_KEY, { ...this.save, island: this.plan.length - 1 });
    this.game.paused = true;
    this.game.input.exitLock();
    this.ui.setHudVisible(false);
    const mins = Math.floor(this.save.time / 60);
    const secs = Math.floor(this.save.time % 60);
    this.ui.fade(0, 3.0);
    this.ui.showCredits(EPILOGUE, stats ? `Time: <b>${mins}:${String(secs).padStart(2, '0')}</b><br>Memories kept: <b>${this.save.seeds.length} of 6</b><br>Falls: <b>${this.save.falls}</b> · Resets: <b>${this.save.resets}</b><br><br><span style="font-size:0.8em">Bloomfall. Made with Three.js, Rapier, and Blender.<br>Textures, sky, and models from Poly Haven and ambientCG (CC0).</span>` : '');
  }
}
