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
| Carmine | `#a2503f` | built-up ground (the survey's red for buildings), and nothing else |
| Blue | water lining and washes | water only |
| Washes | light, multiplied into the paper | fields, woods, commons, as a colourist tinted a printed sheet |

**No other colours.** Gold, brass, green-for-grass and shadows are all out.

## Line

- **Two weights.** The fine line is for nearly everything. The heavier line is for what matters most: main streets, the coast, walls.
- **Even and confident.** Engravers did not wobble. The charm is in the precision, never in fake "hand-drawn" jitter.
- **Shading is hatching.** Shading is done with parallel strokes down one side, the side away from the light. The light comes from the upper left. Hatching is never done with gradients.

## Plan and profile

This is the heart of the look. The ground is drawn **in plan**, seen from above. The things old maps drew as little pictures are drawn **in profile**, standing up off the world as cutouts that face you (`src/render/standing.ts`).

| In plan (flat on the ground) | In profile (standing) |
|---|---|
| contours, hachures, the coast, water lining | trees (round, and now and then a fir) |
| streets, roads, tracks, rails, canals | a church's tower and spire; a cathedral's great tower |
| fields, hedges, dry-stone walls, furrows | a windmill (its sails turn) |
| town buildings (carmine, or stipple) | a castle's keep, or its ruin |
| walls and bastions, squares, gardens | a lighthouse |
| survey lines, milestones, ponds | |

A profile figure is **one of the list above**, drawn in the convention of the period. A figure is never invented for flavour.

Profile figures are **printed, not pasted**. Their ink and the faint tone of their card multiply into the page, so they take the colour of the ground they stand on.

## Built-up ground: two ways

The map currently offers two conventions for towns, and both are period-true:

- **Buildings**, each one in carmine, as on a large-scale town plan (the default).
- **Stipple**, the built-up ground dotted in ink, as on a small-scale survey sheet (`?stipple`). A hamlet is a few dots; a city is a dark field of them. Development reads as density.

We choose one, or choose by zoom (stipple from afar, buildings close up), once both have been seen on a phone.

## Generalisation

A map drawn at small scale leaves most things out, on purpose.

- **From arm's length:** coast, contours, towns, woods, and one or two landmarks. Nothing fine.
- **Coming closer:** hedges, hedge trees, milestones, furrows, survey lines.
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
2. Plan or profile?
3. Which line weight, and which of the palette's colours?
4. At what distance does it appear, and is it left out while the world turns?
