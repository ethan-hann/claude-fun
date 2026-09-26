// Drives the real frame loop at a high refresh rate with real key events. Every tap must count.
import { readFileSync } from 'node:fs';
const H = readFileSync(new URL('./helpers.js', import.meta.url), 'utf8');
const s = (name, body, shot = false) => ({ name, shot, code: `(()=>{ ${body} })()` });
const run = (hz) => s(`taps_${hz}hz`, `
  const g=__game, d=__director;
  const keep=g.renderFrame; g.renderFrame=()=>{};
  let now=performance.now(); g.last=now;
  const frames=(sec)=>{ const n=Math.round(sec*${hz}); for(let i=0;i<n;i++){ now+=1000/${hz}; g.frame(now); } };
  const key=(type,code)=>window.dispatchEvent(new KeyboardEvent(type,{code, bubbles:true}));
  // tap E once per trial: one frame down, then up
  const tap=(code)=>{ key('keydown',code); frames(1/${hz}); key('keyup',code); frames(0.3); };
  let grabs=0, drops=0, jumps=0, hints=0;
  for(let i=0;i<8;i++){
    g.player.teleport(T.V(1.9,0,6.9), 0); frames(0.2); T.lookAt(2.9,0.5,6.9); frames(0.1);
    tap('KeyE'); if(g.graft.held) grabs++;
    tap('KeyE'); if(!g.graft.held) drops++;
    g.graft.held && g.graft.drop(false);
    const t0=d.ui.el?.querySelector?.('.toast')?.textContent;
    const y0=g.player.feet.y; key('keydown','Space'); frames(1/${hz}); key('keyup','Space');
    let top=y0; for(let k=0;k<40;k++){ frames(1/${hz}); top=Math.max(top,g.player.feet.y); } frames(0.8);
    if(top-y0>0.5) jumps++;
  }
  g.renderFrame=keep;
  return {hz:${hz}, grabs, drops, jumps, of:8};
`);
export const steps = [
  { name: 'helpers', code: H },
  s('start', `const d=__director; d.newGame(); d.ui.fade(0,0); T.step(1.0); T.walkTo(0, 17.2, {tol:0.3}); T.runJump(0, 10, 0.3, 0.75); return T.state();`),
  run(60), run(144), run(240),
];
