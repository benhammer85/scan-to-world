import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PlotterLines, defaultPlotterStyle, lineKey } from '../src/render/plotterLines';
import type { Polyline } from '../src/terrain/contours';

/** A short line lying on the unit sphere round the direction (x, y, z). */
function mark(x: number, y: number, z: number): Polyline {
  const d = new THREE.Vector3(x, y, z).normalize(), e = new THREE.Vector3(0, 1, 0).cross(d).normalize().multiplyScalar(0.02);
  const a = d.clone().sub(e), b = d.clone().add(e);
  return { points: new Float32Array([a.x, a.y, a.z, b.x, b.y, b.z]), closed: false, level: 0, length: 0.04 } as Polyline;
}

function eyeAt(x: number, y: number, z: number): THREE.PerspectiveCamera {
  const c = new THREE.PerspectiveCamera();
  c.position.set(x, y, z);
  c.lookAt(0, 0, 0);
  c.updateMatrixWorld();
  return c;
}

describe('fading ink', () => {
  const style = { ...defaultPlotterStyle, holdSeconds: 10, fadeSeconds: 20 };
  const front = mark(0, 0, 1), back = mark(0, 0, -1);
  const run = (pen: PlotterLines, seconds: number, camera: THREE.Camera) => { for (let t = 0; t < seconds; t += 0.25) pen.update(0.25, camera); };

  it('ink you are looking at keeps; ink out of sight fades to pencil, and no further', () => {
    const pen = new PlotterLines(style);
    pen.setLines([front, back], 'settle');
    run(pen, 60, eyeAt(0, 0, 4));
    expect(pen.fadeOf(lineKey(front))).toBe(0);
    expect(pen.fadeOf(lineKey(back))).toBe(1);
  });

  it('holds a while before it fades, and fades gradually', () => {
    const pen = new PlotterLines(style);
    pen.setLines([front, back], 'settle');
    run(pen, 8, eyeAt(0, 0, 4));
    expect(pen.fadeOf(lineKey(back))).toBe(0);
    run(pen, 12, eyeAt(0, 0, 4));
    const mid = pen.fadeOf(lineKey(back));
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });

  it('turned back into view, faded ink is inked again by the pen, and is fresh once it is', () => {
    const pen = new PlotterLines(style);
    pen.setLines([front, back], 'settle');
    run(pen, 60, eyeAt(0, 0, 4));
    expect(pen.reinkFaded()).toBe(false); // the faded line is round the back: nothing to do yet
    run(pen, 0.5, eyeAt(0, 0, -4));
    expect(pen.reinkFaded()).toBe(true);
    expect(pen.animating).toBe(true);
    run(pen, 30, eyeAt(0, 0, -4));
    expect(pen.animating).toBe(false);
    expect(pen.isInked(lineKey(back))).toBe(true);
    expect(pen.fadeOf(lineKey(back))).toBe(0);
  });

  it('with fading off, nothing fades', () => {
    const pen = new PlotterLines({ ...style, fadeSeconds: 0 });
    pen.setLines([front, back], 'settle');
    run(pen, 60, eyeAt(0, 0, 4));
    expect(pen.fadeOf(lineKey(back))).toBe(0);
  });
});
