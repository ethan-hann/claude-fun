// Islands II and IV drop part of themselves behind the player. They must wait while the rest of the
// island could not be finished without what would fall: on II, two cells of space up top; on IV, a
// crate inside the hall.
import { readFileSync } from 'node:fs';
const H = readFileSync(new URL('./helpers.js', import.meta.url), 'utf8');
const P = (key) => `const i=__director.plan.findIndex(p=>p.key==='${key}'); const isl=__game.islands[i]; const O=isl.origin;
  const W=(x,z,o)=>T.walkTo(O.x+x,O.z+z,o); const look=(x,y,z)=>{ T.lookAt(O.x+x,O.y+y,O.z+z); T.step(0.15); };
  const later=(ms, f)=>new Promise((r)=>setTimeout(()=>r(f()), ms));`;
const st = (key, name, body) => ({ name, code: `(()=>{ ${P(key)} ${body} })()` });
export const steps = [
  { name: 'helpers', code: H },
  // ---- II: on the terrace with an empty Graft, the garden stays
  st('b_terraces', 'b_start', `__director.startAt(i, true); __director.ui.fade(0,0); T.step(0.5);
    __game.player.teleport(T.V(O.x-2.4, O.y+4.35, O.z-14.0), 0); T.step(1.0);
    return later(1500, ()=>({cells:__game.graft.cells, onTop:T.ent('z_top').active, falling:!!isl.chunks.get('garden').fall}));`),
  // reach down from the edge and take a bollard's cell; back on the terrace, the garden goes
  st('b_terraces', 'b_take', `W(-2.4,-12.3,{tol:0.2}); look(-2.4,0.5,-5.8); T.tap('take'); T.step(0.8); const cells=__game.graft.cells;
    W(-2.4,-14.2,{tol:0.3}); T.step(0.5);
    return later(1500, ()=>({cells, onTop:T.ent('z_top').active, falling:!!isl.chunks.get('garden').fall}));`),
  // ---- IV: inside the hall without a crate, the forecourt stays
  st('d_weighhouse', 'd_start', `__director.startAt(i, true); __director.ui.fade(0,0); T.step(0.5);
    __game.player.teleport(T.V(O.x+3.0, O.y+6.05, O.z-8.7), 0); T.step(1.0);
    return later(2500, ()=>({inside:T.ent('z_inside').active, falling:!!isl.chunks.get('forecourt').fall}));`),
  // a crate comes in: the forecourt goes
  st('d_weighhouse', 'd_crate', `const c=T.lat('c_lift'); c.body.setTranslation({x:O.x+5.0, y:O.y+6.6, z:O.z-9.0}, true); c.body.setLinvel({x:0,y:0,z:0}, true); T.step(0.5);
    return later(2500, ()=>({inside:T.ent('z_inside').active, falling:!!isl.chunks.get('forecourt').fall}));`),
];
