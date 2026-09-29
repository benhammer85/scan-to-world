import { describe, expect, it } from 'vitest';
import { GESTURE, GestureRecognizer, type GestureSink } from '../src/interact/gestures';

function recorder(onObject = true) {
  const log: string[] = [];
  const sink: GestureSink = {
    spin: () => log.push('spin'),
    fling: (vx) => log.push(vx === 0 ? 'stop' : 'fling'),
    zoom: (f) => log.push(f > 1 ? 'closer' : 'further'),
    grab: () => log.push('grab'),
    press: () => log.push('press'),
    pull: (px) => log.push(`pull:${Math.round(px)}`),
    release: () => log.push('release'),
    drawer: () => log.push('drawer'),
  };
  const g = new GestureRecognizer(sink, () => onObject);
  // Collapse repeats so assertions read as a sequence of intents.
  const seq = () => log.filter((v, i) => v !== log[i - 1] || v.startsWith('pull'));
  return { g, log, seq };
}

/** Advance time in frames, as the render loop would. */
function hold(g: GestureRecognizer, from: number, ms: number): number {
  for (let t = from; t <= from + ms; t += 16) g.tick(t, 0.016);
  return from + ms;
}

describe('gestures', () => {
  it('a quick drag turns the world and flings it', () => {
    const { g, seq } = recorder();
    g.down(1, 100, 100, 0);
    g.move(1, 130, 100, 30);
    g.move(1, 170, 100, 60);
    g.up(1, 170, 100, 70);
    expect(seq()).toEqual(['spin', 'fling']);
  });

  it('holding still on the object takes hold, then presses in', () => {
    const { g, seq } = recorder();
    g.down(1, 100, 100, 0);
    const t = hold(g, 0, GESTURE.holdMs + GESTURE.pressDelayMs + 100);
    g.up(1, 100, 100, t);
    expect(seq()).toEqual(['grab', 'press', 'release']);
  });

  it('a hold that moves becomes a pull, never a spin, and never dents first', () => {
    const { g, seq } = recorder();
    g.down(1, 100, 100, 0);
    let t = hold(g, 0, GESTURE.holdMs + 20);
    g.move(1, 100, 80, t);
    g.move(1, 100, 40, t + 16);
    t = hold(g, t + 16, 400); // pulling: still time passing must not press in
    g.move(1, 100, 70, t);    // back down again: the pull is elastic
    g.up(1, 100, 70, t + 10);
    expect(seq()).toEqual(['grab', 'pull:20', 'pull:60', 'pull:30', 'release']);
  });

  it('holding off the object does nothing until it moves', () => {
    const { g, seq } = recorder(false);
    g.down(1, 100, 100, 0);
    const t = hold(g, 0, 1000);
    g.move(1, 140, 100, t);
    g.up(1, 140, 100, t + 500);
    expect(seq()).toEqual(['spin', 'stop']);
  });

  it('a second finger lets go of the ground and pinches', () => {
    const { g, seq } = recorder();
    g.down(1, 100, 100, 0);
    const t = hold(g, 0, GESTURE.holdMs + 20);
    g.down(2, 200, 100, t);
    g.move(2, 260, 100, t + 16);
    g.up(2, 260, 100, t + 40);
    g.move(1, 150, 150, t + 60); // the remaining finger must not start a spin
    g.up(1, 150, 150, t + 80);
    expect(seq()).toEqual(['grab', 'release', 'closer']);
  });

  it('three fingers held still open the drawer, once', () => {
    const { g, seq } = recorder();
    g.down(1, 100, 100, 0); g.down(2, 150, 100, 5); g.down(3, 200, 100, 10);
    const t = hold(g, 10, GESTURE.drawerMs * 2);
    [1, 2, 3].forEach((id) => g.up(id, 0, 0, t));
    expect(seq()).toEqual(['drawer']);
  });
});
