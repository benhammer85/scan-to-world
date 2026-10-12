# The wood

Real wood, not drawn: cross-sections from Romeyn B. Hough, *The American Woods, exhibited by actual
specimens*, Part I (Lowville, N.Y., 1888), whose plates are thin slices of the trees themselves. In the
public domain; scanned by the University of California Libraries for the
[Internet Archive](https://archive.org/details/americanwoodsexh01hougrich).

| File | Specimen | Plate (scan page) |
| --- | --- | --- |
| `red-oak-years.png` | No. 15, *Quercus rubra*, red oak, transverse section | n126 |
| `red-pine-fibre.png` | No. 19, *Pinus resinosa*, red pine, transverse section | n134 |

How they were made (`scripts/wood/`): the tree's centre is found off the plate (`refine.py`), the rings
are unrolled straight about it (`unroll.py`); for the oak, each year is traced at the top of its row of
pores and straightened into a strip 112 px deep (`years.py`), then turned into ink as a slice of it
would print (`inkmap.py`): the pores and rays open (paper), the latewood heavy, the springwood lighter,
tiling round. The pine's rings were too faint in the scan to trace, so only its fibre is kept, its
ring-lines taken out (`fibre.py`); its years are still drawn. (Birch's scan held nothing finer than
noise, so birch is drawn.)

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
