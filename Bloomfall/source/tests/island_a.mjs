import { readFileSync } from 'node:fs';
const H = readFileSync(new URL('./helpers.js', import.meta.url), 'utf8');
const s = (name, body, shot = false) => ({ name, shot, code: `(()=>{ ${body} })()` });
export const steps = [
  { name: 'helpers', code: H },
  s('start', `const d=__director; d.newGame(); d.ui.fade(0,0); T.step(1.0); return T.state();`, true),
  s('to_corridor', `return T.walkTo(0, 18.6);`),
  s('jump_trench', `T.walkTo(0, 17.2, {tol:0.3}); const r=T.runJump(0, 10, 0.3, 0.75); return {after:r, s:T.state()};`),
  s('to_crate', `T.walkTo(1.9, 6.9, {tol:0.35}); T.lookAt(2.9,0.5,6.9); T.step(0.1); T.tap('use'); T.step(0.3); return T.state();`, true),
  s('carry_to_plate', `T.walkTo(-1.8, 7.8, {tol:0.35}); T.lookAt(-3,0.2,7.8); T.step(0.4); T.tap('use'); T.step(1.5); const pl=T.ent('plate1'), dr=T.ent('door1'); return {w:pl.weight, on:pl.active, door:+dr.t.toFixed(2), s:T.state()};`, true),
  s('through_door', `T.step(1.0); const r=T.walkTo(0, -0.5); return {r, door:+T.ent('door1').t.toFixed(2)};`),
  s('grab_step', `T.walkTo(-1.0, -0.3, {tol:0.3}); T.lookAt(-2,0.5,-1.2); T.step(0.1); T.tap('use'); T.step(0.3); return T.state();`),
  s('place_step', `T.walkTo(0, -2.2, {tol:0.25}); T.lookAt(0,0.3,-3.4); T.step(0.5); T.tap('use'); T.step(1.2); const c=T.lat('c_step'); return {crate:c.position().toArray().map(v=>+v.toFixed(2)), s:T.state()};`, true),
  s('climb', `const c=T.lat('c_step').position(); T.walkTo(c.x, c.z+1.3, {tol:0.25}); const a=T.runJump(c.x, c.z, 0.12, 0.45); const b=T.runJump(c.x, c.z-2.5, 0.1, 0.6); return {a,b,s:T.state()};`, true),
  s('landing', `const r=T.walkTo(0, -10.0); return {r, s:T.state()};`, true),
];
