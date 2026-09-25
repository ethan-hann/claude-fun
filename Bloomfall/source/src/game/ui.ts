import './ui.css';
import { CARDS, CHAPTERS } from './story';
import type { Quality } from '../engine/renderer';

const MOUSE_L = '<svg viewBox="0 0 10 14"><rect x="0.7" y="0.7" width="8.6" height="12.6" rx="4.3" fill="none" stroke="currentColor"/><path d="M1 5 V4.5 A4 4 0 0 1 5 0.9 V5 Z" fill="currentColor"/></svg>';
const MOUSE_R = '<svg viewBox="0 0 10 14"><rect x="0.7" y="0.7" width="8.6" height="12.6" rx="4.3" fill="none" stroke="currentColor"/><path d="M9 5 V4.5 A4 4 0 0 0 5 0.9 V5 Z" fill="currentColor"/></svg>';

export function keys(text: string): string {
  return text.replace(/\{([^}]+)\}/g, (_m, k: string) => {
    if (k === 'LMB') return `<kbd class="mouse">${MOUSE_L}</kbd>`;
    if (k === 'RMB') return `<kbd class="mouse">${MOUSE_R}</kbd>`;
    return `<kbd>${k}</kbd>`;
  });
}

export interface Settings {
  quality: Quality;
  sensitivity: number;
  invertY: boolean;
  fov: number;
  volume: number;
  music: number;
}

export interface MenuHandlers {
  onNew(): void;
  onContinue(): void;
  onResume(): void;
  onResetIsland(): void;
  onQuit(): void;
  onSettings(s: Settings): void;
}

function el(tag: string, attrs: Record<string, string> = {}, html = ''): HTMLElement {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (html) e.innerHTML = html;
  return e;
}

export class UI {
  root: HTMLElement;
  private cross: HTMLElement;
  private target: HTMLElement;
  private toastEl: HTMLElement;
  private cells: HTMLElement;
  private promptEl: HTMLElement;
  private cardEl: HTMLElement;
  private echoEl: HTMLElement;
  private chapterEl: HTMLElement;
  private resetRing: HTMLElement;
  private resetLabel: HTMLElement;
  private fadeEl: HTMLElement;
  private memoryEl: HTMLElement;
  private toastT = 0;
  private cardKey: string | null = null;
  private cardT = 0;
  private echoQueue: string[] = [];
  private echoT = 0;
  private echoShowing = false;
  private chapterT = 0;
  private memoryT = 0;
  private cellsKey = '';
  screens: Record<string, HTMLElement> = {};
  settings: Settings;
  handlers!: MenuHandlers;
  echoActive = false;

  constructor(settings: Settings) {
    this.settings = settings;
    this.root = el('div', { id: 'ui' });
    document.body.appendChild(this.root);
    this.cross = this.add('div', 'crosshair');
    this.target = this.add('div', 'target');
    this.toastEl = this.add('div', 'toast');
    this.cells = this.add('div', 'cells');
    this.promptEl = this.add('div', 'prompt');
    this.cardEl = this.add('div', 'card', '<div class="title"></div><div class="body"></div>');
    this.echoEl = this.add('div', 'echo', '<div class="who">THE GARDENER</div><div class="line"></div>');
    this.chapterEl = this.add('div', 'chapter', '<div class="num"></div><div class="name"></div><div class="rule"></div>');
    this.resetRing = this.add('div', 'reset-ring', '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" fill="none" stroke="rgba(243,236,225,0.25)" stroke-width="3"/><circle id="reset-arc" cx="32" cy="32" r="26" fill="none" stroke="#8fe8ff" stroke-width="3" stroke-dasharray="163.4" stroke-dashoffset="163.4" transform="rotate(-90 32 32)"/></svg>');
    this.resetLabel = this.add('div', 'reset-label', 'Resetting the island');
    this.memoryEl = this.add('div', 'memory', '<div class="t"></div><div class="x"></div><div class="n"></div>');
    this.fadeEl = el('div', { id: 'fade' });
    document.body.appendChild(this.fadeEl);
    this.buildScreens();
  }

  private add(tag: string, id: string, html = ''): HTMLElement {
    const e = el(tag, { id }, html);
    this.root.appendChild(e);
    return e;
  }

  // ------------------------------------------------------------------ HUD
  setHudVisible(v: boolean): void { this.root.style.display = v ? '' : 'none'; }

  setCrosshair(mode: 'none' | 'lattice' | 'grab'): void {
    this.cross.className = mode === 'none' ? '' : mode;
  }

