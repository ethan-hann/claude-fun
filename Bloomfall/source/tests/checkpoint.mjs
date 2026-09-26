// The Heartbloom: once the player has stood on the calyx wall, a fall puts them back on the wall.
// A reset of the island puts them back on the promenade.
import { readFileSync } from 'node:fs';
const H = readFileSync(new URL('./helpers.js', import.meta.url), 'utf8');
const P = `const O=__game.islands[__director.plan.findIndex(p=>p.key==='g_heart')].origin;
  const me=()=>{ const f=__game.player.feet; return [+(f.x-O.x).toFixed(2), +(f.y-O.y).toFixed(2), +(f.z-O.z).toFixed(2)]; };
  const later=(ms, f)=>new Promise((r)=>setTimeout(()=>r(f()), ms));`;
const st = (name, body) => ({ name, code: `(()=>{ ${P} ${body} })()` });
export const steps = [
  { name: 'helpers', code: H },
  st('start', `const d=__director; d.startAt(d.plan.findIndex(p=>p.key==='g_heart'), true); d.ui.fade(0,0); T.step(1.0); return {me:me()};`),
  // a fall before the wall: back to the promenade
  st('fall_early', `__game.player.teleport(T.V(O.x+12,O.y-40,O.z-20),0); T.step(0.2); return later(900, ()=>{ T.step(0.3); return {me:me()}; });`),
  // stand on the wall, then fall into the well: back on the wall
  st('on_wall', `__game.player.teleport(T.V(O.x+0,O.y+4.35,O.z-12.4),0); T.step(1.0); return {me:me(), grounded:__game.player.grounded};`),
  st('fall_well', `__game.player.teleport(T.V(O.x+0,O.y-40,O.z-20),0); T.step(0.2); return later(900, ()=>{ T.step(0.3); return {me:me()}; });`),
  // a reset puts the player back at the start
  st('reset', `__director.resetIsland(); return later(700, ()=>{ T.step(0.3); return {me:me()}; });`),
];
