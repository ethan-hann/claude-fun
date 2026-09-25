import { readFileSync } from 'node:fs';
const H = readFileSync(new URL('./helpers.js', import.meta.url), 'utf8');
const s = (name, body, shot = false) => ({ name, shot, code: `(()=>{ const O=[6,1.5,-97]; const L=(x,y,z)=>T.V(x+O[0],y+O[1],z+O[2]); ${body} })()` });
export const steps = [
  { name: 'helpers', code: H },
  s('start', `const d=__director; d.startAt(1, true); d.ui.fade(0,0); T.step(1.0); return T.state();`, true),
  s('carry_a', `const a=T.lat('c_a').position(); T.walkTo(a.x, a.z+1.0, {tol:0.3}); T.lookAt(a.x,a.y,a.z); T.step(0.1); T.tap('use'); T.step(0.3); const w=L(0,0,-9.4); T.walkTo(w.x, w.z, {tol:0.25}); T.lookAt(w.x, w.y+0.2, w.z-1.35); T.step(0.4); T.tap('use'); T.step(1.0); return {a:T.lat('c_a').position().toArray().map(v=>+v.toFixed(2)), s:T.state()};`, true),
  s('take_bol1', `const b=T.lat('bol1').object.position; T.lookAt(b.x, b.y+0.3, b.z); T.step(0.2); T.tap('take'); T.step(0.8); return T.state();`),
  s('grab_b', `const c=T.lat('c_b').position(); T.walkTo(c.x+0.9, c.z+0.9, {tol:0.3}); T.lookAt(c.x,c.y,c.z); T.step(0.1); T.tap('use'); T.step(0.4); return T.state();`),
  s('mount_a', `const a=T.lat('c_a').position(); T.walkTo(a.x, a.z+1.2, {tol:0.25}); const r=T.runJump(a.x, a.z, 0.1, 0.4); T.step(0.3); return {r, s:T.state()};`, true),
  s('give_a1', `const a=T.lat('c_a').position(); T.lookAt(a.x, a.y, a.z); T.step(0.1); const t=__game.graft.target&&__game.graft.target.id; T.tap('give'); T.step(1.0); return {t, lvl:T.lat('c_a').level, s:T.state()};`, true),
  s('take_bol2', `const b=T.lat('bol2').object.position; T.lookAt(b.x, b.y+0.3, b.z); T.step(0.2); const t=__game.graft.target&&__game.graft.target.id; T.tap('take'); T.step(0.8); return {t, s:T.state()};`),
  s('give_a2', `const a=T.lat('c_a').position(); T.lookAt(a.x, a.y, a.z); T.step(0.1); const t=__game.graft.target&&__game.graft.target.id; T.tap('give'); T.step(1.2); return {t, lvl:T.lat('c_a').level, a:T.lat('c_a').position().toArray().map(v=>+v.toFixed(2)), s:T.state()};`, true),
  s('drop_b', `const a=T.lat('c_a').position(); T.lookAt(a.x, a.y+1.0, a.z-0.6); T.step(0.4); T.tap('use'); T.step(1.2); return {b:T.lat('c_b').position().toArray().map(v=>+v.toFixed(2)), s:T.state()};`, true),
  s('mount_b', `const b=T.lat('c_b').position(); const p=__game.player.pos; const r=T.runJump(b.x, b.z, 0.05, 0.5); return {r, b:T.lat('c_b').position().toArray().map(v=>+v.toFixed(2)), s:T.state()};`),
  s('take_bol3', `const b=T.lat('bol3').object.position; T.lookAt(b.x, b.y+0.3, b.z); T.step(0.2); const t=__game.graft.target&&__game.graft.target.id; T.tap('take'); T.step(0.8); return {t, s:T.state()};`),
  s('give_b', `const b=T.lat('c_b').position(); T.lookAt(b.x, b.y, b.z); T.step(0.1); const t=__game.graft.target&&__game.graft.target.id; T.tap('give'); T.step(1.2); return {t, lvl:T.lat('c_b').level, s:T.state()};`, true),
  s('jump_terrace', `const w=L(0,4.3,-14.5); const r=T.runJump(w.x, w.z, 0.15, 0.9); T.step(3.5); return {r, s:T.state()};`, true),
];
