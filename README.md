# Scan-to-World (prototype)

Scan a real object, and a tiny world grows on its **actual** surface. Its bumps become
mountains, contour lines plot themselves in like a pen plotter, and you can push the
terrain around with your finger.

The rule the code sticks to: **terrain always comes from the scanned geometry**. Nothing
recognises "this is an orange" and swaps in a library mesh.

## Run it

```bash
cd scan-to-world
npm install
npm run dev        # opens on your LAN too (vite --host), so you can try it on a phone
npm test           # contour / heightfield / sculpt unit tests
npm run build
```

It boots with a procedural **demo orange**. To use a real scan, export GLB, OBJ or PLY from
Scaniverse, KIRI Engine or RealityScan and load it with **Load scan**. If the scan is heavy,
use **Decimate to** (meshoptimizer, respects UV seams) and aim for 5–15k triangles. For
multi-million-triangle raw scans, decimate in Blender or in the scan app's export first.

## Touch

There are no buttons, modes or menus. The screen is the object and nothing else.

| Gesture | What it does |
|---|---|
| Tap | "People here." Founds a hamlet, or grows the town you touched. The ground decides whether and where |
| Drag | Turns the world, and turning is time: a full turn is a day, and towns grow as the days pass |
| Hold still on the object | Presses into the ground, deeper the longer you hold |
| Hold, then pull | Pulls the ground up. How far you pull is how high it goes, and moving back lets it down again |
| Pinch or scroll | Comes closer. The brush is a fixed size on screen, so closer means finer edits |
| Drop a file on the window | Loads a scan (GLB, OBJ or PLY) |
| Three fingers held, or the <code>`</code> key | Opens the tuning drawer, which is for development and not part of the product |

A ring appears the moment a finger takes hold, before any work happens, so you know you were heard. Changed contours show as pencil while you work, and the pen inks them when you let go.

The object picks its own height method from its shape (`chooseHeightMode`): radial for round things, curvature for everything else. The recogniser (`src/interact/gestures.ts`) only turns pointer events into intents, so its rules are unit-tested. The feel constants live in `TOUCH` in `src/main.ts`.

## Pipeline

```
scan file ─► load.ts         merge meshes, centre, scale to radius 1, optional decimate
          ─► topology.ts     weld UV-seam duplicates, adjacency, normals
          ─► heightfield.ts  per-vertex elevation: radial | curvature, smoothing, percentile normalise
          ─► + sculpt.ts     touch edit layer (Gaussian / diffusion), optional surface displacement
          ─► contours.ts     marching triangles + segment chaining  → Polyline[]
          ─► plotterLines.ts stroke-reveal shader (arc length + per-line timing)
          ─► settlements.ts  towns: founded by a tap, grown by turning, on ground gentle enough to build
          ─► buildingMarks.ts buildings as pen marks along the contours
