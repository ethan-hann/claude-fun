// Bulkheads (bollards, the vault's arch wall) sink into the floor when you take their cell, and
// rise again when you give it back.
import { readFileSync } from 'node:fs';
const H = readFileSync(new URL('./helpers.js', import.meta.url), 'utf8');
const P = (key) => `const i=__director.plan.findIndex(p=>p.key==='${key}'); const O=__game.islands[i].origin;
  const W=(x,z,o)=>T.walkTo(O.x+x,O.z+z,o); const look=(x,y,z)=>{ T.lookAt(O.x+x,O.y+y,O.z+z); T.step(0.15); };
  const tgt=()=>__game.graft.target&&__game.graft.target.id;`;
const st = (key, name, body) => ({ name, code: `(()=>{ ${P(key)} ${body} })()` });
const cycle = (key, id, at, stand) => [
  st(key, `${key}_${id}_take`, `W(${stand[0]},${stand[1]},{tol:0.3}); look(${at[0]},0.5,${at[1]}); const t=tgt(); T.tap('take'); T.step(1.5); return {t, lvl:T.lat('${id}').level, cells:__game.graft.cells};`),
  st(key, `${key}_${id}_give`, `look(${at[0]},0.0,${at[1]}); const t=tgt(); T.tap('give'); T.step(1.5); return {t, lvl:T.lat('${id}').level, cells:__game.graft.cells};`),
];
export const steps = [
  { name: 'helpers', code: H },
  st('b_terraces', 'start_b', `__director.startAt(i, true); __director.ui.fade(0,0); T.step(0.5); return 'ok';`),
  ...cycle('b_terraces', 'bol3', [0.4, 2.2], [0.4, 5.6]),
  st('f_observatory', 'start_f', `__director.startAt(i, true); __director.ui.fade(0,0); T.step(0.5); return 'ok';`),
  ...cycle('f_observatory', 'b1', [-4.8, -6.2], [-3.6, -3.6]),
];
