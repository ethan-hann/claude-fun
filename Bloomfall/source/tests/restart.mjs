// Pickups after a restart: the Graft is back on its pedestal after a new game, the second cell is
// back in the shrine after replaying Island III, and a hold-R reset leaves the Graft on your arm.
import { readFileSync } from 'node:fs';
const H = readFileSync(new URL('./helpers.js', import.meta.url), 'utf8');
const pk = (id) => `(()=>{ const p=__game.entities.get('${id}'); return {taken:p.taken, visible:p.object.visible}; })()`;
export const steps = [
  { name: 'helpers', code: H },
  { name: 'take_graft', code: `(()=>{ const d=__director; d.newGame(); d.ui.fade(0,0); T.step(0.5);
      const p=__game.entities.get('a_vault.graft'); const o=__game.islands[0].origin;
      __game.player.teleport(T.V(4.2+o.x, 0.1+o.y, -13.8+o.z), 0); T.step(0.5); T.lookAt(p.pos.x, p.pos.y, p.pos.z); T.step(0.2); T.tap('use'); T.step(0.5);
      return {owned:__game.graft.owned, pickup:${pk('a_vault.graft')}}; })()` },
  { name: 'hold_r_reset', code: `(()=>{ const d=__director; d.resetIsland(); return new Promise((res)=>setTimeout(()=>{ T.step(0.3);
      res({owned:__game.graft.owned, pickup:${pk('a_vault.graft')}}); }, 600)); })()` },
  { name: 'new_game', code: `(()=>{ const d=__director; d.newGame(); d.ui.fade(0,0); T.step(0.5);
      return {owned:__game.graft.owned, pickup:${pk('a_vault.graft')}}; })()` },
  { name: 'take_again', code: `(()=>{ const p=__game.entities.get('a_vault.graft'); const o=__game.islands[0].origin;
      __game.player.teleport(T.V(4.2+o.x, 0.1+o.y, -13.8+o.z), 0); T.step(0.5); T.lookAt(p.pos.x, p.pos.y, p.pos.z); T.step(0.2); T.tap('use'); T.step(0.5);
      return {owned:__game.graft.owned, pickup:${pk('a_vault.graft')}}; })()` },
  { name: 'chapter_3', code: `(()=>{ const d=__director; d.startAt(2, false); d.ui.fade(0,0); T.step(0.5);
      const p=__game.entities.get('c_viaduct.cell'); d.onPickup ? 0 : 0; p.take(__game.ctx); T.step(0.2);
      return {capAfterPickup:__game.graft.capacity}; })()` },
  { name: 'chapter_3_again', code: `(()=>{ const d=__director; d.startAt(2, false); d.ui.fade(0,0); T.step(0.5);
      return {capacity:__game.graft.capacity, cell:${pk('c_viaduct.cell')}}; })()` },
];
