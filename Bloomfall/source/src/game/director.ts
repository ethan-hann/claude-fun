import * as THREE from 'three';
import { Game, Island } from './game';
import { UI, Settings } from './ui';
import { Audio } from './audio';
import { ECHOES, SEEDS, EPILOGUE, CHAPTERS } from './story';
import { Bridge } from './bridge';
import { ViewModel } from './viewmodel';
import { Zone, Pickup, Plate, Door } from './entities';
import { FreeLattice, Lattice } from './lattice';
import type { Quality } from '../engine/renderer';
import { islandScripts, IslandScript } from './scripts';

export interface IslandPlan { key: string; origin: [number, number, number]; capacity: number; infinite?: boolean }

const SAVE_KEY = 'bloomfall.save.v1';
const SETTINGS_KEY = 'bloomfall.settings.v1';

interface SaveData { island: number; seeds: string[]; time: number; resets: number; falls: number; done?: boolean }

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
    this.settings = { quality: 'high', sensitivity: 1, invertY: false, fov: 74, volume: 0.8, music: 0.6, ...(loadJSON<Settings>(SETTINGS_KEY) ?? {}) };
    this.ui = new UI(this.settings);
    this.scripts = islandScripts(this);
    const s = loadJSON<SaveData>(SAVE_KEY);
    if (s) this.save = s;
  }

  get island(): Island { return this.game.islands[this.index]; }

  async init(): Promise<void> {
    const g = this.game;
    this.vm = new ViewModel(g.r.scene, g.r.camera);
    g.r.scene.add(g.r.camera);
    await this.vm.load(g.sets);
    // bridges between consecutive islands
    for (let i = 0; i < g.islands.length - 1; i++) {
      const a = g.islands[i];
      const b = g.islands[i + 1];
      if (a.bloomPoint && b.arrivePoint) {
        const br = new Bridge(g.phys, g.r.scene, a.bloomPoint, b.arrivePoint, g.sets, null);
        br.onSegment = (k, p) => this.audio.bridgeSegment(p, k);
        this.bridges.push(br);
      } else this.bridges.push(null);
    }
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
    this.ui.showScreen('title');
    this.game.paused = true;
    this.titleT = 0;
  }

  newGame(): void {
    this.save = { island: 0, seeds: [], time: 0, resets: 0, falls: 0 };
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
    this.audio.start();
    this.audio.ui();
    const g = this.game;
    this.ui.showScreen(null);
    this.ui.setHudVisible(true);
    this.shownCards.clear();
    this.firedEchoes.clear();
    this.arrived.clear();
    // islands before i are gone; the rest are in place
    g.islands.forEach((isl, k) => {
      isl.setAttached(k >= i);
      isl.resetState();
    });
    this.bridges.forEach((b, k) => {
      if (!b) return;
      b.dispose();
      const a = g.islands[k], c = g.islands[k + 1];
      const nb = new Bridge(g.phys, g.r.scene, a.bloomPoint!, c.arrivePoint!, g.sets, null);
      nb.onSegment = (n, p) => this.audio.bridgeSegment(p, n);
      this.bridges[k] = nb;
    });
    for (const l of g.lattices.values()) l.reset();
    for (const e of g.entities.values()) e.reset(g.ctx);
    this.index = i;
    g.current = g.islands[i];
    this.arrived.add(i);
    for (const s of Object.values(this.scripts)) s.reset?.();
    this.setupGraft();
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
    this.game.input.exitLock();
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.ui.showScreen(null);
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
        };
        this.showCard(key, tests[key], key === 'look' ? 0 : 0);
      }
    }
    if (r.echo) this.echoOnce(r.echo as string, 0.3);
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
      this.plan.forEach((pl, i) => { if (i >= this.index) pl.capacity = Math.max(pl.capacity, gr.capacity); });
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
      for (const l of isl.lattices) l.reset();
      for (const e of isl.entities) e.reset(g.ctx);
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
    for (const isl of g.islands) isl.updateDrift(dt);
    if (this.state === 'title') {
      this.titleT += dt;
      const t = this.titleT * 0.05;
      const c = g.r.camera;
      c.position.set(Math.sin(t) * 55 + 10, 14 + Math.sin(t * 0.7) * 3, Math.cos(t) * 45 - 10);
      c.lookAt(0, 0, -12);
      g.r.focus.copy(c.position);
      this.vm.show(false);
      return;
    }
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
    if (input.pressed.has('pause')) this.pause();
    // graft feedback
    const gr = g.graft;
    for (const e of gr.events) {
      if (e.type === 'give' || e.type === 'take') {
        this.vm.action(e.type, e.point);
        const size = (e.target as FreeLattice).size ?? 1;
        if (e.type === 'give') this.audio.give(e.point, size); else this.audio.take(e.point, size);
        this.audio.growHum(e.point, e.type === 'give');
        this.dismissCardOn(e.type);
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
    if (input.pressed.has('hint')) this.showHint();
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
    const heart = new THREE.Vector3(0, 60, -620);
    this.audio.heartProximity = THREE.MathUtils.clamp(1 - cam.position.distanceTo(heart) / 700, 0, 1);
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
    this.ui.showCredits(EPILOGUE, stats ? `Time: <b>${mins}:${String(secs).padStart(2, '0')}</b><br>Memories kept: <b>${this.save.seeds.length} of 6</b><br>Falls: <b>${this.save.falls}</b> · Resets: <b>${this.save.resets}</b><br><br><span style="font-size:0.8em">Bloomfall. Made with Three.js, Rapier, and Blender.<br>Textures, sky, and models from Poly Haven and ambientCG (CC0).</span>` : '');
  }
}
