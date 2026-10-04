import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildTopology } from '../src/mesh/topology';
import { Planet } from '../src/volcano/sim';
import { Chain, CHAIN } from '../src/volcano/chain';
import { WORLDS, worldOf, nextWorld } from '../src/volcano/worlds';

const topo = buildTopology(new THREE.IcosahedronGeometry(1, 24).attributes.position.array, null);
const p = topo.basePositions;
const nearest = (x: number, y: number, z: number) => {
  let best = 0, bd = Infinity;
  for (let v = 0; v < topo.vertexCount; v++) { const d = Math.hypot(p[v * 3] - x, p[v * 3 + 1] - y, p[v * 3 + 2] - z); if (d < bd) { bd = d; best = v; } }
  return best;
};
const run = (pl: Planet, seconds: number) => { for (let t = 0; t < seconds; t += 1 / 20) pl.step(1 / 20); };

describe('the worlds', () => {
  it('come one after another, and each has its own aim', () => {
    expect(WORLDS.map((w) => w.id)).toEqual(['mars', 'moon', 'ice', 'asteroid', 'ocean', 'young', 'io', 'enceladus', 'tumble', 'spin', 'deep', 'lamp']);
    expect(worldOf('moon').goal).toBe('basins');
    expect(worldOf('nowhere').id).toBe('mars');
    expect(nextWorld(worldOf('mars'))!.id).toBe('moon');
    expect(nextWorld(worldOf('moon'))!.id).toBe('ice');
    expect(nextWorld(worldOf('ice'))!.id).toBe('asteroid');
    expect(nextWorld(worldOf('asteroid'))!.id).toBe('ocean');
    expect(nextWorld(worldOf('ocean'))!.id).toBe('young');
    expect(nextWorld(worldOf('young'))!.id).toBe('io');
    expect(nextWorld(worldOf('io'))!.id).toBe('enceladus');
    expect(nextWorld(worldOf('enceladus'))!.id).toBe('tumble');
    expect(nextWorld(worldOf('tumble'))!.id).toBe('spin');
    expect(nextWorld(worldOf('spin'))!.id).toBe('deep');
    expect(nextWorld(worldOf('deep'))!.id).toBe('lamp');
    expect(nextWorld(worldOf('lamp'))).toBe(null);
  });
});

describe('the ocean world', () => {
  it('carries the heat steadily round the world, one way', () => {
    const pl = new Planet(topo, nearest(0, 0, 1), 3, worldOf('ocean').rules);
    const chain = new Chain(pl.plume, pl.driftDirection);
    const at = (): number => chain.where(pl.plume).round;
    run(pl, 60);
    const a = at();
    run(pl, 60);
    expect(at()).toBeGreaterThan(a);
    expect(chain.where(pl.plume).off).toBeLessThan(0.02); // it keeps to the way
  });

  it('a stretch is held by life on or by the way, and the world is ringed when all are', () => {
    const pl = new Planet(topo, nearest(0, 0, 1), 3, worldOf('ocean').rules);
    const chain = new Chain(pl.plume, pl.driftDirection);
    expect(chain.update(pl, topo)).toBe(0);
    // Life all along the way.
    for (let v = 0; v < topo.vertexCount; v++) {
      if (chain.where({ x: p[v * 3], y: p[v * 3 + 1], z: p[v * 3 + 2] }).off < 0.05) { pl.life[v] = 1; pl.rock[v] = 0.05; }
    }
    expect(chain.update(pl, topo)).toBe(CHAIN.stretches);
    expect(chain.ringed).toBe(true);
    // One stretch lost, and it isn't.
    for (let v = 0; v < topo.vertexCount; v++) if (chain.where({ x: p[v * 3], y: p[v * 3 + 1], z: p[v * 3 + 2] }).round < 1 / CHAIN.stretches) pl.life[v] = 0;
    chain.update(pl, topo);
    expect(chain.ringed).toBe(false);
  });
});

describe('the Moon', () => {
  const moon = () => new Planet(topo, nearest(0, 0, 1), 5, worldOf('moon').rules);

  it('is dry highland scarred by great basins, with no life', () => {
    const pl = moon();
    expect(pl.basins.length).toBe(4);
    expect(Math.min(...pl.rock)).toBeGreaterThan(0); // no sea anywhere
    run(pl, 120);
    expect(pl.lifeShare()).toBe(0);
  });

  it('floods the basin its lava is poured into', () => {
    const pl = moon(), b = pl.basins[0];
    expect(pl.flooded(b)).toBe(0);
    for (let t = 0; t < 240; t += 1 / 20) {
      pl.callTo(b.x, b.y, b.z);
      pl.step(1 / 20);
      if (Math.round(t * 20) % 50 === 0) pl.erupt();
    }
    expect(pl.flooded(b)).toBeGreaterThan(0.5);
  });
});

