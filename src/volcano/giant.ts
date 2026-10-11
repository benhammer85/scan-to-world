/**
 * The red giant: the drying seas' world four billion years on. The Sun has run out of hydrogen at its centre and
 * swollen into a red giant; the last of the seas are long gone, and over the ages its light has melted the old
 * continents down into a low, scarred plain, only the faintest relief of what stood there left in it.
 */
export const GIANT = {
  /** The plain the old ground is melted down to, and how much of its old relief is left in it (heights against the old sea). */
  plain: 0.014,
  relief: 0.06,
};

/** The ground after the ages under the red giant: low, all of it dry, the old continents only faint swells in it. */
export function melted(rock: ArrayLike<number>): Float32Array {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < rock.length; i++) { lo = Math.min(lo, rock[i]); hi = Math.max(hi, rock[i]); }
  const out = new Float32Array(rock.length), span = Math.max(1e-6, hi - lo);
  for (let i = 0; i < rock.length; i++) out[i] = GIANT.plain + GIANT.relief * 0.2 * ((rock[i] - lo) / span);
  return out;
}
