// Carrying a crate into the floor and a wall makes no impact sounds; setting it down makes one;
// a resting crate makes none.
import { readFileSync } from 'node:fs';
const H = readFileSync(new URL('./helpers.js', import.meta.url), 'utf8');
const s = (name, body, shot = false) => ({ name, shot, code: `(()=>{ ${body} })()` });
export const steps = [
  { name: 'helpers', code: H },
  s('start', `const d=__director, g=__game; d.newGame(); d.ui.fade(0,0); T.step(1.0); T.walkTo(0, 17.2, {tol:0.3}); T.runJump(0, 10, 0.3, 0.75);
    window.__imp=[]; const em=g.emit.bind(g); g.emit=(k,d)=>{ if(k==='impact') window.__imp.push({t:+g.time.toFixed(2), id:d.lattice.id, f:+d.force.toFixed(2)}); return em(k,d); }; return T.state();`),
  s('grab', `T.walkTo(1.9, 6.9, {tol:0.35}); T.lookAt(2.9,0.5,6.9); T.step(0.1); T.tap('use'); T.step(0.3); window.__imp.length=0; return T.state();`),
  s('press_floor', `const g=__game, c=g.graft.held; g.player.pitch=-1.35; const ys=[]; for(let i=0;i<90;i++){ T.step(1/60); ys.push(c.position().y); } const mn=Math.min(...ys.slice(30)), mx=Math.max(...ys.slice(30)); return {held:!!g.graft.held, y:+ys[ys.length-1].toFixed(3), jitter:+(mx-mn).toFixed(4), impacts:window.__imp.length};`, true),
  s('press_wall', `const g=__game, c=g.graft.held; g.player.pitch=-0.2; g.player.yaw=-Math.PI/2; g.input.press('forward'); const xs=[]; for(let i=0;i<150;i++){ T.step(1/60); xs.push(c.position().x); } g.input.release('forward'); T.step(0.3); const mn=Math.min(...xs.slice(90)), mx=Math.max(...xs.slice(90)); return {held:!!g.graft.held, x:+xs[xs.length-1].toFixed(3), jitter:+(mx-mn).toFixed(4), impacts:window.__imp.length, feet:T.state().feet};`, true),
  s('set_down', `const g=__game; g.player.pitch=-0.5; T.step(0.3); window.__imp.length=0; T.tap('use'); T.step(1.5); return {held:!!g.graft.held, impacts:window.__imp.slice()};`, true),
  s('rest', `window.__imp.length=0; T.step(4.0); const c=T.lat('c_plate'); const v=c.body.linvel(); return {impacts:window.__imp.length, speed:+Math.hypot(v.x,v.y,v.z).toFixed(4), bottom:+(c.position().y-c.size/2).toFixed(4)};`),
  s('drop_high', `const g=__game; const c=T.lat('c_plate'); T.lookAt(c.position().x,c.position().y,c.position().z); T.step(0.1); T.tap('use'); T.step(0.2); g.player.pitch=0.5; T.step(0.5); window.__imp.length=0; T.tap('use'); T.step(1.5); return {impacts:window.__imp.slice()};`),
];
