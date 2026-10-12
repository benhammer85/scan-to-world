"""How ink took on a real relief print: a patch of a solid inked area of a public-domain woodcut, as
density (1 the ink's full strength, 0 the paper showing through), high-passed of the patch's slow
shading and made to tile. Usage: inktake.py scan.jpg x0,y0,x1,y1 out.png [paper-luminance]"""
import sys, numpy as np
from PIL import Image, ImageFilter
src, box, out = sys.argv[1], tuple(map(int, sys.argv[2].split(','))), sys.argv[3]
paper = float(sys.argv[4]) if len(sys.argv) > 4 else 232
L = np.asarray(Image.open(src).convert('L').crop(box), dtype=np.float32)
ink = np.percentile(L, 30)
d = np.clip((paper - L) / (paper - ink), 0, 1.15)
# (The patch's slow shading out: what's kept is how the ink took, not where the light fell.)
lo = np.asarray(Image.fromarray(np.clip(d * 200, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(40)), dtype=np.float32) / 200
d = np.clip(d - lo + np.median(d), 0, 1)
h, w = d.shape; F = min(h, w) // 6; t = np.linspace(0, 1, F)
d[:, :F] = d[:, :F] * t[None, :] + d[:, w - F:] * (1 - t[None, :]); d = d[:, :w - F]
d[:F, :] = d[:F, :] * t[:, None] + d[h - F:, :] * (1 - t[:, None]); d = d[:h - F, :]
Image.fromarray((d * 255).astype(np.uint8)).save(out)
print(out, d.shape, 'mean', round(float(d.mean()), 3), 'share under half', round(float((d < 0.5).mean()), 4))
