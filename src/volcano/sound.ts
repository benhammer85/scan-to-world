/**
 * Sound, made as it plays rather than from recordings: a low drone that is the
 * heat, rising and brightening as the pressure gathers and trembling when it's
 * nearly too much; the surf, as loud as the sea is working at the coasts; a
 * rumble for a burst and a hiss for a flow; and a soft chime when life takes a
 * new kind of ground or a wish is kept. Nothing plays until the first touch,
 * as browsers require.
 */
export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private droneGain!: GainNode;
  private droneFilter!: BiquadFilterNode;
  private droneA!: OscillatorNode;
  private droneB!: OscillatorNode;
  private tremolo!: GainNode;
  private surfGain!: GainNode;
  private noise!: AudioBuffer;
  on = true;

  /** Start, on the first touch. Safe to call again. */
  start(): void {
    if (this.ctx) { void this.ctx.resume(); return; }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.on ? 0.8 : 0;
    this.master.connect(ctx.destination);

    // The noise everything breathy is made from: a few seconds of it, looped.
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < d.length; i++) { brown = (brown + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = brown * 3.5; }

    // The drone: two low tones a fifth apart, through a filter that opens with the pressure.
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 220;
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0;
    this.tremolo = ctx.createGain();
    this.tremolo.gain.value = 1;
    this.droneA = ctx.createOscillator(); this.droneA.type = 'sine'; this.droneA.frequency.value = 55;
    this.droneB = ctx.createOscillator(); this.droneB.type = 'triangle'; this.droneB.frequency.value = 82.6;
    const bGain = ctx.createGain(); bGain.gain.value = 0.35;
    this.droneA.connect(this.droneFilter); this.droneB.connect(bGain).connect(this.droneFilter);
    this.droneFilter.connect(this.tremolo).connect(this.droneGain).connect(this.master);
    this.droneA.start(); this.droneB.start();

    // The surf: noise through a band, swelling slowly as waves do.
    const surf = ctx.createBufferSource(); surf.buffer = this.noise; surf.loop = true;
    const band = ctx.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = 600; band.Q.value = 0.6;
    const swell = ctx.createGain(); swell.gain.value = 0.6;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.11;
    const lfoDepth = ctx.createGain(); lfoDepth.gain.value = 0.4;
    lfo.connect(lfoDepth).connect(swell.gain);
    this.surfGain = ctx.createGain(); this.surfGain.gain.value = 0;
    surf.connect(band).connect(swell).connect(this.surfGain).connect(this.master);
    surf.start(); lfo.start();
  }

  toggle(): boolean {
    this.on = !this.on;
    if (this.ctx) this.master.gain.setTargetAtTime(this.on ? 0.8 : 0, this.ctx.currentTime, 0.1);
    return this.on;
  }

  /** Every frame or so: how full the pressure is (0 to 1), how hard the sea is working (0 to 1), whether the fire is out. */
  set(pressure: number, surf: number, out: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.droneGain.gain.setTargetAtTime(out ? 0 : 0.05 + 0.1 * pressure, t, 0.4);
    this.droneFilter.frequency.setTargetAtTime(160 + 900 * pressure * pressure, t, 0.3);
    this.droneA.frequency.setTargetAtTime(55 + 6 * pressure, t, 0.5);
    this.droneB.frequency.setTargetAtTime(82.6 + 9 * pressure, t, 0.5);
    // Nearly too much: it trembles.
    const shake = pressure > 0.85 ? 0.25 + 0.2 * Math.sin(t * 38) : 0;
    this.tremolo.gain.setTargetAtTime(1 - shake, t, 0.02);
    this.surfGain.gain.setTargetAtTime(0.02 + 0.12 * Math.min(1, surf), t, 0.8);
  }

  /** A burst (strength 0 to 1, more for the mountain tearing open): a low rumble and a thump. */
  burst(strength: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const low = ctx.createBiquadFilter(); low.type = 'lowpass'; low.frequency.setValueAtTime(500, t); low.frequency.exponentialRampToValueAtTime(90, t + 3);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5 * strength, t + 0.05); g.gain.exponentialRampToValueAtTime(0.001, t + 3.5);
    src.connect(low).connect(g).connect(this.master);
    src.start(t); src.stop(t + 3.6);
    const thump = ctx.createOscillator(); thump.frequency.setValueAtTime(70, t); thump.frequency.exponentialRampToValueAtTime(32, t + 0.8);
    const tg = ctx.createGain(); tg.gain.setValueAtTime(0.35 * strength, t); tg.gain.exponentialRampToValueAtTime(0.001, t + 1);
    thump.connect(tg).connect(this.master);
    thump.start(t); thump.stop(t + 1.1);
  }

  /** A gentle flow: a soft hiss, as lava meets water. */
  flow(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const high = ctx.createBiquadFilter(); high.type = 'highpass'; high.frequency.value = 1800;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 0.2); g.gain.exponentialRampToValueAtTime(0.001, t + 2);
    src.connect(high).connect(g).connect(this.master);
    src.start(t, Math.random()); src.stop(t + 2.1);
  }

  /** A chime: two soft bell tones. Higher and brighter for something gained, lower for a warning. */
  chime(kind: 'gain' | 'warn' = 'gain'): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const scale = kind === 'gain' ? [523.3, 587.3, 659.3, 784, 880] : [196, 220];
    const root = scale[Math.floor(Math.random() * scale.length)];
    [root, root * 1.5].forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = ctx.createGain(); const at = t + i * 0.12;
      g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(kind === 'gain' ? 0.06 : 0.08, at + 0.01); g.gain.exponentialRampToValueAtTime(0.0005, at + 2.4);
      o.connect(g).connect(this.master);
      o.start(at); o.stop(at + 2.5);
    });
  }
}
