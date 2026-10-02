/**
 * Touch and motion, with no modes and no buttons.
 *
 *   tap             "people here": found a town, or grow the one you touched
 *   drag            turn the world (with momentum)
 *   hold still      press into the ground, deeper the longer you hold
 *   hold, then pull pull the ground up; how far you pull is how high it goes,
 *                   and bringing the finger back lets it down again
 *   pinch / wheel   come closer or go further away
 *   three fingers,  open the tuning drawer (for the developer, not the player)
 *   held
 *
 * The recogniser only turns pointer events into intents. What an intent does
 * to the world is main.ts's business, so the rules here can be tested
 * without a browser.
 */

export interface GestureSink {
  /** A short touch that didn't move. */
  tap(x: number, y: number): void;
  /** Pixels dragged since the last call. */
  spin(dx: number, dy: number): void;
  /** Momentum at release, in pixels per second. */
  fling(vx: number, vy: number): void;
  /** >1 = come closer. */
  zoom(factor: number): void;
  /** Two fingers turning about each other: radians since the last call, clockwise on screen. */
  twist?(radians: number): void;
  /** A finger has rested on the object long enough to take hold of it. */
  grab(x: number, y: number): void;
  /** Still holding, still still: press in for `dt` seconds. */
  press(dt: number): void;
  /** Holding and pulling: the finger is `pixels` from where it took hold. */
  pull(pixels: number): void;
  /** The finger let go of the ground. */
  release(): void;
  /** Holding, and the finger moved: pixels since the last call (for a sink that turns things while held). */
  heldMove?(dx: number, dy: number): void;
  drawer(): void;
}

export const GESTURE = {
  /** Movement below this is a finger resting, not a drag. */
  slop: 8,
  /** Time still before a finger takes hold of the ground. */
  holdMs: 280,
  /** Further time still before it starts pressing in, so a pull doesn't dent first. */
  pressDelayMs: 220,
  drawerMs: 600,
};

type Phase = 'idle' | 'pending' | 'spinning' | 'holding' | 'pulling' | 'pinching' | 'multi';

interface Pt { x: number; y: number }

export class GestureRecognizer {
  private phase: Phase = 'idle';
  private pointers = new Map<number, Pt>();
  private start: Pt & { t: number; onObject: boolean } = { x: 0, y: 0, t: 0, onObject: false };
  private last: Pt & { t: number } = { x: 0, y: 0, t: 0 };
  private velocity: Pt = { x: 0, y: 0 };
  private grabbedAt = 0;
  private pinchDist = 0;
  private pinchAngle = 0;
  private multiSince = 0;
  private multiStill = true;

  constructor(private sink: GestureSink, private isOnObject: (x: number, y: number) => boolean) {}

  get current(): Phase {
    return this.phase;
  }

  down(id: number, x: number, y: number, t: number): void {
    this.pointers.set(id, { x, y });
    const n = this.pointers.size;
    if (n === 1) {
      this.phase = 'pending';
      this.start = { x, y, t, onObject: this.isOnObject(x, y) };
      this.last = { x, y, t };
      this.velocity = { x: 0, y: 0 };
      return;
    }
    // A second finger turns whatever this was into a pinch. If it had
    // already taken hold of the ground, let go first.
    this.endGrab();
    if (n === 2) {
      this.phase = 'pinching';
      this.pinchDist = this.spread();
      this.pinchAngle = this.angle();
    } else {
      this.phase = 'multi';
      this.multiSince = t;
      this.multiStill = true;
    }
  }

  move(id: number, x: number, y: number, t: number): void {
    const p = this.pointers.get(id);
    if (!p) return;
    const moved = Math.hypot(x - p.x, y - p.y);
    p.x = x; p.y = y;

    switch (this.phase) {
      case 'pending':
        if (Math.hypot(x - this.start.x, y - this.start.y) > GESTURE.slop) {
          this.phase = 'spinning';
          this.track(x, y, t);
        }
        break;
      case 'spinning':
        this.track(x, y, t);
        break;
      case 'holding':
      case 'pulling': {
        this.sink.heldMove?.(x - this.last.x, y - this.last.y);
        this.last = { x, y, t };
        const d = Math.hypot(x - this.start.x, y - this.start.y);
        if (this.phase === 'holding' && d > GESTURE.slop) this.phase = 'pulling';
        if (this.phase === 'pulling') this.sink.pull(d);
        break;
      }
      case 'pinching': {
        const d = this.spread();
        if (this.pinchDist > 0 && d > 0) this.sink.zoom(d / this.pinchDist);
        this.pinchDist = d;
        const a = this.angle();
        let da = a - this.pinchAngle;
        if (da > Math.PI) da -= Math.PI * 2;
        if (da < -Math.PI) da += Math.PI * 2;
        this.sink.twist?.(da);
        this.pinchAngle = a;
        break;
      }
      case 'multi':
        if (moved > GESTURE.slop) this.multiStill = false;
        break;
    }
  }

  up(id: number, _x: number, _y: number, t: number): void {
    if (!this.pointers.delete(id)) return;
    if (this.phase === 'spinning') {
      // Momentum only if the finger was still moving when it lifted.
      const fresh = t - this.last.t < 80;
      this.sink.fling(fresh ? this.velocity.x : 0, fresh ? this.velocity.y : 0);
    }
    if (this.phase === 'pending' && this.pointers.size === 0) this.sink.tap(this.start.x, this.start.y);
    this.endGrab();
    if (this.pointers.size === 0) this.phase = 'idle';
    else if (this.phase !== 'multi') this.phase = 'multi'; // finish lifting before anything new starts
  }

  /** Call every frame: holding is something that happens with no events at all. */
  tick(t: number, dt: number): void {
    if (this.phase === 'pending' && this.start.onObject && t - this.start.t >= GESTURE.holdMs) {
      this.phase = 'holding';
      this.grabbedAt = t;
      this.sink.grab(this.start.x, this.start.y);
    }
    if (this.phase === 'holding' && t - this.grabbedAt >= GESTURE.pressDelayMs) this.sink.press(dt);
    if (this.phase === 'multi' && this.pointers.size >= 3 && this.multiStill && t - this.multiSince >= GESTURE.drawerMs) {
      this.multiStill = false; // once per hold
      this.sink.drawer();
    }
  }

  wheel(deltaY: number): void {
    this.sink.zoom(Math.exp(-deltaY * 0.0015));
  }

  private endGrab(): void {
    if (this.phase === 'holding' || this.phase === 'pulling') this.sink.release();
  }

  private track(x: number, y: number, t: number): void {
    const dx = x - this.last.x, dy = y - this.last.y, dt = Math.max(1, t - this.last.t) / 1000;
    this.sink.spin(dx, dy);
    // Smoothed, so one jittery last event doesn't decide the fling.
    this.velocity.x = this.velocity.x * 0.6 + (dx / dt) * 0.4;
    this.velocity.y = this.velocity.y * 0.6 + (dy / dt) * 0.4;
    this.last = { x, y, t };
  }

  private angle(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.atan2(b.y - a.y, b.x - a.x) : 0;
  }

  private spread(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }
}
