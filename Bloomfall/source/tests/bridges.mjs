import { readFileSync } from 'node:fs';
const H = readFileSync(new URL('./helpers.js', import.meta.url), 'utf8');
const hop = (i) => [
  { name: `bloom_${i}`, shot: true, code: `(()=>{ const d=__director; d.startAt(${i}, false); d.ui.fade(0,0); T.step(0.5);
      const isl=__game.islands[${i}]; const b=isl.bloomPoint; __game.player.teleport(T.V(b.x, b.y+0.1, b.z+0.6), 0); T.step(0.3);
      const nb=__game.islands[${i + 1}].arrivePoint; T.lookAt(nb.x, nb.y+1, nb.z); T.step(3.5);
      return {state:d.bridges[${i}] && d.bridges[${i}].state, len:+d.bridges[${i}].length.toFixed(1)}; })()` },
  { name: `cross_${i}`, shot: true, code: `(()=>{ const d=__director; const nb=__game.islands[${i + 1}].arrivePoint; const b=__game.islands[${i}].bloomPoint;
      const mid=b.clone().lerp(nb, 0.5); const r1=T.walkTo(mid.x, mid.z, {tol:0.5, max:20}); const back=b.clone(); T.lookAt(back.x, back.y, back.z); T.step(0.1);
      return {r1, index:d.index}; })()` },
  { name: `arrive_${i}`, shot: true, code: `(()=>{ const d=__director; const nb=__game.islands[${i + 1}].arrivePoint; const r=T.walkTo(nb.x, nb.z-1.0, {tol:0.5, max:20}); T.step(0.5);
      const f=__game.player.feet; return {r, index:d.index, key:d.island.key, feetY:+(f.y-nb.y).toFixed(2)}; })()` },
];
export const steps = [
  { name: 'helpers', code: H },
  ...[0, 1, 2, 3, 4, 5].flatMap(hop),
];