describe('Mars', () => {
  const mars = () => new Planet(topo, nearest(0, 0, 1), 5, worldOf('mars').rules);

  it('keeps its heat in one place, and the mountain rises over it', () => {
    const pl = mars(), start = { ...pl.plume };
    const low = pl.summit;
    for (let t = 0; t < 120; t += 1 / 20) { pl.step(1 / 20); if (Math.round(t * 20) % 60 === 0) pl.erupt(); }
    expect(pl.plume.x).toBeCloseTo(start.x, 6);
    expect(pl.plume.y).toBeCloseTo(start.y, 6);
    expect(pl.plume.z).toBeCloseTo(start.z, 6);
    expect(pl.summit).toBeGreaterThan(low + 0.1);
  });

  it('dust storms come, seen rising first, and wear the heights while they blow', () => {
    // Two worlds alike in everything but the storms' wear: the one the storms wear ends lower.
    const worn = mars(), calm = new Planet(topo, nearest(0, 0, 1), 5, { ...worldOf('mars').rules, stormWear: 0 });
    let warned = false, blew = false;
    for (let t = 0; t < 260; t += 1 / 20) {
      for (const pl of [worn, calm]) { pl.step(1 / 20); if (Math.round(t * 20) % 60 === 0) pl.erupt(); }
      if (worn.stormComing !== null) warned = true;
      if (worn.storm) blew = true;
      if (blew && !worn.storm) break;
    }
    expect(warned).toBe(true);
    expect(blew).toBe(true);
    expect(worn.summit).toBeLessThan(calm.summit);
  });
});

describe('an ice moon', () => {
  const ice = (ground?: Float32Array) => new Planet(topo, nearest(0, 0, 1), 5, worldOf('ice').rules, ground);

  it('is dry, cratered ice, and pouring water on it makes its surface new', () => {
    const pl = ice();
    expect(Math.min(...pl.rock)).toBeGreaterThan(0);
    expect(pl.covered).toBe(0);
    // Tipped, the water pours out and freezes over the old ice.
    const q = pl.plume;
    pl.gravity = { x: -q.x * 0.6 + 0.7, y: -q.y * 0.6, z: -q.z * 0.6 };
    run(pl, 90);
    expect(pl.covered).toBeGreaterThan(0.01);
  });
});

describe('past fires', () => {
  it('leave their ground for the next to rise through', () => {
    const first = new Planet(topo, nearest(0, 0, 1), 5, worldOf('mars').rules);
    for (let t = 0; t < 60; t += 1 / 20) { first.step(1 / 20); if (Math.round(t * 20) % 60 === 0) first.erupt(); }
    const left = first.rock.slice();
    const next = new Planet(topo, nearest(1, 0, 0), 9, worldOf('mars').rules, left);
    // The old mountain still stands (fresh craters aside), and the new fire's summit is measured where it is, not there.
    const at = first.plumeVertex;
    expect(next.rock[at]).toBeGreaterThan(worldOf('mars').rules.floor! + 0.1);
    expect(next.summit).toBeLessThan(first.summit * 0.5);
  });
});

describe('atolls', () => {
  it('in the long age an island sinks inside its reef, and a ring of coral is left round a lagoon', () => {
    const pl = new Planet(topo, nearest(0, 0, 1), 3, worldOf('ocean').rules);
    pl.reserve = 0; pl.pressure = 0; // the fire is out
    // A living island: a dome 0.14 across, and reef in the shallows round it.
    const c = { x: 0.6, y: 0, z: 0.8 };
    const r = (v: number) => Math.hypot(p[v * 3] - c.x, p[v * 3 + 1] - c.y, p[v * 3 + 2] - c.z);
    for (let v = 0; v < topo.vertexCount; v++) {
      const d = r(v);
      if (d < 0.2) { pl.rock[v] = 0.12 * (1 - (d / 0.16) ** 2); pl.life[v] = 1; }
    }
    expect(pl.over).toBe(true);
    run(pl, 400);
    const ring: number[] = [], middle: number[] = [];
    for (let v = 0; v < topo.vertexCount; v++) {
      const d = r(v);
      if (d < 0.05) middle.push(pl.rock[v]);
      if (d > 0.13 && d < 0.19) ring.push(pl.rock[v]);
    }
    const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
    // The middle has drowned; the rim stands at the surface, higher than the middle.
    expect(mean(middle)).toBeLessThan(-0.01);
    expect(Math.max(...ring)).toBeGreaterThan(-0.002);
    expect(Math.max(...ring)).toBeGreaterThan(mean(middle) + 0.02);
  });
});

