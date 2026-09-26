import { readFileSync } from 'node:fs';
const H = readFileSync(new URL('./helpers.js', import.meta.url), 'utf8');
const s = (name, body, shot = false) => ({ name, shot, code: `(()=>{ const O=[6,1.5,-97]; const L=(x,y,z)=>T.V(x+O[0],y+O[1],z+O[2]); ${body} })()` });
export const steps = [
  { name: 'helpers', code: H },
  s('start', `const d=__director; d.startAt(1, true); d.ui.fade(0,0); d.ui.setHudVisible(false); T.step(0.5); return T.state();`),
  s('wall_close', `const p=L(0,0,-10.9); __game.player.teleport(p, 0); T.step(0.3); const w=L(0,2.5,-12); T.lookAt(w.x,w.y,w.z); T.step(0.1); return T.state();`, true),
  s('wall_mid', `const p=L(3,0,-7); __game.player.teleport(p, 0); T.step(0.3); const w=L(0,2.0,-12); T.lookAt(w.x,w.y,w.z); T.step(0.1); return T.state();`, true),
  s('cap', `const p=L(2,4.3,-14.8); __game.player.teleport(p, 0); T.step(0.3); const w=L(2,4.3,-12.4); T.lookAt(w.x,w.y,w.z); T.step(0.1); return T.state();`, true),
];
