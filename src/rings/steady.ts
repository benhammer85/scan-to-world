/**
 * Holding the page still on a phone while a ring is drawn.
 *
 * On an iPhone, Safari's toolbar slides in and out as a finger moves, and each time the window's height
 * changes; if the slice is laid out again to fit, it jumps up and down under the finger. And a drag can
 * still nudge the page (its rubber-band bounce) or pinch it. So: the drawing takes the tallest height the
 * window can have at this width (a new width, a turn of the phone, lays it out again), and a touch on the drawing
 * moves nothing but the brush.
 */
let lastW = 0, tallest = 0;

/** The tallest the window can be at this width: Safari's 100vh is the height with its toolbar away. */
function large(): number {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:100vh;visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);
  const h = probe.getBoundingClientRect().height;
  probe.remove();
  return Math.max(innerHeight, Math.min(h, innerHeight * 1.4));
}

/** The drawing's size in CSS px: the window's width, and the tallest height it has at that width. */
export function steadySize(): { w: number; h: number } {
  const w = innerWidth, h = large();
  if (w !== lastW) { lastW = w; tallest = h; } else tallest = Math.max(tallest, h);
  return { w, h: tallest };
}

/** No scrolling, bouncing or zooming from touches on these elements (the brush has them). */
export function holdStill(...els: HTMLElement[]): void {
  const stop = (e: Event) => { if (e.cancelable) e.preventDefault(); };
  for (const el of els) {
    el.addEventListener('touchmove', stop, { passive: false });
    el.addEventListener('gesturestart', stop);
    el.addEventListener('dblclick', stop);
  }
}
