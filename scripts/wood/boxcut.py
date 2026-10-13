import sys, numpy as np
from PIL import Image
src, out, Wd = sys.argv[1], sys.argv[2], int(sys.argv[3])
a = np.asarray(Image.open(src).convert('RGB'), dtype=np.int32); ok = a.sum(-1) > 15
h, w = ok.shape; best = (0, 0, 0)
for x0 in range(0, max(1, w - Wd), 10):
    rows = ok[:, x0:x0 + Wd].all(1); run = 0
    for y in range(h):
        run = run + 1 if rows[y] else 0
        if run > best[0]: best = (run, x0, y - run + 1)
run, x0, y0 = best; m = 4
Image.open(src).crop((x0 + m, y0 + m, x0 + Wd - m, y0 + run - m)).save(out); print(out, Wd, run)
