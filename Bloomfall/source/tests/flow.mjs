export const steps = [
  { name: 'title', code: `(async()=>{ const d=window.__director, g=window.__game; d.showTitle(); for(let i=0;i<30;i++){ d.update(1/30); g.renderFrame(1/30);} return d.state; })()`, shot: true },
  { name: 'wake', code: `(async()=>{ const d=window.__director, g=window.__game; d.newGame(); d.ui.fade(0,0); for(let i=0;i<40;i++){ g.simulate(1/30,false); d.update(1/30); d.frameViewModel(1/30,0,0);} g.renderFrame(1/30); return {state:d.state, pos:g.player.pos.toArray().map(v=>+v.toFixed(2)), card:d.ui.currentCard}; })()`, shot: true },
];
