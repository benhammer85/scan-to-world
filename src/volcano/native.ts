/**
 * What the game does differently inside the iPhone app (Capacitor; see capacitor.config.ts and
 * IOS.md): haptics by the phone's own engine rather than `navigator.vibrate` (which iOS ignores, so
 * on an iPhone in Safari nothing is felt at all), and a plate kept by the share sheet (to Photos,
 * Messages, anywhere) rather than a download. In a browser, everything is as it was.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export const NATIVE = Capacitor.isNativePlatform();

/**
 * A touch in the hand. The browser's pattern (buzz, pause, buzz… in ms) is played on the phone's
 * haptic engine: each buzz a tap, light, firm or heavy by its length, a long one a rumble.
 */
/** Whether the hand is to feel nothing (chosen in the settings). */
const unfelt = (): boolean => { try { return localStorage.getItem('volcano.haptics') === 'off'; } catch { return false; } };

export function feel(pattern: number | number[]): void {
  if (unfelt()) return;
  if (!NATIVE) {
    try { navigator.vibrate?.(pattern); } catch { /* none */ }
    return;
  }
  const steps = typeof pattern === 'number' ? [pattern] : pattern;
  let at = 0;
  steps.forEach((ms, i) => {
    if (i % 2 === 0) {
      const tap = () => {
        if (ms >= 60) void Haptics.vibrate({ duration: ms }).catch(() => {});
        else void Haptics.impact({ style: ms >= 30 ? ImpactStyle.Heavy : ms >= 18 ? ImpactStyle.Medium : ImpactStyle.Light }).catch(() => {});
      };
      if (at === 0) tap(); else setTimeout(tap, at);
    }
    at += ms;
  });
}

/**
 * The game's own haptics in the app (ios/App/App/WarmHaptics.swift, by Core Haptics): a continuous
 * rumble that can change as it plays, and taps of any strength and sharpness. Without it (in a
 * browser, or an app built before it), taps fall back to the plain Haptics plugin's three weights,
 * and the rumble to a run of light taps.
 */
const Warm = registerPlugin<{
  available(): Promise<{ value: boolean }>;
  rumble(o: { strength: number; grain?: number }): Promise<void>;
  tap(o: { strength: number; sharpness?: number }): Promise<void>;
}>('WarmHaptics');
let warm = false;
// (Asked rather than looked up: a plugin registered by the app itself may not be listed yet when this runs; if it isn't there at all, the call fails and the plain one is used.)
if (NATIVE) void Warm.available().then((r) => { warm = !!r?.value; }).catch(() => {});
/** Whether the rumble is truly continuous (else it's made of taps, by the caller). */
export const rumbles = () => warm;

/** One tap in the hand: light, firm or heavy, or a strength (0 to 1) and sharpness (0, a soft thump, to 1, a click). */
export function tap(weight: 'light' | 'medium' | 'heavy' | { strength: number; sharpness: number }): void {
  if (unfelt()) return;
  const o = typeof weight === 'object' ? weight : weight === 'heavy' ? { strength: 1, sharpness: 0.35 } : weight === 'medium' ? { strength: 0.6, sharpness: 0.45 } : { strength: 0.3, sharpness: 0.5 };
  if (warm) { void Warm.tap(o).catch(() => {}); return; }
  if (!NATIVE) { try { navigator.vibrate?.(o.strength > 0.8 ? 26 : o.strength > 0.45 ? 14 : 6); } catch { /* none */ } return; }
  void Haptics.impact({ style: o.strength > 0.8 ? ImpactStyle.Heavy : o.strength > 0.45 ? ImpactStyle.Medium : ImpactStyle.Light }).catch(() => {});
}

let rumbleSent = -1;
/** The rumble, on the phone's engine: strength 0 stops it. (Sent only when it changes enough to feel.) */
export function rumble(strength: number, grain = 0.3): void {
  if (!warm) return;
  if (unfelt()) strength = 0;
  const s = strength < 0.02 ? 0 : Math.round(strength * 25) / 25;
  if (s === rumbleSent) return;
  rumbleSent = s;
  void Warm.rumble({ strength: s, grain }).catch(() => {});
}

/** Keep a plate: in the app, by the share sheet; in a browser, as a download. */
export async function keepImage(canvas: HTMLCanvasElement, name: string): Promise<void> {
  if (!NATIVE) {
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `${name}.png`;
    a.click();
    return;
  }
  const data = canvas.toDataURL('image/png').split(',')[1];
  const file = await Filesystem.writeFile({ path: `${name}.png`, data, directory: Directory.Cache });
  await Share.share({ files: [file.uri] }).catch(() => { /* closed without sharing */ });
}
