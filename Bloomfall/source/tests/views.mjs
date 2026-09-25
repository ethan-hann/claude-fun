// Screenshots from fixed viewpoints. VIEWS env: JSON list of {key, p:[x,y,z] (island local feet), look:[x,y,z], name}
import { readFileSync } from 'node:fs';
const H = readFileSync(new URL('./helpers.js', import.meta.url), 'utf8');
const views = JSON.parse(process.env.VIEWS || '[]');
export const steps = [
  { name: 'helpers', code: H },
  ...views.map((v) => ({
    name: v.name, shot: true,
    code: `(()=>{ const d=__director; const i=d.plan.findIndex(p=>p.key==='${v.key}'); if (d.index!==i || d.state!=='playing') { d.startAt(i, false); d.ui.fade(0,0); }
      d.ui.setHudVisible(${v.hud ? 'true' : 'false'}); const O=__game.islands[i].origin; const p=T.V(${v.p[0]}+O.x, ${v.p[1]}+O.y, ${v.p[2]}+O.z);
      __game.player.teleport(p, 0); T.step(${v.wait ?? 0.4}); const w=T.V(${v.look[0]}+O.x, ${v.look[1]}+O.y, ${v.look[2]}+O.z); T.lookAt(w.x,w.y,w.z); T.step(0.05); return '${v.name}'; })()`,
  })),
];