describe('Io', () => {
  it('has its heat come in tides: fast at high tide, slow at low', () => {
    const pl = new Planet(topo, nearest(0, 0, 1), 3, worldOf('io').rules);
    pl.stonesFall = false;
    const gained = (seconds: number) => { const a = pl.reserve; run(pl, seconds); return a - pl.reserve; };
    const P = pl.k.tidePeriod;
    const rising = gained(P / 2); // the tide's high half
    const falling = gained(P / 2); // its low half
    expect(rising).toBeGreaterThan(falling * 3);
  });

  it('throws a great plume\'s sulphur in a ring, not heaped round the vent', () => {
    const pl = new Planet(topo, nearest(0, 0, 1), 3, worldOf('io').rules);
    pl.pressure = 20;
    expect(pl.erupt()).toBe('burst');
    const v0 = pl.plumeVertex, at = (d: number) => {
      let s = 0, c = 0;
      for (let v = 0; v < topo.vertexCount; v++) {
        const dd = Math.hypot(p[v * 3] - p[v0 * 3], p[v * 3 + 1] - p[v0 * 3 + 1], p[v * 3 + 2] - p[v0 * 3 + 2]);
        if (Math.abs(dd - d) < 0.03) { s += pl.ash[v]; c++; }
      }
      return s / c;
    };
    const reach = pl.plumes[0].reach;
    expect(at(reach)).toBeGreaterThan(at(0.05) * 3);
  });

  it('counts a great plume only on fresh ground', () => {
    const pl = new Planet(topo, nearest(0, 0, 1), 3, worldOf('io').rules);
    pl.pressure = 20; pl.erupt();
    expect(pl.plumes.length).toBe(1);
    pl.pressure = 20; pl.erupt(); // the same place
    expect(pl.plumes.length).toBe(1);
    pl.pressure = 8; pl.erupt(); // too small to be great
    expect(pl.plumes.length).toBe(1);
  });

  it('throws further at high tide: there, less pressure makes a great plume', () => {
    const pl = new Planet(topo, nearest(0, 0, 1), 3, worldOf('io').rules);
    pl.seconds = pl.k.tidePeriod / 4; // high tide
    pl.pressure = 12; pl.erupt();
    expect(pl.plumes.length).toBe(1);
    const low = new Planet(topo, nearest(0, 0, 1), 3, worldOf('io').rules);
    low.seconds = (pl.k.tidePeriod * 3) / 4; // low tide
    low.pressure = 23; low.erupt();
    expect(low.plumes.length).toBe(0);
  });
});

describe('a young Earth', () => {
  it('holds more pressure under a taller cone', () => {
    const pl = new Planet(topo, nearest(0, 0, 1), 3, worldOf('young').rules);
    const before = pl.capNow;
    const t = topo, v = pl.plumeVertex;
    pl.rock[v] += 0.3;
    for (let k = t.nbrOffsets[v]; k < t.nbrOffsets[v + 1]; k++) pl.rock[t.nbrList[k]] += 0.3;
    expect(pl.capNow).toBeGreaterThan(before + 4);
  });

  it('throws the biggest bursts\' rock into orbit, and a cone blown apart throws none', () => {
    const pl = new Planet(topo, nearest(0, 0, 1), 3, worldOf('young').rules);
    pl.pressure = 6; pl.erupt();
    expect(pl.orbit).toBe(0); // a flow throws nothing
    pl.pressure = 11; pl.erupt();
    const one = pl.orbit;
    expect(one).toBeGreaterThan(0);
    pl.pressure = pl.capNow + 1; pl.stonesFall = false; pl.step(1 / 20); // held too long
    expect(pl.tally.calderas).toBe(1);
    expect(pl.orbit).toBe(one);
  });
});

