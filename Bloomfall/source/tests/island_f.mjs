// Island VI, the Observatory: the three stages in the order west, east, north, then the bloom.
import { readFileSync } from 'node:fs';
const H = readFileSync(new URL('./helpers.js', import.meta.url), 'utf8');
const s = (name, body, shot = false) => ({ name, shot, code: `(()=>{ ${body} })()` });
// local island coordinates
const P = `const O=__game.islands[__director.plan.findIndex(p=>p.key==='f_observatory')].origin; const L=(x,y,z)=>T.V(O.x+x,O.y+y,O.z+z);
  const W=(x,z,o)=>T.walkTo(O.x+x,O.z+z,o); const look=(x,y,z)=>{ T.lookAt(O.x+x,O.y+y,O.z+z); T.step(0.15); };
  const tapN=(a,n)=>{ for(let i=0;i<n;i++){ T.tap(a); T.step(0.25);} };
  const loc=(v)=>[+(v.x-O.x).toFixed(2), +(v.y-O.y).toFixed(2), +(v.z-O.z).toFixed(2)];
  const me=()=>loc(__game.player.feet);
  const lvl=(id)=>T.lat(id).level; const cr=(id)=>T.ent(id).active;
  const PIL={p1:0,p2:2,p3:4}; const HTS=[0,2,4];
  const aimP=(id)=>{ const l=T.lat(id); const p=l.body.translation(); T.lookAt(p.x, O.y+PIL[id]+HTS[l.level]-0.3, p.z); T.step(0.1); };
  const takeP=(id,n)=>{ for(let i=0;i<n;i++){ aimP(id); T.tap('take'); T.step(0.8);} };
  const at=(id)=>{ const p=T.lat(id).position(); T.lookAt(p.x,p.y,p.z); T.step(0.1); };
  const takeAt=(id,n)=>{ for(let i=0;i<n;i++){ at(id); T.tap('take'); T.step(0.8);} };
  const giveAt=(id,n)=>{ for(let i=0;i<n;i++){ at(id); T.tap('give'); T.step(0.8);} };
  const giveDown=(n)=>{ for(let i=0;i<n;i++){ __game.player.pitch=-1.45; T.step(0.1); T.tap('give'); T.step(1.2);} };`;
