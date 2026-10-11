"""
Well Rounded's plates: real prints of about 1805 to 1825, in the public domain (Public Domain Mark),
from the Wellcome Collection, turned into ink on a transparent ground for src/rings/plates/.

Each is fetched from the Wellcome's image service (IIIF), cropped to its picture, and its paper lifted
away: the paper's level is estimated broadly (so stains and plate tone aren't taken for ink), what's
darker than it becomes ink's alpha, faint marks (text showing through from the back of a page) are
dropped, and the big plates' edges are feathered so they fade into the game's page.

  python3 scripts/plates.py      (needs Pillow and numpy; writes src/rings/plates/*.webp)

Sources (wellcomecollection.org/works/<id>):
  acorns   dj4ukjmw  Acorns and twigs of oak, pencil and watercolour drawings (image V0043559)
  young    my4hn5e7  W. Billington, Facts, Hints, Observations ... Raising Young Plantations of Oaks, 1825, p. 166 (b33281506, canvas 183)
  sapling  my4hn5e7  the same, p. 164 (canvas 181)
  winter   my4hn5e7  the same, frontispiece, The Oak in Winter (canvas 7)
  lane     skmjc9gx  Oak trees by a country lane in Berkshire, soft-ground etching by W. Delamotte, 1805 (V0043124)
  prime    bmzye2yq  A tall oak in Fredville Park, etching after J. G. Strutt, 1824 (V0042982)
  great    gcjezqme  A large oak in open parkland, etching after J. G. Strutt, 1823 (V0042984)
  ancient  zub6gxsr  A gnarled and hollow old oak, etching after J. G. Strutt (V0042981)
"""
import os, subprocess, json
OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'rings', 'plates')
TMP = os.path.join(os.path.dirname(__file__), '..', 'node_modules', '.plates')
os.makedirs(TMP, exist_ok=True)
def fetch(url, name):
    path = os.path.join(TMP, name)
    if not os.path.exists(path): subprocess.run(['curl', '-sS', '-m', '90', '-A', 'Mozilla/5.0', '-o', path, url], check=True)
    return path
IIIF = 'https://iiif.wellcomecollection.org/image/{}/full/{},/0/default.jpg'
def page(n, width=1000):
    man = fetch('https://iiif.wellcomecollection.org/presentation/v2/b33281506', 'b33281506.json')
    ids = [c['images'][0]['resource']['service']['@id'] for c in json.load(open(man))['sequences'][0]['canvases']]
    return fetch(ids[n] + f'/full/{width},/0/default.jpg', f'page{n}.jpg')
from PIL import Image, ImageFilter
import numpy as np
INK=(52,38,28)
def ink(src, box, out, h=1100, colour=False, feather=0.0, floor=0.14):
    im=Image.open(src).convert('RGB'); W,H=im.size
    im=im.crop((int(box[0]*W),int(box[1]*H),int(box[2]*W),int(box[3]*H)))
    if im.height>h: im=im.resize((int(im.width*h/im.height),h), Image.LANCZOS)
    a=np.asarray(im).astype(np.float32)/255
    L=0.3*a[...,0]+0.59*a[...,1]+0.11*a[...,2]
    Li=Image.fromarray((L*255).astype(np.uint8))
    small=Li.resize((max(8,Li.width//8),max(8,Li.height//8)), Image.BOX).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(3))
    paper=np.asarray(small.resize(Li.size, Image.BILINEAR)).astype(np.float32)/255
    paper=np.maximum(paper, np.percentile(L,92)*0.97)
    dark=np.clip((paper-L)/np.maximum(0.05,paper-0.12),0,1)
    alpha=np.clip((dark-floor)/(1-floor)*1.2,0,1)**0.85
    if feather>0:
        hh,ww=alpha.shape; y=np.linspace(0,1,hh)[:,None]; x=np.linspace(0,1,ww)[None,:]
        e=np.minimum(np.minimum(x,1-x),np.minimum(y,1-y))
        alpha*=np.clip(e/feather,0,1)**1.5
    rgba=np.zeros(a.shape[:2]+(4,),np.uint8)
    if colour:
        rgba[...,:3]=(np.clip(a - (paper[...,None]-0.94),0,1)*255).astype(np.uint8)
        sat=np.max(a,axis=2)-np.min(a,axis=2)
        alpha=np.clip(np.maximum(alpha, sat*3),0,1)
    else:
        rgba[...,0]=INK[0]; rgba[...,1]=INK[1]; rgba[...,2]=INK[2]
    rgba[...,3]=(alpha*255).astype(np.uint8)
    Image.fromarray(rgba).save(out, 'WEBP', quality=62, method=4)
    return Image.fromarray(rgba).size
jobs=[
 (fetch(IIIF.format('V0043559', 2000), 'V0043559.jpg'),(0.035,0.025,0.415,0.215),os.path.join(OUT, 'acorn.webp'),600,False,0.0,0.2),
 (page(183),(0.24,0.165,0.80,0.42),os.path.join(OUT, 'young.webp'),700,False,0.0,0.3),
 (page(181),(0.22,0.485,0.78,0.79),os.path.join(OUT, 'sapling.webp'),700,False,0.0,0.3),
 (fetch(IIIF.format('V0043124', 1600), 'V0043124.jpg'),(0.03,0.02,0.97,0.905),os.path.join(OUT, 'lane.webp'),950,False,0.06),
 (fetch(IIIF.format('V0042982', 1600), 'V0042982.jpg'),(0.04,0.03,0.96,0.905),os.path.join(OUT, 'prime.webp'),950,False,0.06),
 (fetch(IIIF.format('V0042984', 1600), 'V0042984.jpg'),(0.0,0.02,1.0,0.94),os.path.join(OUT, 'great.webp'),950,False,0.06),
 (fetch(IIIF.format('V0042981', 1600), 'V0042981.jpg'),(0.0,0.02,1.0,0.97),os.path.join(OUT, 'ancient.webp'),950,False,0.06),
 (page(7, 900),(0.3,0.30,0.92,0.635),os.path.join(OUT, 'winter.webp'),700,False,0.0,0.25),
]
for j in jobs: print(j[2], ink(*j), flush=True)