describe('Enceladus', () => {
  // Tipped as a hand would, the vent's side of the world rolling `towards` (along the ground).
  const tipTo = (pl: Planet, towards: { x: number; y: number; z: number }) => {
    const v = pl.plumeVertex, n = { x: p[v * 3], y: p[v * 3 + 1], z: p[v * 3 + 2] }, s = 0.7;
    pl.gravity = { x: -n.x * (1 - s * 0.5) + towards.x * s, y: -n.y * (1 - s * 0.5) + towards.y * s, z: -n.z * (1 - s * 0.5) + towards.z * s };
  };
  it('feeds the giant\'s ring with a burst tipped its way, and not one tipped away', () => {
    const pl = new Planet(topo, nearest(0, 0, 1), 3, worldOf('enceladus').rules);
    pl.stonesFall = false;
    pl.giant = { x: 1, y: 0, z: 0 };
    pl.pressure = 10; tipTo(pl, { x: 1, y: 0, z: 0 }); pl.step(1 / 20);
    const fed = pl.orbit;
    expect(fed).toBeGreaterThan(5);
    run(pl, 3);
    pl.gravity = { x: 0, y: 0, z: -1 }; run(pl, 1); // level again
    pl.pressure = 10; tipTo(pl, { x: -1, y: 0, z: 0 }); pl.step(1 / 20);
    expect(pl.tally.bursts).toBe(2);
    expect(pl.orbit).toBeLessThanOrEqual(fed);
  });

  it('lets the ring thin away unless it\'s fed', () => {
    const pl = new Planet(topo, nearest(0, 0, 1), 3, worldOf('enceladus').rules);
    pl.stonesFall = false;
    pl.orbit = 100;
    run(pl, 60);
    expect(pl.orbit).toBeLessThan(90);
    expect(pl.orbit).toBeGreaterThan(70);
  });
});

describe('a lumpy asteroid', () => {
  it('begins lumpy, and grows rounder as its hollows fill', () => {
    const pl = new Planet(topo, nearest(0, 0, 1), 3, worldOf('asteroid').rules);
    expect(pl.spreadOf((v) => pl.start[v])).toBeGreaterThan(0.05);
    expect(pl.roundness).toBe(0);
    // Fill every hollow a little: lava laid where the ground is below its mean.
    const mean = pl.startMean;
    for (let v = 0; v < pl.rock.length; v++) if (pl.rock[v] < mean) pl.rock[v] += (mean - pl.rock[v]) * 0.5;
    expect(pl.roundness).toBeGreaterThan(0.15);
  });

  it('runs its lava by its own slopes, the way it is held only nudging it', () => {
    // The same pour, the world tipped hard towards +x: how far towards +x the lava ends up.
    const lean = (selfGravity: number) => {
      const pl = new Planet(topo, nearest(0, 0, 1), 3, { ...worldOf('asteroid').rules, selfGravity });
      pl.stonesFall = false;
      pl.gravity = { x: Math.sin(0.7), y: 0, z: -Math.cos(0.7) };
      pl.lava[pl.plumeVertex] += 0.05;
      for (let t = 0; t < 5; t += 1 / 20) pl.step(1 / 20);
      let sum = 0, weight = 0;
      for (let v = 0; v < pl.rock.length; v++) { const add = pl.rock[v] + pl.lava[v] - pl.start[v]; if (add > 0.0005) { sum += add * p[v * 3]; weight += add; } }
      return sum / weight - p[pl.plumeVertex * 3];
    };
    expect(Math.abs(lean(1))).toBeLessThan(Math.abs(lean(0)) * 0.6);
  });
});

describe('free play', () => {
  it('never runs out of heat until it\'s ended', () => {
    const pl = new Planet(topo, nearest(0, 0, 1), 3, { ...worldOf('mars').rules, endless: true, heat: 20 });
    pl.stonesFall = false;
    pl.gravity = { x: 0, y: 0, z: -1 };
    for (let t = 0; t < 120; t += 1 / 20) { pl.step(1 / 20); if (pl.pressure > 5) pl.erupt(); }
    expect(pl.over).toBe(false);
    expect(pl.heatLeft).toBeGreaterThan(0.9);
    pl.end();
    for (let t = 0; t < 60; t += 1 / 20) pl.step(1 / 20);
    expect(pl.over).toBe(true);
  });
});

describe('a spinning world', () => {
  it('flings its lava towards the equator', () => {
    // The same pour, a little north of the equator, with the spin and without: where the lava ends up.
    const lat = (spin: number) => {
      const pl = new Planet(topo, nearest(0, 0.35, 0.94), 3, { ...worldOf('spin').rules, spin });
      pl.stonesFall = false;
      pl.gravity = { x: 0, y: -0.35, z: -0.94 };
      pl.pressure = 6; pl.erupt();
      for (let t = 0; t < 15; t += 1 / 20) pl.step(1 / 20);
      let sum = 0, weight = 0;
      for (let v = 0; v < pl.rock.length; v++) { const add = pl.rock[v] - pl.start[v]; if (add > 0.0005) { sum += add * p[v * 3 + 1]; weight += add; } }
      return sum / weight;
    };
    expect(lat(worldOf('spin').rules.spin!)).toBeLessThan(lat(0) - 0.01);
  });

  it('counts a stretch of the equator as ridge once it is raised enough', () => {
    const pl = new Planet(topo, nearest(1, 0, 0), 3, worldOf('spin').rules);
    expect(pl.ridgeRaise().filter((r) => r >= pl.k.ridge).length).toBe(0);
    for (let v = 0; v < pl.rock.length; v++) if (Math.abs(p[v * 3 + 1]) < 0.12 && p[v * 3] > 0.9) pl.rock[v] += 0.3;
    expect(pl.ridgeRaise().filter((r) => r >= pl.k.ridge).length).toBeGreaterThan(0);
  });
});

