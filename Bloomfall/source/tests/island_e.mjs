import { readFileSync } from 'node:fs';
const H = readFileSync(new URL('./helpers.js', import.meta.url), 'utf8');
const s = (name, body, shot = false) => ({ name, shot, code: `(()=>{ const O=[-4,21.2,-355.2]; const L=(x,y,z)=>T.V(x+O[0],y+O[1],z+O[2]); const P=()=>{const p=__game.player; return [+(p.pos.x-O[0]).toFixed(2), +(p.feet.y-O[1]).toFixed(2), +(p.pos.z-O[2]).toFixed(2)];}; const LP=(id)=>{const c=T.lat(id).position(); return [+(c.x-O[0]).toFixed(2), +(c.y-O[1]).toFixed(2), +(c.z-O[2]).toFixed(2)];}; const TP=(id)=>{const t=__game.entities.get('e_colonnade.'+id); return {st:t.state, a:+(t.angle*57.3).toFixed(1)};}; ${body} })()` });
const look = (x, y, z) => `{const w=L(${x},${y},${z}); T.lookAt(w.x,w.y,w.z); T.step(0.15);}`;
const tgt = `(__game.graft.target&&__game.graft.target.id)`;
export const steps = [
  { name: 'helpers', code: H },
  s('start', `const d=__director; d.startAt(d.plan.findIndex(p=>p.key==='e_colonnade'), true); d.ui.fade(0,0); T.step(1.0); ${look(0,5,0)} return {p:P()};`, true),
  s('take_c1', `const c=T.lat('c_1').position(); T.walkTo(c.x-0.9, c.z+0.9,{tol:0.3}); T.lookAt(c.x,c.y,c.z); T.step(0.1); const t=${tgt}; T.tap('take'); T.step(0.8); T.tap('use'); T.step(0.4); return {t, s:T.state()};`),
  s('place_c1', `const a=L(0,0,6.3); T.walkTo(a.x,a.z,{tol:0.2}); ${look(0,0.2,4.75)} T.step(0.3); T.tap('use'); T.step(1.0); return {c:LP('c_1'), s:T.state()};`, true),
  s('push_t1', `const c=T.lat('c_1').position(); T.lookAt(c.x,c.y,c.z); T.step(0.1); const t=${tgt}; T.tap('give'); T.step(0.3); const mid=TP('t1'); T.step(3.5); return {t, mid, t1:TP('t1'), c:LP('c_1')};`, true),
  s('onto_column', `const a0=L(1.2,0,4.4); T.walkTo(a0.x,a0.z,{tol:0.25}); const a=L(0,0,4.3); T.walkTo(a.x,a.z,{tol:0.2}); const j=L(0,1,2.6); const r=T.runJump(j.x, j.z, 0.05, 0.45); return {r:P()};`),
  s('cross', `const a=L(0,1,-4.4); const r=T.walkTo(a.x,a.z,{tol:0.25}); const b=L(0,0,-6.4); const r2=T.walkTo(b.x,b.z,{tol:0.3}); return {r, r2, p:P()};`, true),
  s('south_falls', `${look(0,0,8)} T.step(4.5); return {p:P()};`, true),
  s('fountain', `const a=L(-4.0,0,-8.8); T.walkTo(a.x,a.z,{tol:0.3}); const b=L(-4.0,2.4,-13.2); const r=T.walkTo(b.x,b.z,{tol:0.3}); return {r, p:P()};`, true),
  s('take_orb', `const c=T.lat('o_1').position(); T.lookAt(c.x,c.y,c.z); T.step(0.1); const t=${tgt}; T.tap('take'); T.step(0.9); return {t, lvl:T.lat('o_1').level, s:T.state()};`),
  s('roll_orb', `const c=T.lat('o_1').position(); T.walkTo(c.x+0.8, c.z+0.6,{tol:0.3}); T.lookAt(c.x,c.y,c.z); T.step(0.1); T.tap('use'); T.step(0.3); const a=L(-3.1,2.4,-14.0); T.walkTo(a.x,a.z,{tol:0.2}); ${look(-1.2,1.9,-14.0)} T.step(0.4); const held=LP('o_1'); T.tap('use'); T.step(4.0); return {held, o:LP('o_1'), w:T.ent('plate_o')&&[...__game.entities.values()].find(e=>e.id==='e_colonnade.plate_o').weight};`, true),
  s('take_cn_gate', `const a=L(-1.2,0,-21.4); T.walkTo(a.x,a.z,{tol:0.3}); const c=T.lat('c_n').position(); T.lookAt(c.x,c.y,c.z); T.step(0.15); const t=${tgt}; T.tap('take'); T.step(0.9); return {t, lvl:T.lat('c_n').level, s:T.state()};`, true),
  s('to_grate', `const a=L(1.5,0,-19.0); T.walkTo(a.x,a.z,{tol:0.3}); const a2=L(5.4,0,-16.8); T.walkTo(a2.x,a2.z,{tol:0.3}); const b=L(4.9,0,-12.3); const r=T.walkTo(b.x,b.z,{tol:0.3}); return {r, p:P()};`),
  s('grow_orb', `const c=T.lat('o_1').position(); T.lookAt(c.x,c.y,c.z); T.step(0.15); const t=${tgt}; T.tap('give'); T.step(0.9); const c2=T.lat('o_1').position(); T.lookAt(c2.x,c2.y,c2.z); T.step(0.15); T.tap('give'); T.step(2.0); const pl=[...__game.entities.values()].find(e=>e.id==='e_colonnade.plate_o'); const g=[...__game.entities.values()].find(e=>e.id==='e_colonnade.gate'); return {t, lvl:T.lat('o_1').level, w:pl.weight, gate:+g.t.toFixed(2), o:LP('o_1')};`, true),
  s('through_gate', `const a=L(0,0,-22.0); T.walkTo(a.x,a.z,{tol:0.3}); const b=L(0.5,0,-28.0); const r=T.walkTo(b.x,b.z,{tol:0.3}); return {r, p:P()};`, true),
  s('take_boln', `const b=T.lat('bol_n').object.position; T.lookAt(b.x,b.y+0.3,b.z); T.step(0.15); const t=${tgt}; T.tap('take'); T.step(0.8); return {t, s:T.state()};`),
  s('take_cn', `const c=T.lat('c_n').position(); T.walkTo(c.x-0.9, c.z+0.9,{tol:0.3}); T.lookAt(c.x,c.y,c.z); T.step(0.1); T.tap('use'); T.step(0.4); return {s:T.state()};`),
  s('place_cn', `const a=L(0,0,-35.5); T.walkTo(a.x,a.z,{tol:0.2}); ${look(0,0.2,-37.1)} T.step(0.3); T.tap('use'); T.step(1.0); return {c:LP('c_n'), s:T.state()};`, true),
  s('push_t2', `const c=T.lat('c_n').position(); T.lookAt(c.x,c.y,c.z); T.step(0.1); const t=${tgt}; T.tap('give'); T.step(4.0); ${look(0,4,-44)} return {t, t2:TP('t2'), c:LP('c_n')};`, true),
  s('ramp', `const a=L(0.9,0,-36.4); T.walkTo(a.x,a.z,{tol:0.25}); const j=L(0,2,-38.6); const r=T.runJump(j.x,j.z,0.05,0.7); const top=L(0,6,-44.6); const r2=T.walkTo(top.x, top.z, {tol:0.3, max:6}); return {r, r2, p:P()};`, true),
  s('to_bloom', `const b=L(0,4.6,-48.2); const r=T.walkTo(b.x,b.z,{tol:0.4}); T.step(1.5); return {r, p:P()};`, true),
];
