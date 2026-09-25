// Mechanics smoke test on the test island.
const g = 'window.__game';
export const steps = [
  { name: 'spawn', code: `(()=>{ const g=${g}; g.simulate(0.5); return {pos:g.player.pos.toArray().map(v=>+v.toFixed(2)), grounded:g.player.grounded}; })()`, shot: true },
  { name: 'walk', code: `(()=>{ const g=${g}; g.input.press('forward'); g.simulate(1.0); g.input.release('forward'); g.simulate(0.3); return {pos:g.player.pos.toArray().map(v=>+v.toFixed(2))}; })()`, shot: false },
  { name: 'jump', code: `(()=>{ const g=${g}; const y0=g.player.pos.y; let maxY=y0; g.input.press('jump'); for(let i=0;i<60;i++){ g.simulate(1/60,false); if(i==1) g.input.release('jump'); maxY=Math.max(maxY,g.player.pos.y);} return {apex:+(maxY-y0).toFixed(2)}; })()`, shot: false },
  { name: 'look_crates', code: `(()=>{ const g=${g}; g.player.teleport(new g.r.camera.position.constructor(3,0,9), 0); g.player.pitch=-0.35; g.graft.owned=true; g.graft.cells=1; g.simulate(0.3); return {target: g.graft.target && g.graft.target.id}; })()`, shot: true },
  { name: 'give_small', code: `(()=>{ const g=${g}; g.player.yaw=0.35; g.simulate(0.1); const t=g.graft.target&&g.graft.target.id; g.input.press('give'); g.simulate(0.05); g.input.release('give'); g.simulate(1.0); return {target:t, cells:g.graft.cells, events:g.graft.events.map(e=>e.type+(e.reason?':'+e.reason:'')).slice(-3)}; })()`, shot: true },
];
