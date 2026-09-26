// The Observatory: a lens that falls into the haze returns to where it last rested at floor level.
import { readFileSync } from 'node:fs';
const H = readFileSync(new URL('./helpers.js', import.meta.url), 'utf8');
const P = `const O=__game.islands[__director.plan.findIndex(p=>p.key==='f_observatory')].origin;
  const loc=(v)=>[+(v.x-O.x).toFixed(2), +(v.y-O.y).toFixed(2), +(v.z-O.z).toFixed(2)];
  const l=T.lat('lens_w');`;
const st = (name, body) => ({ name, code: `(()=>{ ${P} ${body} })()` });
export const steps = [
  { name: 'helpers', code: H },
  st('start', `const d=__director; d.startAt(d.plan.findIndex(p=>p.key==='f_observatory'), true); d.ui.fade(0,0); T.step(1.0); return {lens:loc(l.position()), spawn:loc(l.spawnPos)};`),
  // set the lens down on the plaza and let it settle
  st('rest', `l.body.setTranslation({x:O.x+5.0, y:O.y+0.4, z:O.z-19.0}, true); l.body.setLinvel({x:0,y:0,z:0}, true); T.step(2.0); return {lens:loc(l.position()), spawn:loc(l.spawnPos)};`),
  // knock it off the edge of the island
  st('fall', `l.body.setTranslation({x:O.x+5.0, y:O.y-60, z:O.z-40.0}, true); T.step(1.0); return {lens:loc(l.position()), spawn:loc(l.spawnPos)};`),
  // a reset puts it back on its tower (the reset waits 280 ms of real time behind a fade)
  st('reset', `__director.resetIsland(); return new Promise((r) => setTimeout(() => { T.step(1.0); r({lens:loc(l.position()), spawn:loc(l.spawnPos)}); }, 600));`),
];
