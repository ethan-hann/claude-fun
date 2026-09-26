// Screenshots for LORE.md. Island-local feet position and look target; hud shows the HUD.
import { readFileSync } from 'node:fs';
const H = readFileSync(new URL('./helpers.js', import.meta.url), 'utf8');
const views = [
  { name: 'vault', key: 'a_vault', p: [2.6, 0, 19.4], look: [-2.4, 1.2, 25.2] },
  { name: 'graft', key: 'b_terraces', p: [3.4, 0.05, 5.6], look: [1.8, 0.2, 3.6], hud: true },
  { name: 'terraces', key: 'b_terraces', p: [0, 0.05, 14.5], look: [0, 1.8, 0] },
  { name: 'viaduct', key: 'c_viaduct', p: [-11.5, 1.0, 8.0], look: [0, 2.0, -40] },
  { name: 'weighhouse', key: 'd_weighhouse', p: [-9.5, 6.4, -30], look: [3, 3, -22] },
  { name: 'colonnade', key: 'e_colonnade', p: [0, 0.05, 14.5], look: [0, 4, -10] },
  { name: 'heart', key: 'g_heart', p: [0, 0.05, 6], look: [0, 12, -20] },
];
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
export const steps = [
  { name: 'helpers', code: H },
  ...(only && !only.includes('calyx') ? [] : [{ name: 'calyx', shot: true, code: `(()=>{ __director.showTitle(); __game.paused = true; window.__titleCam = [-60, 26, -70, 20, 10, -190];
    for (let k=0;k<3;k++) __director.update(1/60); __director.ui.showScreen(null); __game.renderFrame(1/60); return 'calyx'; })()` }]),
  ...views.filter((v) => !only || only.includes(v.name)).map((v) => ({
    name: v.name, shot: true,
    code: `(()=>{ window.__titleCam = undefined; const d=__director; const i=d.plan.findIndex(p=>p.key==='${v.key}'); d.startAt(i, false); d.ui.fade(0,0); __game.paused=false;
      document.querySelectorAll('#chapter,#card,#echo').forEach((e)=>{ e.style.transition='none'; }); d.ui.clearEcho(); d.ui.card(null); d.ui.setHudVisible(${v.hud ? 'true' : 'false'}); T.step(5.5);
      const O=__game.islands[i].origin; __game.player.teleport(T.V(${v.p[0]}+O.x, ${v.p[1]}+O.y, ${v.p[2]}+O.z), 0); T.step(0.6);
      T.lookAt(${v.look[0]}+O.x, ${v.look[1]}+O.y, ${v.look[2]}+O.z); d.ui.clearEcho(); d.ui.card(null); T.step(0.1); return '${v.name}'; })()`,
  })),
];
