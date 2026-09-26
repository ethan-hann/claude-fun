import { readFileSync } from 'node:fs';
const H = readFileSync(new URL('./helpers.js', import.meta.url), 'utf8');
const s = (name, body, shot = false) => ({ name, shot, code: `(()=>{ ${body} })()` });
export const steps = [
  { name: 'helpers', code: H },
  s('start_landing', `const d=__director; d.newGame(); d.ui.fade(0,0); __game.player.teleport(T.V(0,2.05,-10), 0); T.step(0.5); return T.state();`),
  s('stairs', `return T.walkTo(0, -15.0);`, true),
  s('graft', `T.walkTo(3.4, -14.4, {tol:0.3}); T.lookAt(4.2,1.1,-15.6); T.step(0.2); T.tap('use'); T.step(1.0); return T.state();`, true),
  s('take_bulkhead', `T.walkTo(0, -20.5); T.lookAt(0, 1.6, -24); T.step(0.2); const t=__game.graft.target&&__game.graft.target.id; T.tap('take'); T.step(1.8); const b=T.lat('bulk1'); return {t, level:b.level, off:+b.offset.toFixed(2), s:T.state()};`, true),
  s('through_arch', `return T.walkTo(0, -25.5);`),
  s('give_crate', `const c=T.lat('c_garden').position(); T.lookAt(c.x, c.y, c.z); T.step(0.2); const t=__game.graft.target&&__game.graft.target.id; T.tap('give'); T.step(1.0); const cc=T.lat('c_garden'); return {t, level:cc.level, pos:cc.position().toArray().map(v=>+v.toFixed(2)), s:T.state()};`, true),
  s('push_crate', `const c=T.lat('c_garden').position(); T.walkTo(c.x, c.z+1.2, {tol:0.3}); T.lookAt(c.x,c.y,c.z); T.step(0.1); T.tap('use'); T.step(0.3); T.walkTo(1.0, -28.1, {tol:0.25}); T.lookAt(1.0, 0.4, -29.4); T.step(0.4); T.tap('use'); T.step(1.0); return {c:T.lat('c_garden').position().toArray().map(v=>+v.toFixed(2)), s:T.state()};`, true),
  s('climb_terrace', `const c=T.lat('c_garden').position(); T.walkTo(c.x, c.z+1.3, {tol:0.25}); const a=T.runJump(c.x, c.z, 0.12, 0.45); const b=T.runJump(c.x, c.z-2.5, 0.1, 0.6); return {a,b,s:T.state()};`, true),
  s('take_back', `T.walkTo(1.0, -30.35, {tol:0.2}); const c=T.lat('c_garden').position(); T.lookAt(c.x, c.y+0.3, c.z); T.step(0.2); const t=__game.graft.target&&__game.graft.target.id; T.tap('take'); T.step(1.0); return {t, lvl:T.lat('c_garden').level, s:T.state()};`, true),
  s('heavy_carry', `const c=T.lat('c_heavy').position(); T.walkTo(c.x-0.9, c.z+0.9, {tol:0.3}); T.lookAt(c.x,c.y,c.z); T.step(0.1); T.tap('use'); T.step(0.3); T.walkTo(-1.4, -34.2, {tol:0.3}); T.lookAt(-3.2, 2.3, -35.2); T.step(0.5); T.tap('use'); T.step(1.2); const p=T.ent('plate2'); return {w:p.weight, c:T.lat('c_heavy').position().toArray().map(v=>+v.toFixed(2)), s:T.state()};`, true),
  s('grow_heavy', `const c=T.lat('c_heavy').position(); T.lookAt(c.x,c.y,c.z); T.step(0.2); T.tap('give'); T.step(1.5); const p=T.ent('plate2'), g=T.ent('gate'); T.step(2.5); return {w:p.weight, on:p.active, gate:+g.t.toFixed(2), s:T.state()};`, true),
  s('to_bloom', `const r=T.walkTo(0, -46.5, {max:15}); T.step(2.0); return {r, s:T.state()};`, true),
];
