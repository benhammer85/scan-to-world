# The pine cores: each core's middle band, turned so the pith is at the top and the rings run across.
import sys
from PIL import Image
src,k=sys.argv[1],float(sys.argv[2])
im=Image.open(src).convert('RGB')
for n,(y0,y1) in enumerate([(12,60),(88,138)]):
  c=im.crop((int(30*k),int(y0*k),im.width-int(4*k),int(y1*k))).rotate(90,expand=True)
  # (rotate 90: the core's right end, the pith (the sharp edges show outward runs right to left), goes to the top)
  c.save(f'pine-core{n}.png'); print(c.size)
