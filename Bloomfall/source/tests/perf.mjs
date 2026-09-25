// Draw calls and triangles per frame at a few places on every island (renderer.info summed over
// all passes). VIEWS env as in views.mjs; defaults to each island's spawn looking ahead.
import { readFileSync } from 'node:fs';
const H = readFileSync(new URL('./helpers.js', import.meta.url), 'utf8');
const def = ['a_vault', 'b_terraces', 'c_viaduct', 'd_weighhouse', 'e_colonnade', 'f_heart'].map((key) => ({ key, name: key }));
const views = process.env.VIEWS ? JSON.parse(process.env.VIEWS) : def;
export const steps = [
  { name: 'helpers', code: H },
  ...views.map((v) => ({
    name: v.name, shot: !!process.env.SHOTS,
    code: `(()=>{ const d=__director; const i=d.plan.findIndex(p=>p.key==='${v.key}'); d.startAt(i, false); d.ui.fade(0,0);
      ${v.p ? `const O=__game.islands[i].origin; __game.player.teleport(T.V(${v.p}[0]+O.x, ${v.p}[1]+O.y, ${v.p}[2]+O.z), 0); T.step(0.4); T.lookAt(${v.look}[0]+O.x, ${v.look}[1]+O.y, ${v.look}[2]+O.z);` : 'T.step(0.4);'}
      const r=__game.r.renderer; r.info.autoReset=false; r.info.reset(); T.render(); const x={calls:r.info.render.calls, tris:r.info.render.triangles};
      r.info.autoReset=true; return x; })()`,
  })),
];