const st = (name, body, shot = false) => s(name, `${P} ${body}`, shot);
export const steps = [
  { name: 'helpers', code: H },
  st('start', `const d=__director; d.startAt(d.plan.findIndex(p=>p.key==='f_observatory'), true); d.ui.fade(0,0); T.step(1.0); return {me:me(), s:T.state()};`, true),
  // ---- west
  st('take_b1', `W(-3.6,-7.6,{tol:0.3}); look(-4.8,0.5,-6.2); tapN('take',1); return {cells:__game.graft.cells};`),
  st('span_w', `W(-9.4,-14,{tol:0.3}); look(-11.3,0,-14); tapN('give',1); T.step(1.5); return {lvl:lvl('s_w'), cells:__game.graft.cells};`, true),
  st('cross_w', `const r=W(-19.8,-14,{tol:0.3}); return {r, me:me()};`),
  st('borrow', `look(-20.6,0.5,-9.4); tapN('take',1); look(-15,0,-14); tapN('take',1); T.step(1.0); return {cells:__game.graft.cells, span:lvl('s_w'), bol:lvl('b_w')};`),
  st('p1_up', `W(-22.4,-14,{tol:0.2}); T.step(0.3); giveDown(2); T.step(1.0); return {p1:lvl('p1'), me:me(), cells:__game.graft.cells};`, true),
  st('to_p2', `W(-25.4,-14,{tol:0.3}); T.step(0.5); return {me:me()};`),
  st('p2_up', `takeP('p1',2); T.step(1.0); giveDown(2); T.step(1.0); return {p1:lvl('p1'), p2:lvl('p2'), me:me()};`),
  st('to_p3', `W(-28.4,-14,{tol:0.3}); T.step(0.5); return {me:me()};`),
  st('p3_up', `takeP('p2',2); T.step(1.0); giveDown(2); T.step(1.0); return {p2:lvl('p2'), p3:lvl('p3'), me:me()};`, true),
  st('to_tower', `const r=T.runJump(O.x-31.3, O.z-14, 0.15, 0.35); T.step(0.4); return {r:loc(T.V(r[0],r[1],r[2])), me:me()};`),
  st('grab_w', `look(-31.5,${8.0 + 0.4},-14); T.tap('use'); T.step(0.4); return T.state();`, true),
  st('down_w', `W(-31.4,-17.5,{tol:0.4, max:4}); T.step(1.5); return {me:me(), held:__game.graft.held&&__game.graft.held.id};`),
  st('back_w', `takeP('p3',2); W(-19.6,-14,{tol:0.3}); look(-11.3,0,-14); tapN('give',1); T.step(1.5); const r=W(-9.0,-14,{tol:0.4}); return {r, span:lvl('s_w'), cells:__game.graft.cells, held:__game.graft.held&&__game.graft.held.id};`, true),
  st('place_w', `W(-3.7,-14,{tol:0.25}); look(-2.3,0.52,-14); T.tap('use'); T.step(1.5); return {cr_w:cr('cr_w'), lens:loc(T.lat('lens_w').position())};`, true),
  // ---- east
  st('span_e', `W(-4.5,-8.6,{tol:0.4}); W(4.5,-8.6,{tol:0.4}); W(9.4,-14,{tol:0.3}); look(11.3,0,-14); tapN('give',1); T.step(1.5); const r=W(20.0,-14,{tol:0.3}); return {lvl:lvl('s_e'), r, cells:__game.graft.cells};`),
  st('crate_cell', `look(21.6,0.5,-10.6); tapN('take',1); look(26.3,0,-14); tapN('give',1); T.step(1.5); return {crate:lvl('c_e'), s_e2:lvl('s_e2'), cells:__game.graft.cells};`, true),
  st('carry_crate', `const c=T.lat('c_e').position(); W(c.x-O.x-0.9, c.z-O.z+0.2,{tol:0.25}); T.lookAt(c.x,c.y,c.z); T.step(0.1); T.tap('use'); T.step(0.3); const r1=W(24.5,-14,{tol:0.3}); const r2=W(33.0,-14,{tol:0.3}); const r3=W(33.6,-12.3,{tol:0.25}); return {held:__game.graft.held&&__game.graft.held.id, r1, r2, r3, door:+T.ent('door_e').t.toFixed(2)};`, true),
  st('set_crate', `look(35.0,0.3,-12.3); T.tap('use'); T.step(1.2); const r=W(32.9,-14.2,{tol:0.25}); return {r, w:T.ent('plate_e').weight, crate:loc(T.lat('c_e').position())};`),
  st('swap', `takeAt('lens_e',2); T.step(1.5); const shut=+T.ent('door_e').t.toFixed(2); giveAt('c_e',2); T.step(3.0); return {shut, lens:lvl('lens_e'), crate:lvl('c_e'), cpos:loc(T.lat('c_e').position()), w:T.ent('plate_e').weight, door:+T.ent('door_e').t.toFixed(2)};`, true),
  st('grab_e', `const l=T.lat('lens_e').position(); W(l.x-O.x-1.0, l.z-O.z,{tol:0.25}); T.lookAt(l.x,l.y,l.z); T.step(0.1); T.tap('use'); T.step(0.3); const r1=W(33.0,-14,{tol:0.3}); const r=W(24.0,-14,{tol:0.4}); const r2=W(9.0,-14,{tol:0.4}); return {held:__game.graft.held&&__game.graft.held.id, r1, r, r2};`),
  st('place_e', `W(3.7,-14,{tol:0.25}); look(2.3,0.52,-14); T.tap('use'); T.step(1.5); return {cr_e:cr('cr_e'), lens:loc(T.lat('lens_e').position())};`, true),
  // ---- north
  st('cells_n', `const r1=W(3.6,-7.6,{tol:0.3}); look(4.8,0.5,-6.2); tapN('take',1); const c1=__game.graft.cells; const r2=W(-4.0,-8.4,{tol:0.4}); const r3=W(-8.6,-14,{tol:0.3}); look(-15,0,-14); tapN('take',1); T.step(1.0); return {r1, c1, r2, r3, cells:__game.graft.cells, s_w:lvl('s_w'), b2:lvl('b2')};`),
  st('span_n', `W(-5.5,-8.6,{tol:0.4}); W(5.0,-8.6,{tol:0.4}); W(7.6,-18.5,{tol:0.4}); W(8.5,-26.2,{tol:0.3}); look(8.5,0,-27.3); tapN('give',1); T.step(1.5); return {lvl:lvl('s_n'), cells:__game.graft.cells};`, true),
  st('topple', `W(8.5,-31.0,{tol:0.25}); look(9.85,0.3,-43.4); const t=__game.graft.target&&__game.graft.target.id; tapN('give',1); T.step(4.0); return {t, crate:lvl('c_n'), col:T.ent('col').state, me:me()};`, true),
  st('cross_col', `W(8.5,-30.9,{tol:0.2}); T.runJump(O.x+8.5, O.z-36.0, 0.25, 0.55); const on=me(); const r1=W(8.5,-42.0,{tol:0.3}); const r=W(8.5,-44.6,{tol:0.4}); return {on, r1, r, me:me()};`, true),
  st('crate_plate', `const c=T.lat('c_n').position(); W(c.x-O.x-1.2, c.z-O.z-0.6,{tol:0.3}); T.lookAt(c.x,c.y,c.z); T.step(0.1); T.tap('use'); T.step(0.3); W(11.5,-47.9,{tol:0.3}); look(11.5,0.2,-50.2); T.tap('use'); T.step(2.5); return {w:T.ent('plate_n').weight, cage:+T.ent('cage').t.toFixed(2)};`, true),
  st('grab_n', `W(6.3,-48.6,{tol:0.3}); const l=T.lat('lens_n').position(); T.lookAt(l.x,l.y,l.z); T.step(0.1); T.tap('use'); T.step(0.3); return {held:__game.graft.held&&__game.graft.held.id};`),
  st('seed', `W(12.6,-51.4,{tol:0.4}); T.tap('use'); T.step(0.5); return {seeds:__director.save.seeds.slice()};`),
  st('back_n', `W(8.5,-45.2,{tol:0.3}); T.runJump(O.x+8.5, O.z-40.0, 0.25, 0.55); const on=me(); const r=W(8.5,-33.8,{tol:0.4}); const r2=W(8.5,-22,{tol:0.4}); W(7.0,-17.5,{tol:0.4}); W(4.5,-8.6,{tol:0.4}); return {on, r, r2, held:__game.graft.held&&__game.graft.held.id};`),
  st('place_n', `W(0,-9.95,{tol:0.25}); look(0,0.52,-11.7); T.tap('use'); T.step(2.0); return {cr_s:cr('cr_s'), all:['cr_w','cr_e','cr_s'].map(cr), gate:+T.ent('gate').t.toFixed(2)};`, true),
  st('beam_view', `T.step(3.0); W(2.5,-6.5,{tol:0.4}); look(-8,6,-50); T.step(0.5); return {beam:T.ent('beam').active};`, true),
  st('to_bloom', `T.step(2.0); W(-4.6,-10.4,{tol:0.4}); W(-4.6,-19.0,{tol:0.4}); W(0,-23.6,{tol:0.4}); const r=W(0,-29.2,{tol:0.5}); T.step(1.0); return {r, gate:+T.ent('gate').t.toFixed(2), state:__director.state, arrived:[...__director.arrived]};`, true),
];
