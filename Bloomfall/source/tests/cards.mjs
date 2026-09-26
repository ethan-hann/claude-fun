// Cards: controls show at once; the counterweight gets no card; a hidden mechanic's card (the
// Observatory's lenses) waits, and shows only if the player has not found it by then.
import { readFileSync } from 'node:fs';
const H = readFileSync(new URL('./helpers.js', import.meta.url), 'utf8');
const P = (key) => `const i=__director.plan.findIndex(p=>p.key==='${key}'); const O=__game.islands[i].origin;
  const W=(x,z,o)=>T.walkTo(O.x+x,O.z+z,o); const card=()=>__director.ui.currentCard;`;
const st = (key, name, body, shot = false) => ({ name, shot, code: `(()=>{ ${P(key)} ${body} })()` });
export const steps = [
  { name: 'helpers', code: H },
  st('a_vault', 'wake', `__director.startAt(i, true); __director.ui.fade(0,0); T.step(2.0); return {card:card()};`),
  st('d_weighhouse', 'lift', `__director.startAt(i, true); __director.ui.fade(0,0); T.step(0.5); W(-3.4,-1.4,{tol:0.5}); T.step(3.0); return {card:card()};`),
  st('f_observatory', 'dais_early', `__director.startAt(i, true); __director.ui.fade(0,0); T.step(0.5); W(0,-8.2,{tol:0.5}); T.step(20.0); return {card:card()};`),
  st('f_observatory', 'dais_late', `T.step(25.0); return {card:card()};`, true),
  // with a lens already in a cradle, the card never comes
  st('f_observatory', 'dais_solved', `__director.startAt(i, true); __director.ui.fade(0,0); T.step(0.5);
    const l=T.lat('lens_w'); l.body.setTranslation({x:O.x-2.3,y:O.y+0.7,z:O.z-14},true); T.step(1.0);
    W(0,-8.2,{tol:0.5}); T.step(50.0); return {card:card(), cr:T.ent('cr_w').active};`),
];