describe('the lava-lamp world', () => {
  const make = () => {
    const pl = new Planet(topo, nearest(0, 0, 1), 3, worldOf('lamp').rules);
    pl.gravity = { x: 0, y: 0, z: -1 }; // the heat uppermost: level
    return pl;
  };
  it('grows a bud while level, and lets it go as a blob when tipped', () => {
    const pl = make();
    run(pl, 6);
    expect(pl.blobs.length).toBe(0);
    expect(pl.pressure).toBeGreaterThan(4);
    pl.gravity = { x: 0.5, y: 0, z: -0.87 };
    pl.step(1 / 20);
    expect(pl.blobs.length).toBe(1);
    expect(pl.pressure).toBe(0);
  });

  it('floats a hot blob to whatever is uppermost, and runs two hot ones together', () => {
    const pl = make();
    pl.blobs.push({ x: 0.6, y: 0, z: 0.8, area: 8, heat: 1 }, { x: 0.62, y: 0.03, z: 0.78, area: 6, heat: 1 });
    pl.gravity = { x: -1, y: 0, z: 0 }; // +x uppermost
    run(pl, 3);
    expect(pl.blobs.length).toBe(1);
    expect(pl.blobs[0].area).toBeCloseTo(14);
    expect(pl.blobs[0].x).toBeGreaterThan(0.6);
  });

  it('lets a cold blob sink away, and pools a warm one that reaches the far shore', () => {
    const pl = make();
    const s = pl.shore!;
    pl.blobs.push({ x: s.x, y: s.y, z: s.z, area: 10, heat: 0.8 }, { x: 0, y: 1, z: 0, area: 3, heat: 0.01 });
    run(pl, 1);
    expect(pl.pooled).toBeCloseTo(10);
    expect(pl.blobs.length).toBe(0);
  });
});

describe('a tumbling moon', () => {
  it('tumbles of itself, and a burst where the ground sweeps past calms it more than one at the spin\'s pole', () => {
    const calmed = (atPole: boolean) => {
      const pl = new Planet(topo, nearest(0, 0, 1), 7, worldOf('tumble').rules);
      pl.stonesFall = false;
      pl.step(0.1);
      expect(pl.tumbling).toBeGreaterThan(0.9);
      // Turn the spin so the vent is on its equator, or at its pole.
      const r = Math.hypot(pl.spinNow.x, pl.spinNow.y, pl.spinNow.z), q = pl.plume;
      const axis = atPole ? { x: q.x, y: q.y, z: q.z } : { x: -q.y, y: q.x, z: 0 };
      const l = Math.hypot(axis.x, axis.y, axis.z) || 1;
      Object.assign(pl.spinNow, { x: (axis.x / l) * r, y: (axis.y / l) * r, z: (axis.z / l) * r });
      pl.pressure = pl.k.explosive * 1.2;
      pl.erupt();
      return 1 - pl.tumbling;
    };
    expect(calmed(false)).toBeGreaterThan(0.3);
    expect(calmed(true)).toBeLessThan(0.05);
  });
});

describe('a deep ocean world', () => {
  it('runs lava further through a tube of its own fresh crust than over old floor', () => {
    // The same flow poured down the same way: once over the cold floor, once just after another.
    const reach = (second: boolean) => {
      const pl = new Planet(topo, nearest(0, 0, 1), 3, { ...worldOf('deep').rules, bankFar: 0 });
      pl.stonesFall = false;
      pl.gravity = { x: Math.sin(0.5), y: 0, z: -Math.cos(0.5) };
      const pour = () => { pl.pressure = 6; pl.erupt(); for (let t = 0; t < 10; t += 1 / 20) pl.step(1 / 20); };
      if (second) pour();
      const before = Float32Array.from(pl.rock);
      pour();
      let far = 0;
      const q = pl.plume;
      for (let v = 0; v < pl.rock.length; v++) if (pl.rock[v] - before[v] > 0.002) far = Math.max(far, Math.acos(Math.min(1, p[v * 3] * q.x + p[v * 3 + 1] * q.y + p[v * 3 + 2] * q.z)));
      return far;
    };
    expect(reach(true)).toBeGreaterThan(reach(false));
  });
});
