// Cross from Island I to II, wait for Island I to drift off, and look back: its doors, plates and
// crates must go with it.
import { readFileSync } from 'node:fs';
const H = readFileSync(new URL('./helpers.js', import.meta.url), 'utf8');
export const steps = [
  { name: 'helpers', code: H },
  { name: 'bloom', code: `(()=>{ const d=__director; d.startAt(0, false); d.ui.fade(0,0); T.step(0.5);
      const b=__game.islands[0].bloomPoint; __game.player.teleport(T.V(b.x, b.y+0.1, b.z+0.6), 0); T.step(0.3);
      const nb=__game.islands[1].arrivePoint; T.lookAt(nb.x, nb.y+1, nb.z); T.step(3.5); return d.bridges[0].state; })()` },
  { name: 'arrive', code: `(()=>{ const d=__director; const nb=__game.islands[1].arrivePoint; const b=__game.islands[0].bloomPoint;
      const mid=b.clone().lerp(nb, 0.5); T.walkTo(mid.x, mid.z, {tol:0.5, max:20}); const r=T.walkTo(nb.x, nb.z-1.0, {tol:0.5, max:20}); T.step(0.5);
      return {r, index:d.index}; })()` },
  { name: 'wait', code: `new Promise((res)=>setTimeout(()=>res('waited'), 5500))` },
  { name: 'drift_3s', shot: true, code: `(()=>{ T.step(3.0); const g=__game.islands[0].group; T.lookAt(g.position.x, g.position.y+2, g.position.z); T.step(0.05);
      const gate=__game.entities.get('a_vault.gate'); const w=T.V(0,0,0); let dp=null; if (gate) { const o=(gate.mesh||gate.group||gate.object); if (o) { o.getWorldPosition(w); dp=w.toArray().map(v=>+v.toFixed(1)); } }
      return {group:g.position.toArray().map(v=>+v.toFixed(1)), frozen:__game.islands[0].frozen, gate:dp}; })()` },
  { name: 'drift_9s', shot: true, code: `(()=>{ T.step(6.0); const g=__game.islands[0].group; T.lookAt(g.position.x, g.position.y+2, g.position.z); T.step(0.05);
      return {group:g.position.toArray().map(v=>+v.toFixed(1))}; })()` },
  { name: 'back_to_I', shot: true, code: `(()=>{ const d=__director; d.startAt(0, false); d.ui.fade(0,0); T.step(1.0);
      const e=__game.entities.get('a_vault.door1'); return {attached:__game.islands[0].attached, frozen:__game.islands[0].frozen, group:__game.islands[0].group.position.toArray().map(v=>+v.toFixed(1))}; })()` },
];
