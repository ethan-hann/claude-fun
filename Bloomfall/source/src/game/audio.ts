import * as THREE from 'three';

// Everything you hear is synthesized with WebAudio: wind, the Heartbloom's hum, distant groans of
// stretching metal, a slow generative score, and positional effects.

const SCALE = [0, 2, 3, 5, 7, 8, 10]; // natural minor
const CHORDS = [
  [0, 3, 7, 14], // i add9
  [-4, 0, 3, 10], // VI maj7
  [-2, 2, 5, 9], // VII
  [-5, -1, 2, 7], // v
  [-4, 0, 3, 7], // VI
  [-7, -3, 0, 5], // iv
];

export class Audio {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private musicBus!: GainNode;
  private ambBus!: GainNode;
  private reverb!: ConvolverNode;
  private reverbSend!: GainNode;
  private noiseBuf!: AudioBuffer;
  private windGain!: GainNode;
  private windFilter!: BiquadFilterNode;
  private humGain!: GainNode;
  private humOsc: OscillatorNode[] = [];
  private roomGain!: GainNode;
  private chordIdx = 0;
  private nextChord = 0;
  private nextBell = 0;
  private nextGroan = 8;
  private padVoices: { osc: OscillatorNode[]; gain: GainNode }[] = [];
  volume = 0.8;
  musicVolume = 0.6;
  intensity = 0; // 0 calm .. 1 finale
  interior = 0; // 0 outside .. 1 inside
  heartProximity = 0;
  private listener = new THREE.Vector3();
  private listenerFwd = new THREE.Vector3(0, 0, -1);
  private time = 0;
  private started = false;
  private root = 50; // MIDI root (D3)

