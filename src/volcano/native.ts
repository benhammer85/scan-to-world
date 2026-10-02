/**
 * What the game does differently inside the iPhone app (Capacitor; see capacitor.config.ts and
 * IOS.md): haptics by the phone's own engine rather than `navigator.vibrate` (which iOS ignores, so
 * on an iPhone in Safari nothing is felt at all), and a plate kept by the share sheet (to Photos,
 * Messages, anywhere) rather than a download. In a browser, everything is as it was.
 */
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export const NATIVE = Capacitor.isNativePlatform();

/**
 * A touch in the hand. The browser's pattern (buzz, pause, buzz… in ms) is played on the phone's
 * haptic engine: each buzz a tap, light, firm or heavy by its length, a long one a rumble.
 */
export function feel(pattern: number | number[]): void {
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
