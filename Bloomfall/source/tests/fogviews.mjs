// How far the fog lets you see: from each island's bloom, looking at the next island and on along the
// chain, plus the title screen. Screenshots only.
import { readFileSync } from 'node:fs';
const H = readFileSync(new URL('./helpers.js', import.meta.url), 'utf8');
const view = (i) => ({
  name: `bloom_${i}`, shot: true,
  code: `(()=>{ const d=__director; d.startAt(${i}, false); d.ui.fade(0,0); d.ui.setHudVisible(false); T.step(0.3);
    const b=__game.islands[${i}].bloomPoint; __game.player.teleport(T.V(b.x, b.y+0.1, b.z+2.5), 0); T.step(0.3);
    const n=__game.islands[${i + 1}].arrivePoint; T.lookAt(n.x, n.y+6, n.z); T.step(0.05);
    const far=__game.islands.slice(${i + 1}).map(isl=>Math.round(isl.origin.distanceTo(__game.player.pos)));
    return {dist:far}; })()`,
});
export const steps = [
  { name: 'helpers', code: H },
  ...[0, 1, 2, 3, 4, 5].map(view),
  { name: 'title', shot: true, code: `(()=>{ __director.showTitle(); for (let k=0;k<3;k++) __director.update(1/60); return 'ok'; })()` },
];
