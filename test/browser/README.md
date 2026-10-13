# Browser checks (Well Rounded)

Each drives the page in a headless Chromium and prints what happened (and any page errors). Start the dev
server first (`npx vite --port 5199`), then run from the repository root with an output folder for
screenshots, e.g. `mkdir -p /tmp/wr && node test/browser/childflow.cjs /tmp/wr`.

| Script | Checks |
| --- | --- |
| `closetest2.cjs` | the practice: a ring closes when let go nearly round, and a half ring rests and can be begun again |
| `chal2.cjs` | the challenge: ten rings scored, a touch costs, the run ends and restarts |
| `childflow.cjs` | the child's tree: setup, planting, a day drawn and kept, a copy kept and restored into empty storage |
| `years.cjs` | the child's tree: this year, every year, opening a past year, the ink-only print and the words card |
| `views.cjs` | the child's tree: which links show where; the microphone off by default |
| `puzzle.cjs` | the puzzle: eight rings grown toward the target (`node test/browser/puzzle.cjs out lobes 1`; the last number how well the rings are judged), the score, the share card, a tap to try again |
| `replant.cjs` | the practice: a long press on the pencilled line asks to plant a new tree; cancelled it stays, confirmed the sheet is bare |
| `pinch.cjs` | the practice: zoom in, then a two-finger pinch back out (screenshots mid-pinch: the whole slice, never a cut edge) |

Environment: `PLAYWRIGHT` (path to the playwright module, default `playwright`), `CHROME` (a Chromium to
launch, default Playwright's own), `BASE` (default `http://localhost:5199`).
