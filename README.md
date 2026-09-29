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

## Controls

| Mode   | Gesture |
|--------|---------|
| Orbit  | drag to rotate, pinch or scroll to zoom |
| Sculpt | drag on the object to raise terrain (Shift or right-drag to dig). A drag that starts off the object orbits the view. |
| Place  | tap to drop a tree, house or flag. A ghost preview follows the surface. |

Falloff options:
* **Gaussian:** each touch leaves a permanent bump.
* **Diffuse:** each touch spreads out over the surface (heat equation on the mesh) and fades.

The two layers are stored separately, so diffuse edits never wear away your permanent ones.

## Pipeline

```
scan file ─► load.ts         merge meshes, centre, scale to radius 1, optional decimate
          ─► topology.ts     weld UV-seam duplicates, adjacency, normals
          ─► heightfield.ts  per-vertex elevation: radial | curvature, smoothing, percentile normalise
          ─► + sculpt.ts     touch edit layer (Gaussian / diffusion), optional surface displacement
          ─► contours.ts     marching triangles + segment chaining  → Polyline[]
          ─► plotterLines.ts stroke-reveal shader (arc length + per-line timing)
          ─► placement.ts    props pinned by barycentric coords, aligned to surface normal
```

`src/world.ts` connects these stages for one object. `src/main.ts` handles the scene, UI and input.

### Notes on each stage

* **Heightfield.**
  * `radial` measures distance from the centroid. Use it for round, bumpy things like an orange, a rock or a potato.
  * `curvature` measures how far each vertex sticks out past its neighbours along the normal. Use it for anything else, such as a LEGO brick, where the studs and edges become ridges. It's noisier, so selecting it raises smoothing to 6.
  * Values are normalised with a 2% percentile clip so scan spikes don't flatten everything. **This is the stage that needs visual tuning.**
* **Contours.** Levels sit at fixed multiples of `1 / bands`. Editing bends existing lines or adds new levels, and the rest stay put. Holes in a scan give open polylines, which are handled.
* **Live reshaping.** Brushing updates the edit field every frame. Contour extraction is throttled to about every 70 ms. Rebuilt lines appear fully drawn instead of replaying the plot.
* **Placement.** The cheap version: no remeshing or quad grid. Props store `(triangle, barycentric)`, so they ride along when the surface is sculpted.

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