```

`src/world.ts` connects these stages for one object. `src/main.ts` handles the scene, UI and input.

### Notes on each stage

* **Heightfield.**
  * `radial` measures distance from the centroid. Use it for round, bumpy things like an orange, a rock or a potato.
  * `curvature` measures how far each vertex sticks out past its neighbours along the normal. Use it for anything else, such as a LEGO brick, where the studs and edges become ridges. It's noisier, so selecting it raises smoothing to 6.
  * Values are normalised with a 2% percentile clip so scan spikes don't flatten everything. **This is the stage that needs visual tuning.**
* **Contours.** Levels sit at fixed multiples of `1 / bands`. Editing bends existing lines or adds new levels, and the rest stay put. Holes in a scan give open polylines, which are handled.
* **Live reshaping.** Brushing updates the edit field every frame. Contour extraction is throttled to about every 70 ms. Rebuilt lines appear fully drawn instead of replaying the plot.
* **Settlements.** A tap founds a town on the nearest buildable ground within reach, or refuses with a grey ring. Buildable means gentler than whichever is higher: the object's own 60th-percentile slope, or an absolute floor, so gentle ground is always buildable. Towns grow outward along the cheapest ground by path cost (climbing and height cost more), keep a fixed spacing in world units, and never take a building back. Growth is batch-independent (one day in one step builds the same town as a hundred steps), and founding a town moves nothing in another. All of this is tested. Buildings sit on vertices, so they ride the ground when it's sculpted. They're pencilled in while the world turns and inked by their own pen once it's calm. On the orange, 83% of the surface is buildable, and the flank of a pulled-up mountain measured 27 of 27 vertices refused.
* **Streets.** Every building except the hall gets its own street, grown from its door to the first street it meets (whatwesaved 5b/5c). A building with no street within reach is refused before it's laid. Streets run along mesh edges, so two streets can only meet at a vertex: every crossing is a real junction by construction. Climbing costs extra, so streets wind along the contours; on the test slope they climb at least 20% less than the ground they cross. Streets keep clear of buildings and buildings keep off streets, checked on the drawn line after smoothing. A building that would wall in its hall is refused: on a coarse mesh the first ring of houses otherwise enclosed it, and growth stalled at seven buildings. Two towns are joined by a road once both have six buildings. Growth runs in true time order across towns, so how time is sliced doesn't change the world. On the orange, 8 days of growth cost 20 ms in total, and the worst single frame was 0.6 ms.
* **Loops.** A street grown one at a time that stops at the first street it meets makes a tree, where every house is a spur. So after each street is laid, the town looks along it for a nearby point on the network that is close over the ground but at least three times as far by street, and lays a lane between them. That's the old app's "road distance against the crow flight", and the same test keeps lanes from duplicating a street that runs alongside. Over three towns, the average detour between houses went from 1.80, 1.81 and 1.98 without lanes to 1.47, 1.40 and 1.42 with them. No lane formed until houses were spaced at least 1.7 mesh edges apart. Streets run on the mesh, and closer houses took every vertex, leaving no ground to cross. House spacing is now whichever is larger: 0.065, or 1.7 mesh edges.
* **Frontage.** Streets come first and houses fill the frontage. A house goes on the best free plot beside one of its town's streets, long side facing it. When there's no frontage left, the town lays a new street: a short link climbs from the network to the cheapest open ground, and from there the street runs both ways along the contour, keeping clear of other streets so a row of houses fits between them. A street that no house could front is refused before it's laid. On the orange, 56 of 58 buildings face a street (the other two are halls), and over 80% of houses share their street with others. The old model was one spur per house.
  * Measuring contours honestly took three rounds. Continuing the link's own direction sent streets uphill, and weighting the climb harder moved the number from 0.82 to 0.81. Laying the street both ways along the contour fixed the mechanism, but the number still read about 0.8, because on a triangle mesh even the least-climbing edge at each point climbs 0.72 of the mean. The test now measures against that floor: contour streets come within 1.3× of the least climb the mesh allows.
  * Loops still help with frontage, but less: the detour went from 1.77, 1.72 and 1.80 to 1.49, 1.58 and 1.62, because contour streets already connect better.
* **Square and market.** Founding a town opens a square round its hall: open ground no house or street may enter, whose edge is itself a street, so houses front the square and the first streets lead out from it. A town is only founded where the whole square fits on free, mostly buildable ground. The square is at least 0.1 across, or 2.6 mesh edges on a coarse mesh (whatwesaved PRINCIPLES.md, 12). For the same reason, a tap's reach on a town now extends past its square: a fixed reach fell short of a coarse mesh's square, and taps on towns were refused. When a town reaches 10 houses its market opens: stalls in the square, each facing the hall, with one more every 4 houses up to 8. Stalls are only ever added, never moved. On the orange, two towns grew 14 stalls in 12 days.
* **Clean drawing.** The plan's shape is kept, and only the drawing is tidied:
  * **Squares are round.** A square's edge is drawn as a true circle through the mean radius of its ring. Streets that meet the square end exactly on that circle.
  * **Stalls are even.** Stalls fill even slots round the hall, in order, and never move.
  * **Houses face their front.** Each house is turned to face the street point it fronts. Reading the street's own direction instead gave odd angles on links and loops.
  * **No stray ticks.** Street runs under two mesh edges are refused before they're laid, and fragments under 0.015 after trimming aren't drawn.
  * **Nothing is buried.** Houses and stalls are flat and lifted as a whole by the most any point of them needs. A flat mark at a fixed lift over a bump in the peel buried its short sides and drew as "//". Laying each point on the ground separately fixed that but made houses wobble. A test on steep bumps catches both. Two lessons from the old app came back while building it. The first version of the burial test passed with the fix switched off, because its reference was wrong (principle 4b). And the draping's sampling radius held only one vertex on a coarse mesh, so it did nothing at all (principle 12).

## The reveal (ported from whatwesaved)

The pen is the map app's reveal (`marginalia/studio.py`: `plot()`, `ink()`, `draw()`),
moved from a canvas mask onto lines lying on a 3D surface.

What carried over:
* **One pen at constant speed.** A reveal takes as long as there is line to draw, clamped to 1.5–20 s, and it's eased at both ends of the whole run.
* **Nearest-neighbour order** from where you touched, one window at a time. A window is one contour level here, so the terrain still goes on bottom-up. Open lines start at whichever end is nearer.
* **A minimum cost per mark**, so short lines are drawn rather than appearing.
* **A visible nib.**
* **Pen pace**, remembered per viewer.
* **Only new marks are plotted.** A new reveal finishes the running one rather than dropping it.

What's new, to meet this brief's "reshape live":
* While you drag, changed lines show as **pencil**.
* On release, and once any diffusing edits have settled, the pen **inks** them, starting where the stroke began. The pencil stays underneath until the pen reaches it, because a line that disappears and then comes back reads as deletion (whatwesaved PRINCIPLES 21).
* Settings changes redraw with no animation, like the map app's `restate`.

What makes this work: contour extraction is deterministic, so a line the edit didn't touch comes back bit-identical and keeps its key (`lineKey`). There's a test for that, and a stroke measured in the browser changed 24 of 96 lines.

**Where this differs from the map app, on purpose.** The map app doesn't animate the
country: "nobody made the hillside", so drawing it stroke by stroke would say a hand put it
there. Here the terrain is the whole point. It's the player's own object turned into a
world, so the first load plots it in. Only the "only animate the response" rule carries
over, and it applies to the player's edits.

## Known limits / next steps

* WebGL lines are 1 px. For thicker, pen-like strokes, switch to `Line2` / `LineSegments2` and port the reveal attributes.
* Brush distance is Euclidean. On thin or concave objects it can bleed across gaps, so use geodesic distance (a Dijkstra step on the adjacency) if that matters.
* There's no BVH, and raycasting is brute force. That's fine up to around 50k triangles. Add `three-mesh-bvh` for more.
* Contour rebuilds walk every triangle. Rebuilding only the brushed region would scale better.
