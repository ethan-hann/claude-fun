const g = 'window.__game';
export const steps = [
  { name: 'r0', code: `(()=>{ const g=${g}; g.simulate(0.5); const c=g.r.camera; return {rot:[c.rotation.x,c.rotation.y,c.rotation.z].map(v=>+v.toFixed(3)), order:c.rotation.order, up:c.up.toArray()}; })()` },
  { name: 'r1', code: `(()=>{ const g=${g}; g.player.teleport(new g.r.camera.position.constructor(3,0,9), 0); g.player.pitch=-0.35; g.simulate(0.3); const c=g.r.camera; return {rot:[c.rotation.x,c.rotation.y,c.rotation.z].map(v=>+v.toFixed(3)), yaw:g.player.yaw, pitch:g.player.pitch, q:c.quaternion.toArray().map(v=>+v.toFixed(3))}; })()` },
];
