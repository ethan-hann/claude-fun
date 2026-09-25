import { readFileSync } from 'node:fs';
const H = readFileSync(new URL('./helpers.js', import.meta.url), 'utf8');
const s = (name, body, shot = false) => ({ name, shot, code: `(()=>{ const O=[0,25.5,-447.2]; const L=(x,y,z)=>T.V(x+O[0],y+O[1],z+O[2]); const P=()=>{const p=__game.player; return [+(p.pos.x-O[0]).toFixed(2), +(p.feet.y-O[1]).toFixed(2), +(p.pos.z-O[2]).toFixed(2)];}; const LP=(id)=>{const c=T.lat(id).position(); return [+(c.x-O[0]).toFixed(2), +(c.y-O[1]).toFixed(2), +(c.z-O[2]).toFixed(2)];}; ${body} })()` });
const look = (x, y, z) => `{const w=L(${x},${y},${z}); T.lookAt(w.x,w.y,w.z); T.step(0.15);}`;
const tgt = `(__game.graft.target&&__game.graft.target.id)`;
const wait = (name, ms, shot = true) => ({ name, shot, code: `new Promise((r) => setTimeout(() => r('${name}'), ${ms}))` });
export const steps = [
  { name: 'helpers', code: H },
  s('start', `const d=__director; d.startAt(d.plan.findIndex(p=>p.key==='f_heart'), true); d.ui.fade(0,0); T.step(1.0); ${look(0,12,-20)} return {p:P(), inf:__game.graft.infinite};`, true),
  s('approach', `const a=L(0,0,-4.0); T.walkTo(a.x,a.z,{tol:0.3}); ${look(0,10,-20)} return {p:P()};`, true),
  s('grab_b', `const c=T.lat('c_b').position(); T.walkTo(c.x+0.8, c.z+0.8,{tol:0.3}); T.lookAt(c.x,c.y,c.z); T.step(0.1); T.tap('use'); T.step(0.4); return {s:T.state()};`),
  s('grow_a1', `const a=T.lat('c_a').position(); T.walkTo(a.x, a.z+1.5,{tol:0.25}); T.lookAt(a.x,a.y,a.z); T.step(0.1); T.tap('give'); T.step(1.0); return {lvl:T.lat('c_a').level};`),
  s('mount_a', `const a=T.lat('c_a').position(); const r=T.runJump(a.x, a.z, 0.1, 0.45); T.step(0.3); return {r, s:T.state()};`),
  s('grow_a', `const a=T.lat('c_a').position(); T.lookAt(a.x,a.y-0.3,a.z); T.step(0.1); T.tap('give'); T.step(1.4); return {lvl:T.lat('c_a').level, s:T.state()};`, true),
  s('drop_b', `const a=T.lat('c_a').position(); T.lookAt(a.x, a.y+1.0, a.z-0.6); T.step(0.4); T.tap('use'); T.step(1.2); return {b:LP('c_b'), s:T.state()};`),
  s('grow_b', `const b=T.lat('c_b').position(); T.lookAt(b.x,b.y,b.z); T.step(0.1); T.tap('give'); T.step(1.2); return {lvl:T.lat('c_b').level, b:LP('c_b'), s:T.state()};`),
  s('mount_b', `const b=T.lat('c_b').position(); const r=T.runJump(b.x, b.z, 0.0, 0.2); T.step(0.3); return {r, s:T.state()};`),
  s('onto_wall', `const w=L(0,4.3,-11.9); const r=T.runJump(w.x, w.z, 0.1, 0.6); return {r:P()};`, true),
  s('walk_wall', `const a=L(3.0,4.3,-11.8); T.walkTo(a.x,a.z,{tol:0.3}); const b=L(7.1,4.3,-14.6); T.walkTo(b.x,b.z,{tol:0.3}); const c=L(7.3,4.3,-20); const r=T.walkTo(c.x,c.z,{tol:0.3}); return {r, p:P()};`, true),
  s('onto_p', `const w=L(4.5,4.3,-20); const r=T.runJump(w.x, w.z, 0.2, 0.7); return {r:P()};`),
  s('raise_p', `${look(4.5,4.3,-20.6)} for (let i=0;i<4;i++){ T.tap('give'); T.step(0.9); } T.step(0.6); return {p:P(), lvl:T.lat('p').level};`, true),
  s('onto_core', `const w=L(0.6,10.3,-20); const r=T.runJump(w.x, w.z, 0.1, 0.6); T.step(0.5); return {r:P()};`, true),
  s('look_heart', `${look(0,16.8,-20)} T.step(0.3); return {core:!!__game.graft.coreTarget};`, true),
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
