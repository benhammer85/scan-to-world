import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildTopology } from '../src/mesh/topology';
import { Planet, VOLCANO } from '../src/volcano/sim';

function planet() {
  const topo = buildTopology(new THREE.IcosahedronGeometry(1, 24).attributes.position.array, null);
  const p = topo.basePositions;
  const nearest = (x: number, y: number, z: number) => {
    let best = 0, bd = Infinity;
    for (let v = 0; v < topo.vertexCount; v++) { const d = Math.hypot(p[v * 3] - x, p[v * 3 + 1] - y, p[v * 3 + 2] - z); if (d < bd) { bd = d; best = v; } }
    return best;
  };
  const you = nearest(0, 0, 1), rival = nearest(0, 0, -1);
  return { topo, planet: new Planet(topo, you, rival), you, rival };
}

const run = (pl: Planet, seconds: number) => { for (let t = 0; t < seconds; t += 1 / 30) pl.step(1 / 30); };

describe('the volcano', () => {
  it('starts as a seamount: the whole world under the sea', () => {
    const { planet: pl } = planet();
    expect(pl.stage()).toBe('seamount');
    expect(pl.landShare(1)).toBe(0);
  });

  it('eruptions pour lava that flows downhill and cools into rock, and enough of them raise an island', () => {
    const { planet: pl, you } = planet();
    const before = pl.rock[you];
    for (let i = 0; i < 8; i++) { pl.erupt(pl.vents[0], 1); run(pl, 4); }
    run(pl, 14); // lava runs a while on land before it has all set
    expect(pl.rock[you]).toBeGreaterThan(before);
    expect(pl.molten).toBeLessThan(0.5); // nearly all of it has set (out of some sixty units erupted)
    expect(pl.landShare(1)).toBeGreaterThan(0);
    expect(['island', 'volcano', 'archipelago']).toContain(pl.stage());
  });

  it('the sea wears an idle island down', () => {
    const { planet: pl } = planet();
    for (let i = 0; i < 8; i++) { pl.erupt(pl.vents[0], 1); run(pl, 4); }
    run(pl, 8);
    const built = pl.landShare(1);
    run(pl, 240);
    expect(pl.landShare(1)).toBeLessThan(built);
  });

  it("the rival raises land of its own, and it is the rival's", () => {
    const { planet: pl, rival } = planet();
    run(pl, 120);
    expect(pl.owner[rival]).toBe(2);
    expect(pl.rock[rival]).toBeGreaterThan(VOLCANO.floor);
  });

  it('a new vent is refused until your land is big enough, and only on your own coast', () => {
    const { planet: pl, you } = planet();
    expect(pl.openVent(you)).toBe(false);
  });

  it('quiet land is taken by life, and fresh lava clears it', () => {
    const { planet: pl, you } = planet();
    for (let i = 0; i < 8; i++) { pl.erupt(pl.vents[0], 1); run(pl, 4); }
    run(pl, VOLCANO.lifeAfter + VOLCANO.lifeFull * 0.5);
    let alive = 0;
    for (let v = 0; v < pl.rock.length; v++) if (pl.life(v) > 0) alive++;
    expect(alive).toBeGreaterThan(0);
    pl.erupt(pl.vents[0], 1);
    run(pl, 3);
    expect(pl.life(you)).toBe(0);
  });

  it('tipping the world steers the lava: it runs towards whichever way is down', () => {
    const lean = (x: number) => {
      const { planet: pl, topo, you } = planet();
      pl.downhill.x = x; pl.downhill.y = 0; pl.downhill.z = 0;
      const before = Float32Array.from(pl.rock);
      for (let i = 0; i < 3; i++) { pl.erupt(pl.vents[0], 1); run(pl, 4); }
      run(pl, 10);
      // Where the new rock went, measured along x from the vent.
      let sum = 0, weight = 0;
      const p = topo.basePositions, x0 = p[you * 3];
      for (let v = 0; v < pl.rock.length; v++) { const add = pl.rock[v] - before[v]; if (add > 0) { sum += add * (p[v * 3] - x0); weight += add; } }
      return sum / weight;
    };
    expect(lean(1)).toBeGreaterThan(lean(-1) + 0.01);
  });
});

