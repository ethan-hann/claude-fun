import './style.css';
import { runViewer } from './viewer';
import { Game } from './game/game';
import { Director, IslandPlan } from './game/director';

// The world: islands in order, their positions, and the Graft's capacity on each.
export const PLAN: IslandPlan[] = [
  { key: 'a_vault', origin: [0, 0, 0], capacity: 1 },
  { key: 'b_terraces', origin: [6, 1.5, -97], capacity: 1 },
];

const params = new URLSearchParams(location.search);

function loading(): { set(p: number, s: string): void; done(): void } {
  const el = document.createElement('div');
  el.id = 'loading';
  el.innerHTML = '<div class="t">BLOOMFALL</div><div class="bar"><i></i></div><div class="s">Loading</div>';
  document.body.appendChild(el);
  return {
    set(p, s) { (el.querySelector('.bar i') as HTMLElement).style.width = `${Math.round(p * 100)}%`; (el.querySelector('.s') as HTMLElement).textContent = s; },
    done() { el.classList.add('gone'); setTimeout(() => el.remove(), 1400); },
  };
}

async function boot(): Promise<void> {
  if (params.has('view')) return runViewer(params);
  if (params.has('lmdebug')) (window as any).__lmDebug = +params.get('lmdebug')!;
  const load = loading();
  load.set(0.1, 'Waking the city');
  const game = new Game();
  (window as any).__game = game;
  const only = params.get('islands');
  const plan = only ? PLAN.filter((p) => only.split(',').includes(p.key)) : PLAN;
  await game.init(plan.map((p) => ({ key: p.key, origin: p.origin })), (params.get('q') as any) || 'high');
  load.set(0.8, 'Lighting the sky');
  const director = new Director(game, plan.map((p) => ({ ...p })));
  (window as any).__director = director;
  await director.init();
  game.frameHook = (dt, lx, ly) => { director.update(dt); director.frameViewModel(dt, lx, ly); };
  // compile shaders before the first frame is shown
  game.r.renderer.compile(game.r.scene, game.r.camera);
  load.set(1, 'Ready');
  load.done();
  (window as any).__ready = true;
  if (params.has('manual')) return;
  director.showTitle();
  game.start();
}
boot().catch((e) => { console.error(e); document.body.textContent = String(e?.stack || e); });
