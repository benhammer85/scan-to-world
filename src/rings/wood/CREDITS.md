# The wood

Real wood, not drawn: cross-sections from Romeyn B. Hough, *The American Woods, exhibited by actual
specimens*, Part I (Lowville, N.Y., 1888), whose plates are thin slices of the trees themselves. In the
public domain; scanned by the University of California Libraries for the
[Internet Archive](https://archive.org/details/americanwoodsexh01hougrich).

| File | Specimen | Plate (scan page) |
| --- | --- | --- |
| `red-oak-years.png` | No. 15, *Quercus rubra*, red oak, transverse section | n126 |
| `red-pine-fibre.png` | No. 19, *Pinus resinosa*, red pine, transverse section | n134 |
| `white-ash-years.png` | No. 10, *Fraxinus americana*, white ash, transverse section (Part I) | n116 |
| `black-cherry-fibre.png` | No. 29, *Prunus serotina*, black cherry, transverse section (Part II) | n74 |
| `paper-birch-fibre.png` | No. 43, *Betula papyrifera*, paper birch, transverse section (Part II) | n102 |
| `giant-sequoia-fibre.png` | No. 142, *Sequoia gigantea*, big tree, radial section turned to run round (Part VI) | n110 |
| `bigleaf-maple-fibre.png` | No. 152, *Acer macrophyllum*, broad-leaved maple, transverse section (Part VII) | n126 |

(Parts II, VI and VII from the same Internet Archive collection of Hough's volumes.) The giant sequoia
stands in for the coast redwood, its close kin. The bristlecone and the olive have no section here (no
openly licensed one could be had): the bristlecone takes the red pine's fibre, the olive the cherry's,
and both are drawn from their anatomy and their way of growing.

How they were made (`scripts/wood/`): the tree's centre is found off the plate (`refine.py`), the rings
are unrolled straight about it (`unroll.py`); for the oak, each year is traced at the top of its row of
pores and straightened into a strip 112 px deep (`years.py`), then turned into ink as a slice of it
would print (`inkmap.py`): the pores and rays open (paper), the latewood heavy, the springwood lighter,
tiling round; the ash the same (16 of its years; one lost to the pore tracing). The pine's rings were too faint in the scan to trace, so only its fibre is kept, its
ring-lines taken out (`fibre.py`); its years are still drawn. The cherry, maple, birch and sequoia
the same (`boxcut.py` cuts the tallest clean strip of a plate): their rings too faint to trace, their
fibre kept, their years drawn.

## The ink

How ink takes on a real relief print, from Edvard Munch, *Two Women on the Shore* (1898, woodcut printed
from one block; Art Institute of Chicago, public domain, CC0): patches of its solid areas made into
density (1 the ink's full strength, 0 the paper through it), their slow shading taken out, tiling
(`scripts/wood/inktake.py`).

| File | Patch |
| --- | --- |
| `munch-sea-ink.png` | the dark sea: the ink's mottle and its sparse specks |
| `munch-field-ink.png` | the green field: the plank's grain and streaks, where the ink took thinly |

Looked at, not taken from (to learn how a solid black and a thin inking print): Félix Vallotton's
*Intimacies* (1898) and *The Coffin Bearers* (1892), and Paul Gauguin's *Noa Noa* woodcuts (1893–94).
