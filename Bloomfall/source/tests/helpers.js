// Installed into the page by scenarios: drives the real input and simulation.
window.T = (() => {
  const g = () => window.__game;
  const d = () => window.__director;
  const V = (x, y, z) => new (window.__game.r.camera.position.constructor)(x, y, z);
  function step(sec) {
    const n = Math.max(1, Math.round(sec * 60));
    for (let i = 0; i < n; i++) {
      g().simulate(1 / 60, false);
      if (d()) { d().update(1 / 60); d().frameViewModel(1 / 60, 0, 0); }
    }
  }
  function lookAt(x, y, z) {
    const p = g().player;
    const eye = p.pos.clone(); eye.y += 0.56;
    const dx = x - eye.x, dy = y - eye.y, dz = z - eye.z;
    p.yaw = Math.atan2(-dx, -dz);
    p.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  }
  function tap(a, hold = 0.05) { g().input.press(a); step(hold); g().input.release(a); step(0.05); }
  function walkTo(x, z, opts = {}) {
    const p = g().player;
    const max = opts.max ?? 12;
    const tol = opts.tol ?? 0.45;
    let t = 0;
    g().input.press('forward');
    if (opts.run) g().input.press('sprint');
    while (t < max) {
      const dx = x - p.pos.x, dz = z - p.pos.z;
      if (Math.hypot(dx, dz) < tol) break;
      p.yaw = Math.atan2(-dx, -dz);
      if (opts.pitch !== undefined) p.pitch = opts.pitch;
      if (opts.jumpWhenStuck && Math.hypot(p.vel.x, p.vel.z) < 0.5 && t > 0.3) { g().input.press('jump'); step(1/60); g().input.release('jump'); }
      step(1 / 30);
      t += 1 / 30;
    }
    g().input.release('forward');
    g().input.release('sprint');
    step(0.25);
    return { ok: t < max, pos: [+p.pos.x.toFixed(2), +p.feet.y.toFixed(2), +p.pos.z.toFixed(2)], t: +t.toFixed(1) };
  }
  function jumpForward(sec = 0.8) {
    g().input.press('forward'); g().input.press('jump'); step(1 / 30); g().input.release('jump'); step(sec); g().input.release('forward'); step(0.3);
    const p = g().player;
    return [+p.pos.x.toFixed(2), +p.feet.y.toFixed(2), +p.pos.z.toFixed(2)];
  }
  // Face (x, z), run for `runup` seconds, jump, keep running while airborne.
  function runJump(x, z, runup = 0.35, air = 0.8) {
    const p = g().player;
    const dx = x - p.pos.x, dz = z - p.pos.z;
    p.yaw = Math.atan2(-dx, -dz);
    g().input.press('forward');
    step(runup);
    g().input.press('jump'); step(1 / 60); g().input.release('jump');
    step(air);
    g().input.release('forward');
    step(0.3);
    return [+p.pos.x.toFixed(2), +p.feet.y.toFixed(2), +p.pos.z.toFixed(2)];
  }
  // Jump onto a small target at (x, z) whose top is at y = top: jump first, move once the feet
  // clear the top (so the player does not shove it), and let go of forward once over it.
  function hopTo(x, z, top, maxT = 0.9) {
    const p = g().player;
    const face = () => { p.yaw = Math.atan2(-(x - p.pos.x), -(z - p.pos.z)); };
    face();
    g().input.press('jump'); step(1 / 60); g().input.release('jump');
    let t = 0;
    while (t < 0.35 && p.feet.y < top + 0.08) { step(1 / 60); t += 1 / 60; }
    g().input.press('forward');
    // in the air the player brakes at 9 m/s^2 with no input: let go at the stopping distance
    while (t < maxT) {
      const d = Math.hypot(x - p.pos.x, z - p.pos.z), v = Math.hypot(p.vel.x, p.vel.z);
      if (d <= (v * v) / 18 + 0.03) break;
      face(); step(1 / 60); t += 1 / 60;
    }
    g().input.release('forward');
    step(0.5);
    return [+p.pos.x.toFixed(2), +p.feet.y.toFixed(2), +p.pos.z.toFixed(2)];
  }
  // ids are per island; prefer the island the player is on
  const cur = () => (d() && d().island ? d().island.key + '.' : '');
  function lat(id) { return g().lattices.get(cur() + id) ?? [...g().lattices.values()].find((l) => l.id.endsWith('.' + id)); }
  function ent(id) { return g().entities.get(cur() + id) ?? [...g().entities.values()].find((e) => e.id.endsWith('.' + id)); }
  function state() {
    const p = g().player, gr = g().graft;
    return { feet: [+p.pos.x.toFixed(2), +p.feet.y.toFixed(2), +p.pos.z.toFixed(2)], cells: gr.cells, owned: gr.owned, held: gr.held && gr.held.id, target: gr.target && gr.target.id, card: d() && d().ui.currentCard };
  }
  function render() { g().renderFrame(1 / 60); }
  return { step, lookAt, tap, walkTo, jumpForward, runJump, hopTo, lat, ent, state, render, V };
})();
'ok';