  setTarget(info: { name: string; level: number; levels: number; canGive: boolean; canTake: boolean; carry?: boolean } | null): void {
    if (!info) { this.target.classList.remove('show'); return; }
    const pips = Array.from({ length: info.levels }, (_, i) => `<span class="pip${i <= info.level ? ' on' : ''}"></span>`).join('');
    const acts = `<span class="${info.canGive ? '' : 'off'}">${keys('{LMB}')} Give</span> &nbsp; <span class="${info.canTake ? '' : 'off'}">${keys('{RMB}')} Take</span>` +
      (info.carry ? ` &nbsp; <span>${keys('{E}')} Carry</span>` : '');
    const html = `<div class="name">${info.name}<span class="pips">${pips}</span></div><div class="acts">${acts}</div>`;
    if (this.target.innerHTML !== html) this.target.innerHTML = html;
    this.target.classList.add('show');
  }

  toast(text: string, seconds = 2.2): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    this.toastT = seconds;
  }

  setCells(visible: boolean, cells: number, capacity: number, infinite: boolean): void {
    const key = `${visible}|${cells}|${capacity}|${infinite}`;
    if (key === this.cellsKey) return;
    const pulse = this.cellsKey !== '' && visible;
    this.cellsKey = key;
    this.cells.classList.toggle('show', visible);
    if (infinite) {
      this.cells.innerHTML = '<span class="label">GRAFT</span><span class="inf">∞</span>';
    } else {
      let h = '<span class="label">GRAFT</span>';
      for (let i = 0; i < capacity; i++) h += `<div class="cell${i < cells ? ' full' : ''}"></div>`;
      this.cells.innerHTML = h;
    }
    if (pulse) {
      this.cells.classList.remove('pulse');
      void this.cells.offsetWidth;
      this.cells.classList.add('pulse');
    }
  }

  prompt(text: string | null): void {
    if (!text) { this.promptEl.classList.remove('show'); return; }
    const h = keys(text);
    if (this.promptEl.innerHTML !== h) this.promptEl.innerHTML = h;
    this.promptEl.classList.add('show');
  }

  card(key: string | null, seconds = 0): void {
    if (key === this.cardKey) { if (seconds) this.cardT = seconds; return; }
    this.cardKey = key;
    if (!key) { this.cardEl.classList.remove('show'); return; }
    const c = CARDS[key];
    if (!c) return;
    (this.cardEl.querySelector('.title') as HTMLElement).textContent = c.title;
    (this.cardEl.querySelector('.body') as HTMLElement).innerHTML = keys(c.body);
    this.cardEl.classList.add('show');
    this.cardT = seconds;
  }

  get currentCard(): string | null { return this.cardKey; }

  echo(lines: string[]): void {
    this.echoQueue.push(...lines);
    this.echoActive = true;
  }

  clearEcho(): void {
    this.echoQueue = [];
    this.echoEl.classList.remove('show');
    this.echoShowing = false;
    this.echoActive = false;
  }

  chapter(key: string): void {
    const c = CHAPTERS[key];
    if (!c) return;
    (this.chapterEl.querySelector('.num') as HTMLElement).textContent = c.numeral;
    (this.chapterEl.querySelector('.name') as HTMLElement).textContent = c.name;
    this.chapterEl.classList.add('show');
    this.chapterT = 4.5;
  }

  memory(title: string, text: string, count: string): void {
    (this.memoryEl.querySelector('.t') as HTMLElement).textContent = title;
    (this.memoryEl.querySelector('.x') as HTMLElement).textContent = text;
    (this.memoryEl.querySelector('.n') as HTMLElement).textContent = count;
    this.memoryEl.classList.add('show');
    this.memoryT = 9;
  }

  resetProgress(p: number): void {
    const show = p > 0.02;
    this.resetRing.classList.toggle('show', show);
    this.resetLabel.classList.toggle('show', show);
    const arc = this.resetRing.querySelector('#reset-arc') as SVGCircleElement;
    arc.setAttribute('stroke-dashoffset', String(163.4 * (1 - Math.min(1, p))));
  }

  fade(opacity: number, seconds = 0.6, white = false): void {
    this.fadeEl.classList.toggle('white', white);
    this.fadeEl.style.transition = `opacity ${seconds}s`;
    this.fadeEl.style.opacity = String(opacity);
  }

  update(dt: number): void {
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.toastEl.classList.remove('show'); }
    if (this.cardT > 0) { this.cardT -= dt; if (this.cardT <= 0) this.card(null); }
    if (this.chapterT > 0) { this.chapterT -= dt; if (this.chapterT <= 0) this.chapterEl.classList.remove('show'); }
    if (this.memoryT > 0) { this.memoryT -= dt; if (this.memoryT <= 0) this.memoryEl.classList.remove('show'); }
    // echo lines: fade each in, hold by length, fade out
    this.echoT -= dt;
    if (this.echoT <= 0) {
      if (this.echoShowing) {
        this.echoEl.classList.remove('show');
        this.echoShowing = false;
        this.echoT = 0.9;
      } else if (this.echoQueue.length) {
        const line = this.echoQueue.shift()!;
        (this.echoEl.querySelector('.line') as HTMLElement).textContent = line;
        this.echoEl.classList.add('show');
        this.echoShowing = true;
        this.echoT = 2.2 + line.length * 0.055;
      } else {
        this.echoActive = false;
      }
    }
  }

  // ------------------------------------------------------------------ menus
  private buildScreens(): void {
    const title = el('div', { class: 'screen', id: 'title' }, `
      <div class="shade"></div>
      <div class="panel">
        <h1>BLOOMFALL</h1>
        <div class="sub">The city made room from nothing, until it could not stop.</div>
        <button class="btn" data-a="continue">Continue</button>
        <button class="btn" data-a="new">New journey</button>
        <button class="btn" data-a="settings">Settings</button>
        <button class="btn" data-a="controls">Controls</button>
        <div class="hint">A first-person puzzle game. Headphones help.</div>
      </div>`);
    const pause = el('div', { class: 'screen', id: 'pause' }, `
      <div class="shade"></div>
      <div class="panel">
        <h2>Paused</h2>
        <div class="stats" id="pause-stats"></div>
        <button class="btn" data-a="resume">Resume</button>
        <button class="btn" data-a="reset">Reset this island</button>
        <button class="btn" data-a="settings">Settings</button>
        <button class="btn" data-a="controls">Controls</button>
        <button class="btn" data-a="quit">Quit to title</button>
      </div>`);
    const settings = el('div', { class: 'screen', id: 'settings' }, `
      <div class="shade"></div>
      <div class="panel" style="width:min(34em,86vw)">
        <h2>Settings</h2>
        <div class="row"><label>Graphics</label><div class="ctl" id="set-quality">
          <button class="seg" data-q="low">Low</button><button class="seg" data-q="medium">Medium</button>
          <button class="seg" data-q="high">High</button><button class="seg" data-q="ultra">Ultra</button></div></div>
        <div class="row"><label>Mouse sensitivity</label><div class="ctl"><input type="range" id="set-sens" min="0.2" max="3" step="0.05"></div></div>
        <div class="row"><label>Invert look</label><div class="ctl"><button class="seg" id="set-invert">Off</button></div></div>
        <div class="row"><label>Field of view</label><div class="ctl"><input type="range" id="set-fov" min="60" max="100" step="1"><span id="fov-val"></span></div></div>
        <div class="row"><label>Volume</label><div class="ctl"><input type="range" id="set-vol" min="0" max="1" step="0.02"></div></div>
        <div class="row"><label>Music</label><div class="ctl"><input type="range" id="set-music" min="0" max="1" step="0.02"></div></div>
        <div class="hint">Low turns off real-time shadows and ambient occlusion and renders at a lower resolution. Ultra sharpens shadows and renders at up to twice the screen's resolution.</div>
        <button class="btn" data-a="back" style="margin-top:1.2em">Back</button>
      </div>`);
    const controls = el('div', { class: 'screen', id: 'controls' }, `
      <div class="shade"></div>
      <div class="panel" style="width:min(32em,86vw)">
        <h2>Controls</h2>
        <table class="controls-table">
          <tr><td>Move</td><td>${keys('{W}{A}{S}{D}')}</td></tr>
          <tr><td>Look</td><td>Mouse</td></tr>
          <tr><td>Jump</td><td>${keys('{Space}')}</td></tr>
          <tr><td>Run</td><td>${keys('{Shift}')}</td></tr>
          <tr><td>Give space (grow)</td><td>${keys('{LMB}')} or ${keys('{Z}')}</td></tr>
          <tr><td>Take space (shrink)</td><td>${keys('{RMB}')} or ${keys('{X}')}</td></tr>
          <tr><td>Pick up, set down, use</td><td>${keys('{E}')}</td></tr>
          <tr><td>Throw</td><td>${keys('{F}')}</td></tr>
          <tr><td>Reset the island</td><td>Hold ${keys('{R}')}</td></tr>
          <tr><td>Hint</td><td>${keys('{H}')}</td></tr>
          <tr><td>Pause</td><td>${keys('{Esc}')}</td></tr>
        </table>
        <div class="hint">Gamepad: left stick moves, right stick looks, A jumps, RT gives, LT takes, X uses, B throws, Y resets, Start pauses.</div>
        <button class="btn" data-a="back" style="margin-top:1.2em">Back</button>
      </div>`);
    const credits = el('div', { class: 'screen', id: 'credits' }, `
      <div class="shade" style="background:rgba(4,4,7,0.9)"></div>
      <div class="panel">
        <div class="epi" id="epilogue"></div>
        <div class="stats" id="end-stats"></div>
        <button class="btn" data-a="quit">Return to the title</button>
      </div>`);
    for (const s of [title, pause, settings, controls, credits]) {
      document.body.appendChild(s);
      this.screens[s.id] = s;
    }
    let back = 'title';
    const show = (id: string | null) => {
      for (const [k, s] of Object.entries(this.screens)) s.classList.toggle('show', k === id);
    };
    this.showScreen = (id) => { if (id === 'settings' || id === 'controls') { /* keep back */ } else if (id) back = id; show(id); };
    const onClick = (e: Event) => {
      const a = (e.target as HTMLElement).closest('[data-a]')?.getAttribute('data-a');
      if (!a) return;
      switch (a) {
        case 'new': this.handlers.onNew(); break;
        case 'continue': this.handlers.onContinue(); break;
        case 'resume': this.handlers.onResume(); break;
        case 'reset': this.handlers.onResetIsland(); break;
        case 'quit': this.handlers.onQuit(); break;
        case 'settings': this.syncSettings(); show('settings'); break;
        case 'controls': show('controls'); break;
        case 'back': show(back); break;
      }
    };
    for (const s of Object.values(this.screens)) s.addEventListener('click', onClick);
    // settings controls
    const q = settings.querySelector('#set-quality')!;
    q.addEventListener('click', (e) => {
      const v = (e.target as HTMLElement).getAttribute('data-q') as Quality | null;
      if (!v) return;
      this.settings.quality = v;
      this.syncSettings();
      this.handlers.onSettings(this.settings);
    });
    const bind = (id: string, key: keyof Settings) => {
      const inp = settings.querySelector('#' + id) as HTMLInputElement;
      inp.addEventListener('input', () => {
        (this.settings as any)[key] = Number(inp.value);
        this.syncSettings();
        this.handlers.onSettings(this.settings);
      });
    };
    bind('set-sens', 'sensitivity');
    bind('set-fov', 'fov');
    bind('set-vol', 'volume');
    bind('set-music', 'music');
    settings.querySelector('#set-invert')!.addEventListener('click', () => {
      this.settings.invertY = !this.settings.invertY;
      this.syncSettings();
      this.handlers.onSettings(this.settings);
    });
  }

  showScreen: (id: string | null) => void = () => {};

  syncSettings(): void {
    const s = this.settings;
    const root = this.screens.settings;
    root.querySelectorAll('#set-quality .seg').forEach((b) => b.classList.toggle('on', b.getAttribute('data-q') === s.quality));
    (root.querySelector('#set-sens') as HTMLInputElement).value = String(s.sensitivity);
    (root.querySelector('#set-fov') as HTMLInputElement).value = String(s.fov);
    (root.querySelector('#fov-val') as HTMLElement).textContent = `${s.fov}°`;
    (root.querySelector('#set-vol') as HTMLInputElement).value = String(s.volume);
    (root.querySelector('#set-music') as HTMLInputElement).value = String(s.music);
    (root.querySelector('#set-invert') as HTMLElement).textContent = s.invertY ? 'On' : 'Off';
    root.querySelector('#set-invert')!.classList.toggle('on', s.invertY);
  }

  setTitleContinue(enabled: boolean, label = 'Continue'): void {
    const b = this.screens.title.querySelector('[data-a="continue"]') as HTMLButtonElement;
    b.disabled = !enabled;
    b.textContent = label;
  }

  setPauseStats(html: string): void {
    (this.screens.pause.querySelector('#pause-stats') as HTMLElement).innerHTML = html;
  }

  showCredits(epilogue: string[], stats: string): void {
    (this.screens.credits.querySelector('#epilogue') as HTMLElement).innerHTML = epilogue.map((l) => `<p>${l}</p>`).join('');
    (this.screens.credits.querySelector('#end-stats') as HTMLElement).innerHTML = stats;
    this.showScreen('credits');
  }
}
