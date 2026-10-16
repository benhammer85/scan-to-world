# Browser checks (Well Rounded)

Each drives the page in a headless Chromium and prints what happened (and any page errors). Start the dev
server first (`npx vite --port 5199`), then run from the repository root with an output folder for
screenshots, e.g. `mkdir -p /tmp/wr && node test/browser/seeds.cjs /tmp/wr`.

| Script | Checks |
| --- | --- |
| `closetest2.cjs` | the practice: a ring closes when let go nearly round, and a half ring rests and can be begun again |
| `replant.cjs` | the practice: a tap on the grove's empty circle goes straight to the seeds, nothing asked; drawn back, the tree is as it was; a seed touched, the old tree stands in the grove; no daily words on reload |
| `seeds.cjs` | the practice: choosing a seed (oak, pine, birch) on a bare sheet, then six loops (screenshots of the choice, the planted seed, the first year, the sixth) |
| `pinch.cjs` | the practice: zoom in, then a two-finger pinch back out (screenshots mid-pinch: the whole slice, never a cut edge) |

Environment: `PLAYWRIGHT` (path to the playwright module, default `playwright`), `CHROME` (a Chromium to
launch, default Playwright's own), `BASE` (default `http://localhost:5199`).
