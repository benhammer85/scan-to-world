/**
 * Quiet sound, by Web Audio, all made from a little noise and nothing recorded: the soft scratch of a
 * pen on paper while the line is drawn (louder as it moves, silent when it rests), the weather in the
 * habit drawing (rain's hiss, the wind's slow rise and fall), and a soft tick as a ring closes.
 *
 * Nothing plays until a touch has woken it (browsers ask that), and a mute in the settings silences
 * it all (`annulus.sound`, kept as the other settings are).
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let penGain: GainNode | null = null, penTone: BiquadFilterNode | null = null;
let rainGain: GainNode | null = null, windGain: GainNode | null = null, windTone: BiquadFilterNode | null = null;
let muted = (() => { try { return localStorage.getItem('annulus.sound') === 'off'; } catch { return false; } })();

/** Whether it's muted. */
export const soundOff = () => muted;

/** Mute or not (and remember it). */
export function setSound(on: boolean): void {
  muted = !on;
  try { localStorage.setItem('annulus.sound', on ? 'on' : 'off'); } catch { /* not remembered */ }
  if (ctx && master) master.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.1);
}

/** A loop of noise, coloured a little (each source starts it somewhere else, so they don't beat). */
function noiseOf(c: AudioContext, seconds = 2.3): AudioBuffer {
  const b = c.createBuffer(1, Math.round(c.sampleRate * seconds), c.sampleRate), d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) { last = 0.82 * last + 0.18 * (Math.random() * 2 - 1); d[i] = last * 2.6; }
  return b;
}

function source(c: AudioContext, buf: AudioBuffer): AudioBufferSourceNode {
  const s = c.createBufferSource();
  s.buffer = buf; s.loop = true;
  s.start(0, Math.random() * buf.duration);
  return s;
}

/** Wake the sound (on a touch: browsers won't play before one). */
export function wake(): void {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      const c = ctx, buf = noiseOf(c);
      master = c.createGain(); master.gain.value = muted ? 0 : 1; master.connect(c.destination);
      // The pen: a fine, high scratch, as a nib on laid paper.
      penTone = c.createBiquadFilter(); penTone.type = 'bandpass'; penTone.frequency.value = 3200; penTone.Q.value = 0.9;
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1400;
      penGain = c.createGain(); penGain.gain.value = 0;
      source(c, buf).connect(hp); hp.connect(penTone); penTone.connect(penGain); penGain.connect(master);
      // Rain: a soft, wide hiss.
      const rl = c.createBiquadFilter(); rl.type = 'lowpass'; rl.frequency.value = 2400;
      const rh = c.createBiquadFilter(); rh.type = 'highpass'; rh.frequency.value = 500;
      rainGain = c.createGain(); rainGain.gain.value = 0;
      source(c, buf).connect(rl); rl.connect(rh); rh.connect(rainGain); rainGain.connect(master);
      // Wind: a low band of noise that rises and falls, slowly.
      windTone = c.createBiquadFilter(); windTone.type = 'bandpass'; windTone.frequency.value = 380; windTone.Q.value = 1.4;
      windGain = c.createGain(); windGain.gain.value = 0;
      source(c, buf).connect(windTone); windTone.connect(windGain); windGain.connect(master);
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch { /* no sound, and that's all */ }
}

/** The pen on paper: `level` 0 (still, or lifted) to 1 (moving briskly). */
export function pen(level: number): void {
  if (!ctx || !penGain || !penTone) return;
  const l = Math.max(0, Math.min(1, level)), t = ctx.currentTime;
  penGain.gain.setTargetAtTime(0.05 * Math.sqrt(l), t, 0.06);
  penTone.frequency.setTargetAtTime(2600 + 1400 * l, t, 0.1);
}

/** The weather in the habit drawing: rain and wind, each 0 to 1. */
export function weather(rain: number, wind: number, time: number): void {
  if (!ctx || !rainGain || !windGain || !windTone) return;
  const t = ctx.currentTime, swell = 0.6 + 0.4 * Math.sin(time * 0.7) * Math.sin(time * 0.23 + 1);
  rainGain.gain.setTargetAtTime(0.06 * Math.max(0, Math.min(1, rain)), t, 0.6);
  windGain.gain.setTargetAtTime(0.09 * Math.max(0, Math.min(1, wind)) * swell, t, 0.4);
  windTone.frequency.setTargetAtTime(300 + 160 * swell, t, 0.4);
}

/** A soft tick: a ring closed. */
export function tick(): void {
  if (!ctx || !master) return;
  try {
    const c = ctx, t = c.currentTime, o = c.createOscillator(), e = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(1250, t); o.frequency.exponentialRampToValueAtTime(900, t + 0.09);
    e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(0.05, t + 0.006); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(e); e.connect(master);
    o.start(t); o.stop(t + 0.2);
  } catch { /* none */ }
}
