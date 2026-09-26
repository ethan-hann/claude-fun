import { readFileSync } from 'node:fs';
const H = readFileSync(new URL('./helpers.js', import.meta.url), 'utf8');
const s = (name, body, shot = false) => ({ name, shot, code: `(()=>{ const I=__game.islands[__director.plan.findIndex(p=>p.key==='g_heart')].origin; const O=[I.x,I.y,I.z]; const L=(x,y,z)=>T.V(x+O[0],y+O[1],z+O[2]); const P=()=>{const p=__game.player; return [+(p.pos.x-O[0]).toFixed(2), +(p.feet.y-O[1]).toFixed(2), +(p.pos.z-O[2]).toFixed(2)];}; const LP=(id)=>{const c=T.lat(id).position(); return [+(c.x-O[0]).toFixed(2), +(c.y-O[1]).toFixed(2), +(c.z-O[2]).toFixed(2)];}; ${body} })()` });
const look = (x, y, z) => `{const w=L(${x},${y},${z}); T.lookAt(w.x,w.y,w.z); T.step(0.15);}`;
const tgt = `(__game.graft.target&&__game.graft.target.id)`;
const wait = (name, ms, shot = true) => ({ name, shot, code: `new Promise((r) => setTimeout(() => r('${name}'), ${ms}))` });
export const steps = [
  { name: 'helpers', code: H },
  s('start', `const d=__director; d.startAt(d.plan.findIndex(p=>p.key==='g_heart'), true); d.ui.fade(0,0); T.step(1.0); ${look(0,12,-20)} return {p:P(), inf:__game.graft.infinite};`, true),
  s('approach', `const a=L(0,0,-4.0); T.walkTo(a.x,a.z,{tol:0.3}); ${look(0,10,-20)} return {p:P()};`, true),
  s('grab_b', `const c=T.lat('c_b').position(); T.walkTo(c.x+0.8, c.z+0.8,{tol:0.3}); T.lookAt(c.x,c.y,c.z); T.step(0.1); T.tap('use'); T.step(0.4); return {s:T.state()};`),
  s('grow_a1', `const a=T.lat('c_a').position(); T.walkTo(a.x, a.z+1.5,{tol:0.25}); T.lookAt(a.x,a.y,a.z); T.step(0.1); T.tap('give'); T.step(1.0); return {lvl:T.lat('c_a').level};`),
  s('mount_a', `const a=T.lat('c_a').position(); const r=T.runJump(a.x, a.z, 0.1, 0.45); T.step(0.3); return {r, s:T.state()};`),
  s('grow_a', `const a=T.lat('c_a').position(); T.lookAt(a.x,a.y-0.3,a.z); T.step(0.1); T.tap('give'); T.step(1.4); return {lvl:T.lat('c_a').level, s:T.state()};`, true),
  s('drop_b', `const a=T.lat('c_a').position(); T.lookAt(a.x, a.y+1.0, a.z-0.6); T.step(0.4); T.tap('use'); T.step(1.2); return {b:LP('c_b'), s:T.state()};`),
  s('grow_b', `const b=T.lat('c_b').position(); T.lookAt(b.x,b.y,b.z); T.step(0.1); T.tap('give'); T.step(1.2); return {lvl:T.lat('c_b').level, b:LP('c_b'), s:T.state()};`),
  s('mount_b', `const cb=T.lat('c_b'), b=cb.position(); const r=T.hopTo(b.x, b.z, b.y+cb.size/2); return {r, s:T.state()};`),
  s('onto_wall', `const w=L(0,4.3,-11.9); const r=T.runJump(w.x, w.z, 0.1, 0.6); return {r:P()};`, true),
  s('fetch_b', `const b=LP('c_b'); const a=L(b[0],4.3,-11.35); T.walkTo(a.x,a.z,{tol:0.2}); const c=T.lat('c_b').position(); T.lookAt(c.x,c.y+0.45,c.z); T.step(0.15); const d=+__game.graft.targetDist.toFixed(2); T.tap('use'); T.step(0.4); return {b, d, held:__game.graft.held&&__game.graft.held.id, lvl:T.lat('c_b').level};`, true),
  s('walk_wall', `for (const [x,z] of [[3.11,-12.5],[7.5,-16.89],[7.5,-23.11],[3.4,-26.9],[2.9,-26.6]]) { const a=L(x,4.3,z); T.walkTo(a.x,a.z,{tol:0.3}); } return {p:P(), held:__game.graft.held&&__game.graft.held.id};`, true),
  s('set_b', `${look(1.5,4.3,-26.6)} T.tap('use'); T.step(1.2); return {b:LP('c_b'), p:P()};`),
  s('topple', `const c=T.lat('c_b').position(); T.lookAt(c.x,c.y,c.z); T.step(0.1); T.tap('give'); T.step(4.0); const sp=__game.entities.get('g_heart.spire'); return {lvl:T.lat('c_b').level, spire:sp.state, ang:+(sp.angle*180/Math.PI).toFixed(1), b:LP('c_b')};`, true),
  s('onto_spire', `for (const [x,z] of [[2.6,-29.6],[0,-29.4]]) { const a=L(x,4.3,z); T.walkTo(a.x,a.z,{tol:0.2}); } const w=L(0,5.4,-26.6); T.runJump(w.x, w.z, 0.15, 0.45); T.step(0.3); return {r:P()};`, true),
  s('climb', `const a=L(0,8,-22.6); const r1=T.walkTo(a.x,a.z,{tol:0.3, max:8}); const b=L(0,7.8,-20.6); const r2=T.walkTo(b.x,b.z,{tol:0.4, max:4}); T.step(0.8); return {r1:P(), r2, p:P()};`, true),
  s('look_heart', `${look(0,14.3,-20)} T.step(0.3); return {core:!!__game.graft.coreTarget};`, true),
  s('hold', `__game.input.press('take'); T.step(1.6); const mid=__director.island.entities.find(e=>e.progress!==undefined&&e.collapse!==undefined).progress; T.step(1.9); __game.input.release('take'); T.step(0.1); return {mid, state:__director.state};`, true),
  s('end_2', `T.step(1.8); return {state:__director.state};`, true),
  s('end_5', `T.step(3.0); return {state:__director.state};`, true),
  s('end_8', `T.step(3.0); return {state:__director.state};`, true),
  s('end_white', `T.step(1.8); return {state:__director.state};`, true),
  s('end_black', `T.step(2.5); return {state:__director.state};`, true),
  s('credits', `T.step(1.0); return {state:__director.state};`, true),
  wait('epilogue_8s', 8000),
  wait('epilogue_16s', 8000),
  wait('epilogue_26s', 10000),
];
