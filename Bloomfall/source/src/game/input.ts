// Keyboard, mouse (pointer lock) and gamepad input. Tests can drive it through the same
// state (virtual keys and look deltas), so automated playthroughs use the real code paths.

export type Action = 'forward' | 'back' | 'left' | 'right' | 'jump' | 'sprint' | 'use' | 'throw' | 'give' | 'take' | 'reset' | 'pause' | 'hint';

const KEYMAP: Record<string, Action> = {
  KeyW: 'forward', ArrowUp: 'forward', KeyS: 'back', ArrowDown: 'back', KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right', Space: 'jump', ShiftLeft: 'sprint', ShiftRight: 'sprint', KeyE: 'use',
  KeyF: 'throw', KeyR: 'reset', Escape: 'pause', KeyH: 'hint', KeyZ: 'give', KeyX: 'take',
};

export class Input {
  down = new Set<Action>();
  // Presses wait here until a physics step reads them. Steps run at 60 Hz and frames can run
  // faster, so clearing these every frame would drop most presses on a 144 Hz screen.
  pressed = new Set<Action>();
  released = new Set<Action>();
  // Presses for per-frame logic (pause, hints), cleared after every rendered frame.
  framePressed = new Set<Action>();
  lookDX = 0;
  lookDY = 0;
  sensitivity = 1.0;
  invertY = false;
  locked = false;
  enabled = true;
  onLockChange: ((locked: boolean) => void) | null = null;
  private element: HTMLElement;
  private gamepadIndex: number | null = null;
  private padPrev = new Set<Action>();
  usingGamepad = false;

  constructor(element: HTMLElement) {
    this.element = element;
    window.addEventListener('keydown', (e) => {
      const a = KEYMAP[e.code];
      if (!a) return;
      if (a !== 'pause') e.preventDefault();
      this.usingGamepad = false;
      if (!this.down.has(a)) this.edge(a);
      this.down.add(a);
    });
    window.addEventListener('keyup', (e) => {
      const a = KEYMAP[e.code];
      if (!a) return;
      this.down.delete(a);
      this.released.add(a);
    });
    window.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      const a: Action | null = e.button === 0 ? 'give' : e.button === 2 ? 'take' : e.button === 1 ? 'throw' : null;
      if (!a) return;
      this.usingGamepad = false;
      if (!this.down.has(a)) this.edge(a);
      this.down.add(a);
    });
    window.addEventListener('mouseup', (e) => {
      const a: Action | null = e.button === 0 ? 'give' : e.button === 2 ? 'take' : e.button === 1 ? 'throw' : null;
      if (!a) return;
      this.down.delete(a);
      this.released.add(a);
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.lookDX += e.movementX;
      this.lookDY += e.movementY;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.element;
      if (!this.locked) this.down.clear();
      this.onLockChange?.(this.locked);
    });
    window.addEventListener('blur', () => this.down.clear());
    window.addEventListener('gamepadconnected', (e) => { this.gamepadIndex = (e as GamepadEvent).gamepad.index; });
    window.addEventListener('gamepaddisconnected', () => { this.gamepadIndex = null; });
  }

  requestLock(): void {
    const el = this.element as any;
    try {
      const p = el.requestPointerLock?.({ unadjustedMovement: true });
      if (p && typeof p.catch === 'function') p.catch(() => el.requestPointerLock?.());
    } catch {
      el.requestPointerLock?.();
    }
  }

  exitLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  // Analog movement in [-1, 1] (x = strafe right, y = forward).
  move(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.down.has('forward')) y += 1;
    if (this.down.has('back')) y -= 1;
    if (this.down.has('right')) x += 1;
    if (this.down.has('left')) x -= 1;
    const pad = this.pad();
    if (pad) {
      const ax = dead(pad.axes[0] ?? 0);
      const ay = dead(pad.axes[1] ?? 0);
      if (ax || ay) { x = ax; y = -ay; this.usingGamepad = true; }
    }
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y };
  }

  private pad(): Gamepad | null {
    if (this.gamepadIndex === null) return null;
    const pads = navigator.getGamepads?.();
    return pads?.[this.gamepadIndex] ?? null;
  }

  // Call once per rendered frame before reading pressed/released.
  pollGamepad(dt: number): void {
    const pad = this.pad();
    if (!pad) return;
    const now = new Set<Action>();
    const b = (i: number) => pad.buttons[i]?.pressed;
    if (b(0)) now.add('jump');
    if (b(2)) now.add('use');
    if (b(1)) now.add('throw');
    if (b(7) || b(5)) now.add('give');
    if (b(6) || b(4)) now.add('take');
    if (b(10)) now.add('sprint');
    if (b(9)) now.add('pause');
    if (b(3)) now.add('reset');
    if (b(8)) now.add('hint');
    for (const a of now) {
      if (!this.padPrev.has(a)) { this.edge(a); this.down.add(a); this.usingGamepad = true; }
    }
    for (const a of this.padPrev) {
      if (!now.has(a)) { this.released.add(a); this.down.delete(a); }
    }
    this.padPrev = now;
    const rx = dead(pad.axes[2] ?? 0);
    const ry = dead(pad.axes[3] ?? 0);
    if (rx || ry) {
      this.lookDX += rx * 900 * dt;
      this.lookDY += ry * 700 * dt;
      this.usingGamepad = true;
    }
  }

  consumeLook(): { dx: number; dy: number } {
    const r = { dx: this.lookDX * this.sensitivity, dy: this.lookDY * this.sensitivity * (this.invertY ? -1 : 1) };
    this.lookDX = 0;
    this.lookDY = 0;
    return r;
  }

  private edge(a: Action): void {
    this.pressed.add(a);
    this.framePressed.add(a);
  }

  // After a physics step has read the presses.
  endStep(): void {
    this.pressed.clear();
    this.released.clear();
  }

  // After every rendered frame.
  endFrame(): void {
    this.framePressed.clear();
  }

  clearPresses(): void {
    this.pressed.clear();
    this.framePressed.clear();
  }

  // --- test driving ---
  press(a: Action): void { if (!this.down.has(a)) this.edge(a); this.down.add(a); }
  release(a: Action): void { this.down.delete(a); this.released.add(a); }
}

function dead(v: number): number {
  return Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85;
}
