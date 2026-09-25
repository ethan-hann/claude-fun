import { readFileSync } from 'node:fs';
const H = readFileSync(new URL('./helpers.js', import.meta.url), 'utf8');
export const steps = [
  { name: 'helpers', code: H },
  { name: 'title', shot: true, code: `(()=>{ __director.showTitle(); __game.paused=true; for(let k=0;k<3;k++) __director.update(1/60); return 'ok'; })()` },
  { name: 'settings', shot: true, code: `(()=>{ document.querySelector('#title [data-a="settings"]').click(); return 'ok'; })()` },
  { name: 'chapters', shot: true, code: `(()=>{ __director.ui.showScreen('title'); __director.ui.setChapters(__director.plan.map((p,i)=>({numeral:['I','II','III','IV','V','VI'][i], name:p.key, enabled:i<4}))); document.querySelector('#title [data-a="chapters"]').click(); return 'ok'; })()` },
  { name: 'wake', shot: true, code: `(()=>{ const d=__director; d.startAt(0, true); d.ui.fade(0,0); T.step(2.5); return T.state(); })()` },
  { name: 'card_echo', shot: true, code: `(()=>{ T.step(4.0); __director.ui.card('carry'); __director.ui.echo(['This is the cloister of the Seed Vault.']); T.step(1.5); return 'ok'; })()` },
  { name: 'target', shot: true, code: `(()=>{ const c=T.lat('c_plate').position(); T.walkTo(c.x-0.2, c.z+2.0,{tol:0.3, max:20}); T.lookAt(c.x,c.y,c.z); T.step(0.4); return T.state(); })()` },
  { name: 'memory', shot: true, code: `(()=>{ __director.ui.memory('A letter, unsent', 'My daughter\\'s school drifted past the river district this morning.', 'Memory 1 of 6'); T.step(1.0); return 'ok'; })()` },
  { name: 'chapter_title', shot: true, code: `(()=>{ __director.ui.chapter('c_viaduct'); T.step(1.8); return 'ok'; })()` },
  { name: 'pause', shot: true, code: `(()=>{ __director.pause(); return 'ok'; })()` },
];
