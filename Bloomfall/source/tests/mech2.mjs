const g = 'window.__game';
const V = `(x,y,z)=>new (window.__game.r.camera.position.constructor)(x,y,z)`;
export const steps = [
  { name: 'setup', code: `(()=>{ const g=${g}; g.simulate(0.3); g.graft.owned=true; g.graft.capacity=3; g.graft.cells=3; return 'ok'; })()` },
  // walk to the medium crate at (4,0.5,6), face it, grab
  { name: 'grab', code: `(()=>{ const g=${g}; const V=${V}; g.player.teleport(V(4,0,8.2), 0); g.player.pitch=-0.45; g.simulate(0.3); const t=g.graft.target&&g.graft.target.id; g.input.press('use'); g.simulate(0.05); g.input.release('use'); g.simulate(0.5); return {target:t, held:g.graft.held&&g.graft.held.id}; })()`, shot: true },
  // turn toward the plate at (-6,0,9) and walk there carrying
  { name: 'carry', code: `(()=>{ const g=${g}; const p=g.player.pos; const dx=-6-p.x, dz=9-p.z; g.player.yaw=Math.atan2(-dx,-dz); g.player.pitch=-0.3; g.input.press('forward'); for(let i=0;i<120;i++){ g.simulate(1/60,false); const q=g.player.pos; if(Math.hypot(q.x+6,q.z-9)<1.9) break;} g.input.release('forward'); g.simulate(0.5); const h=g.graft.held; return {pos:g.player.pos.toArray().map(v=>+v.toFixed(2)), held:h&&h.id, crate:h&&h.position().toArray().map(v=>+v.toFixed(2))}; })()`, shot: true },
  { name: 'drop', code: `(()=>{ const g=${g}; g.input.press('use'); g.simulate(0.05); g.input.release('use'); g.simulate(1.5); const pl=[...g.entities.values()].find(e=>e.id.endsWith('pl1')); const d=[...g.entities.values()].find(e=>e.id.endsWith('d1')); return {plateWeight:pl.weight, on:pl.active, door:+d.t.toFixed(2)}; })()`, shot: true },
  { name: 'door', code: `(()=>{ const g=${g}; g.simulate(2.0); const d=[...g.entities.values()].find(e=>e.id.endsWith('d1')); const V=${V}; g.player.teleport(V(-6,0,5), 1.2); g.player.pitch=0.1; g.simulate(0.2); return {door:+d.t.toFixed(2)}; })()`, shot: true },
  // ride the pillar at (6,0,9)
  { name: 'pillar', code: `(()=>{ const g=${g}; const V=${V}; g.player.teleport(V(6,0.1,9), Math.PI/2); g.player.pitch=-1.2; g.simulate(0.3); const y0=g.player.feet.y; const t=g.graft.target&&g.graft.target.id; g.input.press('give'); g.simulate(0.05); g.input.release('give'); g.simulate(1.5); return {target:t, y0:+y0.toFixed(2), y1:+g.player.feet.y.toFixed(2), cells:g.graft.cells}; })()`, shot: true },
  // stand on small crate and grow it: ride growth
  { name: 'ride', code: `(()=>{ const g=${g}; const V=${V}; const c=[...g.lattices.values()].find(l=>l.id.endsWith('o1')); g.player.teleport(V(-2,0.6,8), 0); g.simulate(0.8); g.player.pitch=-1.45; g.simulate(0.2); const t=g.graft.target&&g.graft.target.id; const y0=g.player.feet.y; g.input.press('give'); g.simulate(0.05); g.input.release('give'); g.simulate(1.2); return {target:t, y0:+y0.toFixed(2), y1:+g.player.feet.y.toFixed(2), orb:c.position().toArray().map(v=>+v.toFixed(2)), size:c.size}; })()`, shot: true },
];
