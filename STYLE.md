# Atlas Minor: the style rulebook

This page is the rule every feature is drawn by. When a new thing is added to the world, it is checked against this page first. If it does not fit, it changes, or this page does, on purpose.

## The one test

> **Would a surveyor of about 1820 have drawn it this way?**

The map is earnest. Its makers were not trying to look old. They were drawing the newest science they had, as precisely as they could. Age is something that happens to a map; it is never drawn onto one.

## The tradition

The world is drawn as a survey sheet of roughly **1780–1850**. The references are:

- the **Cassini map of France**;
- the **Ordnance Survey first series**;
- English county maps.

The atlas is a **star atlas of the same years**, in the manner of **Bode's *Uranographia*** and **Flamsteed's *Atlas Coelestis***.

If a convention is not in those, it does not go in.

## Palette

| | Colour | Used for |
|---|---|---|
| Paper | `#f4efe4` (the page), `#ecdfc2` (the world's surface, mixed with the scan's own colour) | everything sits on it |
| Chart paper | `#ebdfc6` | the atlas: the same stock, a shade warmer. Plain. |
| Ink | `#2e2118`, sepia-black | every line, every figure, every dot |
| Blue | water lining and washes | water only |
| Washes | light, multiplied into the paper | fields, woods, commons, as a colourist tinted a printed sheet |

**No other colours.** Carmine, gold, brass, green-for-grass and shadows are all out. The ink does the work.

## Line

- **Two weights.** The fine line is for nearly everything. The heavier line is for what matters most: main streets, the coast, walls.
- **Even and confident.** Engravers did not wobble. The charm is in the precision, never in fake "hand-drawn" jitter.
- **Shading is hatching.** Shading is done with parallel strokes down one side, the side away from the light. The light comes from the upper left. Hatching is never done with gradients.

## Flat, and only ink

Everything lies on the ground, drawn from above. **Nothing stands up off the world**: no pictures in profile, no cutouts. A standing-figure prototype was tried and dropped, because it looked like a fantasy map.

## Development as light

Development is drawn the way the Earth looks at night from space. There are no buildings and no outlines, only light, drawn in ink as stipple (`src/life/development.ts`):

- **Every house is a small light.** An old core's terraces and courts shine most, a new hut at the edge least, and a farm faintly.
- **The light spreads over the ground and fades with distance**, as a city's density falls off from its core.
- **Crowding counts:** light counts for more where there is more of it. Dim light gives only rare specks, and bright light nearly solid ground: bright cores, dark gaps, faint scattered points.
- **Roads are threads of light, not lines.** Only the water's edge and the rails are drawn as lines.
- **Nothing built is drawn from this height:** walls, churches, castles, abbeys and inns are part of the light. Carts and trains are too small to see; boats on the water stay.
- **Working ground stays as texture:** fields in rows and woods as small trees. There are no field outlines; water is drawn as lines. A railway is one fine line.

## How development grows

What the light shows is only as good as how the places grow. Growth follows what is known of real settlement seen from very high up (`GROW` in `src/life/settlements.ts`):

- **Unequal sizes (Zipf's law).** A few places grow large and many stay small. Growth rises with size, and each place has its own vigour.
- **Fingered edges, not discs** (Batty and Longley's *Fractal Cities*). The next house goes to a cheap plot, but not always the cheapest, over ground whose preference varies smoothly.
- **Ribbons along corridors.** Ground along a road or by the water is cheaper to settle, so places string out along coasts and ways.
- **Budding.** A grown place sends villages out along its ways, at irregular distances, preferring water and easy ground, never on a lattice. Places merge where they meet.
- **Farms in hamlets** of one to four, not one to a field.
- **No regular pattern shows through.** The fields' fixed cells are never outlined from this height: no hedges, walls or enclosure grids. Farmland shows as its rows, woods as their trees.

## Fading ink

This comes from whatwesaved's *fading plate*: the pen is the only light on the sheet (`holdSeconds` and `fadeSeconds` in `src/render/plotterLines.ts`).

- **Ink you are looking at keeps.**
- **Ink out of sight is held a while (25 s), then fades slowly (45 s) to pencil, never below.** The far side of a world is always a little faint, and the world is never quite whole at once.
- **Turned back into view, faded ink is inked again by the pen** once the world is at rest, starting nearest the eye.
- **The development's light does not fade.** It is not ink, and a place does not dim because you looked away.
- **Nothing ever disappears:** faded ink is pencil, still there (whatwesaved PRINCIPLES 21).

## You can't come close

The zoom stops well short of seeing what anything is: at most about 1.7 times closer than the view of the whole world (`CLOSEST` in `main.ts`). You see how much, where and how it spreads. What it is is left to the imagination.

## Generalisation

A map drawn at small scale leaves most things out, on purpose.

- **From arm's length:** coast, contours, development, woods. Nothing fine.
- **As close as you can come:** hedges, hedge trees, furrows, survey lines. Still never a building.
- **While the world turns:** the fine work waits, and is drawn once it settles (`detail` in `countryMarks` and `landmarkMarks`).
- **Empty paper stays empty.** Marks gather around people. Wild country is mostly bare paper and contours. The bare paper is what makes the busy parts beautiful.

## Out, always

These are the traps that turn an old map into a steampunk parody:

- **Fake age:** stains, foxing, burns, torn edges, heavy sepia, vignettes.
- **Machinery:** gears, brass, rivets, dials, pipes, airships.
- **Invented curlicues:** decoration that stands for nothing, and ornaments nobody would put in a legend.
- **Wobble:** "hand-drawn" jitter.
- **Fantasy colours:** anything outside the palette.

## The one fanciful thing

The celestial railway breaks the rules in its idea, never in its drawing. It is drawn the way a star atlas draws a comet's course: a fine line marked with small rings at its places, a ring at each station, and the sign for a station (a ring with a dot) at its halfway point. The train is a comet, with a head and a thin tail. It has no trestles, no chains and no smoke.

## Adding something

Before a new mark goes in, check it against four questions:

1. Is it in the tradition? Name the map it comes from.
2. Is it flat ink, and does it keep what it is a mystery? (Dots, rows, lines; never a picture of a thing.)
3. Which line weight, and which of the palette's colours?
4. At what distance does it appear, and is it left out while the world turns?
