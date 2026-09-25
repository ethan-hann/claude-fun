import { readFileSync } from 'node:fs';
const H = readFileSync(new URL('./helpers.js', import.meta.url), 'utf8');
const s = (name, body, shot = false) => ({ name, shot, code: `(()=>{ ${body} })()` });
export const steps = [
  { name: 'helpers', code: H },
  s('setup', `const d=__director; d.newGame(); d.ui.fade(0,0); const b=T.lat('bulk1'); b.tryShrink(); T.step(2.0); __game.player.teleport(T.V(0,0.05,-22.8), 0); T.step(0.3); return {off:b.offset, bt:b.body.translation()};`),
  s('walk', `const g=__game, p=g.player; g.input.press('forward'); const out=[]; for(let i=0;i<40;i++){ T.step(1/30); if(i%4==0){ const cols=[]; for(let k=0;k<p.kcc.numComputedCollisions();k++){ const c=p.kcc.computedCollision(k); if(c&&c.collider){ const o=g.phys.owners.get(c.collider.handle); const t=c.collider.translation(); cols.push({h:c.collider.handle, kind:o?o.kind:'static', n:[+c.normal1.x.toFixed(2),+c.normal1.y.toFixed(2),+c.normal1.z.toFixed(2)], ct:[+t.x.toFixed(2),+t.y.toFixed(2),+t.z.toFixed(2)], shape:c.collider.shape.type, he:c.collider.shape.halfExtents?[c.collider.shape.halfExtents.x,c.collider.shape.halfExtents.y,c.collider.shape.halfExtents.z].map(v=>+v.toFixed(2)):null}); } } out.push({z:+p.pos.z.toFixed(2), y:+p.feet.y.toFixed(3), cols}); } } g.input.release('forward'); return out.slice(0,6); `),
];
