import { readFileSync } from 'node:fs';
const H = readFileSync(new URL('./helpers.js', import.meta.url), 'utf8');
const s = (name, body, shot = false) => ({ name, shot, code: `(()=>{ ${body} })()` });
const trial = (label, setup) => s(label, `const g=__game, p=g.player; ${setup}; __game.player.teleport(T.V(0,0.05,-22.8), 0); T.step(0.3); g.input.press('forward'); T.step(1.6); g.input.release('forward'); T.step(0.2); return {z:+p.pos.z.toFixed(2), y:+p.feet.y.toFixed(3)};`);
export const steps = [
  { name: 'helpers', code: H },
  s('setup', `const d=__director; d.newGame(); d.ui.fade(0,0); const b=T.lat('bulk1'); b.tryShrink(); T.step(2.0); return b.offset;`),
  trial('default', ``),
  trial('nosnap', `p.kcc.disableSnapToGround()`),
  trial('nudge01', `p.kcc.enableSnapToGround(0.28); p.kcc.setNormalNudgeFactor(0.01)`),
  trial('nudge05', `p.kcc.setNormalNudgeFactor(0.05)`),
  trial('offset05', `p.kcc.setNormalNudgeFactor(0.0001); p.kcc.setOffset(0.05)`),
  trial('noautostep', `p.kcc.setOffset(0.02); p.kcc.disableAutostep()`),
  trial('slide_off', `p.kcc.enableAutostep(0.36,0.18,false); p.kcc.setSlideEnabled(false)`),
];
