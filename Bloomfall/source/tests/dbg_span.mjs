import { readFileSync } from 'node:fs';
const H = readFileSync(new URL('./helpers.js', import.meta.url), 'utf8');
const s = (name, body, shot = false) => ({ name, shot, code: `(()=>{ const O=[14,8.0,-173.2]; const L=(x,y,z)=>T.V(x+O[0],y+O[1],z+O[2]); ${body} })()` });
export const steps = [
  { name: 'helpers', code: H },
  s('start', `const d=__director; d.startAt(d.plan.findIndex(p=>p.key==='c_viaduct'), true); d.ui.fade(0,0); T.step(0.5); const l=T.lat('s_a'); const c=l.collider; const t=c.translation(); const h=c.halfExtents(); const bt=l.body.translation(); return {len:l.len, lvl:l.level, ct:[t.x,t.y,t.z], h:[h.x,h.y,h.z], bt:[bt.x,bt.y,bt.z], groups:c.collisionGroups(), enabled:c.isEnabled()};`),
  s('ray', `const a=L(0,0,5.6); __game.player.teleport(a,0); T.step(0.3); const w=L(0,-0.15,3.7); T.lookAt(w.x,w.y,w.z); T.step(0.2); const g=__game.graft; const cam=__game.r.camera; const dir=new (cam.position.constructor)(0,0,-1).applyQuaternion(cam.quaternion); const hit=__game.phys.castGraft(cam.position, dir, 16, null); const o=hit&&__game.phys.owners.get(hit.collider.handle); return {cam:cam.position.toArray().map(v=>+v.toFixed(2)), dir:dir.toArray().map(v=>+v.toFixed(2)), toi:hit&&hit.toi, owner:o&&o.kind, lat:o&&o.lattice&&o.lattice.id, target:g.target&&g.target.id};`, true),
];