  start(): void {
    if (this.started) { this.ctx?.resume(); return; }
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.started = true;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.3;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicVolume * 0.55;
    this.musicBus.connect(this.master);
    this.ambBus = ctx.createGain();
    this.ambBus.gain.value = 0.9;
    this.ambBus.connect(this.master);
    // reverb
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(3.4, 2.6);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.9;
    this.reverbSend.connect(this.reverb).connect(this.master);
    // noise
    const len = ctx.sampleRate * 3;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + w * 0.029591;
      b1 = 0.985 * b1 + w * 0.032534;
      b2 = 0.95 * b2 + w * 0.048056;
      d[i] = (b0 + b1 + b2 + w * 0.02) * 1.6;
    }
    this.buildAmbience();
    this.buildPads();
  }

  private impulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
    }
    return buf;
  }

  private noise(loop = true): AudioBufferSourceNode {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = loop;
    s.loopStart = Math.random() * 2;
    return s;
  }

  private buildAmbience(): void {
    const ctx = this.ctx!;
    // wind: two noise layers, band-passed, slowly swirling
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.0;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 420;
    this.windFilter.Q.value = 0.7;
    for (let i = 0; i < 2; i++) {
      const n = this.noise();
      const pan = ctx.createStereoPanner();
      pan.pan.value = i === 0 ? -0.6 : 0.6;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 900 + i * 400;
      n.connect(f).connect(pan).connect(this.windFilter);
      n.start();
    }
    this.windFilter.connect(this.windGain).connect(this.ambBus);
    // the Heartbloom's hum: low, beating
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0.0;
    const humF = ctx.createBiquadFilter();
    humF.type = 'lowpass';
    humF.frequency.value = 180;
    for (const f of [36.7, 37.1, 55.0, 73.4]) {
      const o = ctx.createOscillator();
      o.type = f > 60 ? 'sine' : 'sawtooth';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = f > 60 ? 0.12 : 0.22;
      o.connect(g).connect(humF);
      o.start();
      this.humOsc.push(o);
    }
    humF.connect(this.humGain).connect(this.ambBus);
    // interior room tone
    this.roomGain = ctx.createGain();
    this.roomGain.gain.value = 0;
    const rn = this.noise();
    const rf = ctx.createBiquadFilter();
    rf.type = 'lowpass';
    rf.frequency.value = 160;
    rn.connect(rf).connect(this.roomGain).connect(this.ambBus);
    rn.start();
  }

  private buildPads(): void {
    const ctx = this.ctx!;
    for (let v = 0; v < 4; v++) {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 700;
      filt.Q.value = 0.4;
      const oscs: OscillatorNode[] = [];
      for (const det of [-7, 0, 6]) {
        const o = ctx.createOscillator();
        o.type = det === 0 ? 'triangle' : 'sawtooth';
        o.detune.value = det;
        const g = ctx.createGain();
        g.gain.value = det === 0 ? 0.5 : 0.18;
        o.connect(g).connect(filt);
        o.start();
        oscs.push(o);
      }
      filt.connect(gain);
      gain.connect(this.musicBus);
      gain.connect(this.reverbSend);
      this.padVoices.push({ osc: oscs, gain });
    }
  }

  private midi(n: number): number { return 440 * Math.pow(2, (n - 69) / 12); }

  setVolumes(volume: number, music: number): void {
    this.volume = volume;
    this.musicVolume = music;
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.1);
    this.musicBus.gain.setTargetAtTime(music * 0.55, this.ctx.currentTime, 0.1);
  }

  setListener(pos: THREE.Vector3, fwd: THREE.Vector3): void {
    this.listener.copy(pos);
    this.listenerFwd.copy(fwd);
  }

  // Position-dependent gain and pan for a world point.
  private spatial(p: THREE.Vector3 | null, range = 30): { gain: number; pan: number } {
    if (!p) return { gain: 1, pan: 0 };
    const d = p.clone().sub(this.listener);
    const dist = d.length();
    const gain = 1 / (1 + (dist / (range * 0.25)) ** 2);
    const right = new THREE.Vector3().crossVectors(this.listenerFwd, new THREE.Vector3(0, 1, 0)).normalize();
    const pan = dist > 0.01 ? THREE.MathUtils.clamp(d.normalize().dot(right), -1, 1) * 0.8 : 0;
    return { gain, pan };
  }

  private out(p: THREE.Vector3 | null, range = 30, rev = 0.3): { node: AudioNode; gain: number } {
    const ctx = this.ctx!;
    const { gain, pan } = this.spatial(p, range);
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    panner.connect(this.sfx);
    if (rev > 0) {
      const s = ctx.createGain();
      s.gain.value = rev;
      panner.connect(s).connect(this.reverbSend);
    }
    return { node: panner, gain };
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, p: THREE.Vector3 | null, opts: { attack?: number; slideTo?: number; rev?: number; delay?: number; filter?: number } = {}): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + (opts.delay ?? 0);
    const { node, gain } = this.out(p, 30, opts.rev ?? 0.35);
    if (gain < 0.003) return;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (opts.slideTo) o.frequency.exponentialRampToValueAtTime(opts.slideTo, t + dur);
    const g = ctx.createGain();
    const a = opts.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol * gain, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let last: AudioNode = o;
    if (opts.filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = opts.filter;
      o.connect(f);
      last = f;
    }
    last.connect(g).connect(node);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private bell(freq: number, dur: number, vol: number, p: THREE.Vector3 | null, delay = 0, bus?: AudioNode): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const target = bus ?? this.out(p, 40, 0.6).node;
    const gainScale = bus ? 1 : this.spatial(p, 40).gain;
    const car = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const modG = ctx.createGain();
    car.frequency.value = freq;
    mod.frequency.value = freq * 3.5;
    modG.gain.setValueAtTime(freq * 2.2, t);
    modG.gain.exponentialRampToValueAtTime(freq * 0.05, t + dur * 0.6);
    mod.connect(modG).connect(car.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol * gainScale, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    car.connect(g).connect(target);
    if (bus) g.connect(this.reverbSend);
    car.start(t); mod.start(t);
    car.stop(t + dur + 0.05); mod.stop(t + dur + 0.05);
  }

  private noiseBurst(dur: number, vol: number, p: THREE.Vector3 | null, f0: number, f1: number, type: BiquadFilterType = 'bandpass', q = 1, delay = 0, rev = 0.25): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const { node, gain } = this.out(p, 35, rev);
    if (gain < 0.003) return;
    const n = this.noise(false);
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol * gain, t + Math.min(0.02, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f).connect(g).connect(node);
    n.start(t, Math.random() * 2);
    n.stop(t + dur + 0.05);
  }

  // ------------------------------------------------------------------ game sounds
  footstep(p: THREE.Vector3, surface = 'stone', run = false): void {
    const v = run ? 0.16 : 0.11;
    const f = surface === 'metal' ? 2400 : 1300;
    this.noiseBurst(0.09, v, p, f * (0.9 + Math.random() * 0.25), f * 0.4, 'lowpass', 0.7, 0, 0.1);
    this.tone(90 + Math.random() * 30, 0.08, 'sine', v * 0.8, p, { rev: 0.05 });
  }

  land(p: THREE.Vector3, speed: number): void {
    const v = Math.min(0.5, 0.08 + speed * 0.025);
    this.noiseBurst(0.18, v, p, 900, 120, 'lowpass', 0.6, 0, 0.15);
    this.tone(70, 0.22, 'sine', v, p, { slideTo: 45, rev: 0.1 });
  }

  jump(p: THREE.Vector3): void {
    this.noiseBurst(0.08, 0.05, p, 1400, 700, 'bandpass', 0.8, 0, 0.05);
  }

  give(p: THREE.Vector3, size = 1): void {
    const base = this.midi(this.root + 12 + (2 - Math.min(2, size)) * 5);
    [0, 4, 7, 12].forEach((s, i) => this.bell(base * Math.pow(2, s / 12), 1.4, 0.07, p, i * 0.05));
    this.noiseBurst(0.6, 0.12, p, 300, 3200, 'bandpass', 2.5, 0, 0.5);
    this.tone(base / 4, 0.7, 'sine', 0.16, p, { slideTo: base / 2, attack: 0.08, rev: 0.3 });
  }

  take(p: THREE.Vector3, size = 1): void {
    const base = this.midi(this.root + 12 + (2 - Math.min(2, size)) * 5);
    [12, 7, 4, 0].forEach((s, i) => this.bell(base * Math.pow(2, s / 12), 1.1, 0.06, p, i * 0.05));
    this.noiseBurst(0.55, 0.12, p, 3200, 250, 'bandpass', 2.5, 0, 0.5);
    this.tone(base / 2, 0.6, 'sine', 0.14, p, { slideTo: base / 4, attack: 0.05, rev: 0.3 });
  }

  fail(): void {
    this.tone(180, 0.07, 'square', 0.05, null, { filter: 900, rev: 0.05 });
    this.tone(140, 0.09, 'square', 0.05, null, { filter: 900, delay: 0.08, rev: 0.05 });
  }

  grab(p: THREE.Vector3): void {
    this.tone(220, 0.25, 'sine', 0.08, p, { slideTo: 330, rev: 0.2 });
    this.noiseBurst(0.12, 0.05, p, 2000, 800, 'bandpass', 2, 0, 0.1);
  }

  drop(p: THREE.Vector3): void {
    this.tone(330, 0.2, 'sine', 0.06, p, { slideTo: 200, rev: 0.2 });
  }

  impact(p: THREE.Vector3, size: number, force: number): void {
    const v = Math.min(0.55, force * 0.02 + 0.02);
    if (v < 0.03) return;
    const low = 140 / (0.6 + size);
    this.tone(low, 0.25 + size * 0.12, 'sine', v, p, { slideTo: low * 0.6, rev: 0.2 });
    this.noiseBurst(0.12 + size * 0.05, v * 0.7, p, 1800 / (0.5 + size), 200, 'lowpass', 0.8, 0, 0.2);
    this.tone(low * 5.1, 0.35, 'triangle', v * 0.12, p, { rev: 0.4 });
  }

  plate(p: THREE.Vector3, on: boolean): void {
    this.tone(on ? 520 : 300, 0.12, 'triangle', 0.08, p, { rev: 0.2 });
    if (on) this.bell(this.midi(this.root + 24), 1.2, 0.07, p, 0.06);
  }

  notch(p: THREE.Vector3): void {
    this.tone(880, 0.06, 'triangle', 0.03, p, { rev: 0.1 });
  }

  doorMove(p: THREE.Vector3, dur: number): void {
    this.noiseBurst(dur, 0.18, p, 220, 160, 'lowpass', 0.7, 0, 0.35);
    this.tone(48, dur, 'sawtooth', 0.08, p, { filter: 160, attack: 0.2, rev: 0.3 });
  }

  doorStop(p: THREE.Vector3): void {
    this.tone(60, 0.4, 'sine', 0.25, p, { slideTo: 40, rev: 0.4 });
    this.noiseBurst(0.25, 0.15, p, 700, 100, 'lowpass', 0.7, 0, 0.3);
  }

  growHum(p: THREE.Vector3, up: boolean, dur = 0.5): void {
    const a = up ? 90 : 180;
    this.tone(a, dur, 'sawtooth', 0.06, p, { slideTo: up ? 180 : 90, filter: 600, attack: 0.05, rev: 0.25 });
  }

  bridgeSegment(p: THREE.Vector3, i: number): void {
    const deg = SCALE[i % SCALE.length] + 12 * Math.floor(i / SCALE.length) % 24;
    this.bell(this.midi(this.root + 12 + deg), 2.2, 0.06, p);
    this.noiseBurst(0.3, 0.04, p, 600, 2400, 'bandpass', 3, 0, 0.4);
  }

  pickup(): void {
    const chord = [0, 7, 12, 15, 19, 24];
    chord.forEach((s, i) => this.bell(this.midi(this.root + 12 + s), 3, 0.06, null, i * 0.09, this.musicBus));
  }

  memory(): void {
    [0, 3, 7, 10, 14].forEach((s, i) => this.bell(this.midi(this.root + 24 + s), 3.5, 0.045, null, i * 0.18, this.musicBus));
  }

  rumble(p: THREE.Vector3 | null, dur: number, vol = 0.5): void {
    this.noiseBurst(dur, vol, p, 180, 40, 'lowpass', 0.8, 0, 0.5);
    this.tone(34, dur, 'sine', vol * 0.8, p, { attack: 0.4, rev: 0.4, slideTo: 28 });
    for (let i = 0; i < 6; i++) this.noiseBurst(0.15, vol * 0.4, p, 2500, 600, 'bandpass', 1.5, Math.random() * dur * 0.7, 0.4);
  }

  groan(p: THREE.Vector3 | null): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const f0 = 60 + Math.random() * 80;
    const dur = 2 + Math.random() * 2.5;
    const { node, gain } = this.out(p, 400, 0.9);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const t = ctx.currentTime;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(f0 * (0.7 + Math.random() * 0.6), t + dur);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 9;
    f.frequency.setValueAtTime(f0 * 3, t);
    f.frequency.linearRampToValueAtTime(f0 * 5, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05 * gain + 0.01, t + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(node);
    o.start(t);
    o.stop(t + dur + 0.1);
  }

  ui(): void { this.tone(660, 0.05, 'triangle', 0.04, null, { rev: 0 }); }

  swell(): void {
    this.intensity = Math.min(1, this.intensity + 0.3);
  }

  // Called every frame.
  update(dt: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.time += dt;
    const t = ctx.currentTime;
    const wind = 0.16 + 0.08 * Math.sin(this.time * 0.23) + 0.05 * Math.sin(this.time * 0.61);
    this.windGain.gain.setTargetAtTime(wind * (1 - this.interior * 0.8), t, 0.5);
    this.windFilter.frequency.setTargetAtTime(380 + 180 * Math.sin(this.time * 0.17) + 90 * Math.sin(this.time * 0.43), t, 0.5);
    this.humGain.gain.setTargetAtTime(0.03 + this.heartProximity * 0.3 + this.intensity * 0.1, t, 1.0);
    this.roomGain.gain.setTargetAtTime(this.interior * 0.12, t, 0.5);
    // chords
    this.nextChord -= dt;
    if (this.nextChord <= 0) {
      this.nextChord = 9 - this.intensity * 3;
      const chord = CHORDS[this.chordIdx % CHORDS.length];
      this.chordIdx += Math.random() < 0.7 ? 1 : 2;
      this.padVoices.forEach((v, i) => {
        const n = this.root + chord[i % chord.length] + (i === 0 ? -12 : 0);
        const f = this.midi(n);
        v.osc.forEach((o) => o.frequency.setTargetAtTime(f, t, 0.8));
        const level = (0.05 + this.intensity * 0.05) * (i === 0 ? 1.2 : 0.8);
        v.gain.gain.setTargetAtTime(level, t, 2.5);
      });
    }
    // sparse bells from the scale
    this.nextBell -= dt;
    if (this.nextBell <= 0) {
      this.nextBell = 2.5 + Math.random() * 5 - this.intensity * 1.5;
      const chord = CHORDS[(this.chordIdx - 1 + CHORDS.length) % CHORDS.length];
      const n = this.root + 24 + chord[Math.floor(Math.random() * chord.length)] + (Math.random() < 0.3 ? 12 : 0);
      this.bell(this.midi(n), 3.5, 0.035 + this.intensity * 0.02, null, 0, this.musicBus);
    }
    // the city stretching
    this.nextGroan -= dt;
    if (this.nextGroan <= 0) {
      this.nextGroan = 12 + Math.random() * 18;
      const a = Math.random() * Math.PI * 2;
      this.groan(this.listener.clone().add(new THREE.Vector3(Math.cos(a) * 120, -20, Math.sin(a) * 120)));
    }
    this.intensity = Math.max(0, this.intensity - dt * 0.01);
  }
}
