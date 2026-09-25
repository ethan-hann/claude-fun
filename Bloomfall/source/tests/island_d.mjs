import { readFileSync } from 'node:fs';
const H = readFileSync(new URL('./helpers.js', import.meta.url), 'utf8');
const s = (name, body, shot = false) => ({ name, shot, code: `(()=>{ const O=[8,15.0,-271.2]; const L=(x,y,z)=>T.V(x+O[0],y+O[1],z+O[2]); const P=()=>{const p=__game.player; return [+(p.pos.x-O[0]).toFixed(2), +(p.feet.y-O[1]).toFixed(2), +(p.pos.z-O[2]).toFixed(2)];}; const LP=(id)=>{const c=T.lat(id).position(); return [+(c.x-O[0]).toFixed(2), +(c.y-O[1]).toFixed(2), +(c.z-O[2]).toFixed(2)];}; ${body} })()` });
const look = (x, y, z) => `{const w=L(${x},${y},${z}); T.lookAt(w.x,w.y,w.z); T.step(0.15);}`;
const tgt = `(__game.graft.target&&__game.graft.target.id)`;
const bal = (id) => `(()=>{const b=__game.entities.get('d_weighhouse.${id}'); return {off:+b.offset.toFixed(2), wa:b.pans[0].weight, wb:b.pans[1].weight};})()`;
export const steps = [
  { name: 'helpers', code: H },
  s('start', `const d=__director; d.startAt(d.plan.findIndex(p=>p.key==='d_weighhouse'), true); d.ui.fade(0,0); T.step(1.0); ${look(0,5,-7)} return {p:P(), lift:${bal('lift')}, scale:${bal('scale')}};`, true),
  s('take_f', `const c=T.lat('c_f').position(); T.walkTo(c.x-1.0, c.z+0.8,{tol:0.3}); T.lookAt(c.x,c.y,c.z); T.step(0.1); const t=${tgt}; T.tap('take'); T.step(0.8); return {t, s:T.state()};`),
  s('onto_lift', `const a=L(-2.2,0,-1.8); T.walkTo(a.x,a.z,{tol:0.3}); const b=L(-5.2,0,-5.4); const r=T.walkTo(b.x,b.z,{tol:0.3}); T.step(0.5); return {r, p:P(), lift:${bal('lift')}};`, true),
  s('take_lift_crate', `const c=T.lat('c_lift').position(); T.lookAt(c.x,c.y,c.z); T.step(0.1); const t=${tgt}; T.tap('take'); T.step(0.8); return {t, s:T.state(), lift:${bal('lift')}};`),
  s('give_cw', `const c=T.lat('c_cw').position(); T.lookAt(c.x,c.y-0.1,c.z); T.step(0.15); const t=${tgt}; T.tap('give'); T.step(0.8); const c2=T.lat('c_cw').position(); T.lookAt(c2.x,c2.y-0.2,c2.z); T.step(0.15); T.tap('give'); T.step(0.6); return {t, lvl:T.lat('c_cw').level, lift:${bal('lift')}};`, true),
  s('ride', `T.step(5.0); return {p:P(), lift:${bal('lift')}};`, true),
  s('grab_lift_crate', `const c=T.lat('c_lift').position(); T.lookAt(c.x,c.y,c.z); T.step(0.15); const t=${tgt}; T.tap('use'); T.step(0.4); return {t, s:T.state()};`),
  s('balcony', `const a=L(-1.0,6,-5.4); const r=T.walkTo(a.x,a.z,{tol:0.3}); return {r, p:P(), held:__game.graft.held&&__game.graft.held.id};`),
  s('enter', `const a=L(0.5,6,-8.7); const r=T.walkTo(a.x,a.z,{tol:0.3}); T.step(0.5); ${look(0,4,6)} T.step(3.0); return {r, p:P(), held:__game.graft.held&&__game.graft.held.id};`, true),
  s('hall_view', `${look(0,3,-24)} T.step(0.2); return {p:P()};`, true),
  s('catwalk', `const a=L(5.0,6,-9.0); T.walkTo(a.x,a.z,{tol:0.3}); const b=L(5.0,6,-21.2); const r=T.walkTo(b.x,b.z,{tol:0.3}); ${look(5.0,5.2,-23.4)} T.step(0.4); T.tap('use'); T.step(1.5); return {r, p:P(), crate:LP('c_lift'), scale:${bal('scale')}};`, true),
  s('stairs', `const a0=L(5.0,6,-10.4); T.walkTo(a0.x,a0.z,{tol:0.3}); const a=L(9.9,6,-9.4); T.walkTo(a.x,a.z,{tol:0.3}); const b=L(9.9,0,-28.4); const r=T.walkTo(b.x,b.z,{tol:0.4}); return {r, p:P()};`, true),
  s('onto_a', `const a0=L(7.0,0,-30.0); T.walkTo(a0.x,a0.z,{tol:0.4}); const a=L(-1.5,0,-24.0); T.walkTo(a.x,a.z,{tol:0.3}); const b=L(-3.75,0,-22.75); const r=T.walkTo(b.x,b.z,{tol:0.2}); T.step(0.5); return {r, p:P(), scale:${bal('scale')}};`, true),
  s('take_a', `const c=T.lat('c_a').position(); T.lookAt(c.x,c.y,c.z); T.step(0.1); const t=${tgt}; T.tap('take'); T.step(0.9); const c2=T.lat('c_a').position(); T.lookAt(c2.x,c2.y,c2.z); T.step(0.1); T.tap('take'); T.step(0.9); return {t, lvl:T.lat('c_a').level, s:T.state(), scale:${bal('scale')}};`),
  s('give_b', `const c=T.lat('c_lift').position(); T.lookAt(c.x,c.y-0.1,c.z); T.step(0.15); const t=${tgt}; T.tap('give'); T.step(0.9); const c2=T.lat('c_lift').position(); T.lookAt(c2.x,c2.y-0.3,c2.z); T.step(0.15); T.tap('give'); T.step(0.5); return {t, lvl:T.lat('c_lift').level, scale:${bal('scale')}};`, true),
  s('rise', `T.step(6.0); return {p:P(), scale:${bal('scale')}};`, true),
  s('jump_gallery', `const a=L(-6.3,5,-24.0); T.walkTo(a.x,a.z,{tol:0.25}); const w=L(-9.0,6.35,-24.0); const r=T.runJump(w.x,w.z,0.05,0.9); return {r:P()};`, true),
  s('exit', `const a=L(-9.5,6.35,-33.6); T.walkTo(a.x,a.z,{tol:0.3}); const b=L(-9.5,6.35,-37.0); const r=T.walkTo(b.x,b.z,{tol:0.3}); return {r, p:P()};`, true),
  s('to_bloom', `const b=L(-8.0,6.65,-40.6); const r=T.walkTo(b.x,b.z,{tol:0.4}); T.step(1.5); return {r, p:P()};`, true),
];
