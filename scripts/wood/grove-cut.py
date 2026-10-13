# The grove's trees cut free of Strutt's plates (sylvabritannicao00stru pages n40, n144, n218, n242 at w1400, saved as sb-<page>.jpg). Writes tree-<kind>.png.
from PIL import Image, ImageDraw
import numpy as np
from scipy import ndimage as nd
OFF=32
T={'oak':(40,(250,850,1600,1975),None,(0.5,0.4)),
   'ash':(144,(180,850,1590,1975),None,(0.5,0.5)),
   'maple':(218,(270,880,1380,1985),[(270,880),(1380,880),(1380,1420),(1130,1420),(1100,1985),(380,1985),(380,1480),(270,1480)],(0.5,0.4)),
   'pine':(242,(150,700,1700,2150),[(150,700),(1700,700),(1700,1080),(1200,1150),(960,1300),(950,2150),(660,2150),(680,1300),(450,1200),(150,1200)],(0.45,0.15))}
for k,(n,b,poly,seed) in T.items():
    im=Image.open(f'sb-{n}.jpg').convert('L').crop(b)
    a=nd.gaussian_filter(np.asarray(im).astype(float),0.6)
    paper=nd.gaussian_filter(nd.maximum_filter(nd.gaussian_filter(a,3),41),25)
    al=np.clip((paper-a-OFF)/70,0,1)**0.8
    H,W=al.shape
    den=nd.gaussian_filter((al>0.35).astype(float),9)
    m=den>0.06; lab,_=nd.label(m); l=lab[int(seed[1]*H),int(seed[0]*W)]
    if not l: l=np.bincount(lab.ravel())[1:].argmax()+1
    blob=nd.binary_fill_holes(lab==l); keep=nd.gaussian_filter(nd.binary_dilation(blob,iterations=6).astype(float),5)
    if poly:
        mk=Image.new('L',(W,H),0); ImageDraw.Draw(mk).polygon([(x-b[0],y-b[1]) for x,y in poly],fill=255)
        keep=keep*nd.gaussian_filter(np.asarray(mk).astype(float)/255,70)
    yy=np.arange(H)/H; xs=np.clip(np.minimum(np.arange(W),W-1-np.arange(W))/(0.3*W),0,1); xs=xs*xs*(3-2*xs)
    side=np.outer(np.clip((0.75-yy)/0.25,0,1),np.ones(W)); side=side+(1-side)*xs[None,:]
    keep=keep*side*np.outer(np.clip((H-1-np.arange(H))/(0.01*H),0,1),np.ones(W))
    out=np.zeros((H,W,4),np.uint8); out[...,0]=34;out[...,1]=28;out[...,2]=24; out[...,3]=(np.clip(al*keep,0,1)*255).astype(np.uint8)
    Image.fromarray(out).save(f'tree-{k}.png')
def ink(path): return np.asarray(Image.open(path)).astype(float)[...,3]/255
def grove(W,H,base,plan,out):
    A=np.zeros((H,W))
    for k,x,h in plan:
        a=ink(f'tree-{k}.png' if not k.startswith('seed') else f'seedc-{k[5:]}.png')
        s=h/a.shape[0]; im=Image.fromarray((a*255).astype(np.uint8)).resize((max(1,int(a.shape[1]*s)),max(1,int(a.shape[0]*s))),Image.LANCZOS)
        b=np.asarray(im).astype(float)/255; bh,bw=b.shape; x0=int(x-bw/2); y0=int(base-bh)
        xa,xb=max(0,x0),min(W,x0+bw); ya,yb=max(0,y0),min(H,y0+bh)
        A[ya:yb,xa:xb]=1-(1-A[ya:yb,xa:xb])*(1-b[ya-y0:yb-y0,xa-x0:xb-x0])
    P=np.array([244,239,228.]); I=np.array([34,28,24.])
    Image.fromarray((P*(1-A[...,None])+I*A[...,None]).astype(np.uint8)).save(out+'.png')
    o=np.zeros((H,W,4),np.uint8); o[...,:3]=I; o[...,3]=(A*255).astype(np.uint8); Image.fromarray(o).save(out+'-t.png')
grove(3200,1250,1180,[('oak',520,980),('ash',1300,900),('pine',2030,1150),('maple',2700,760),('seed-maple',3080,46)],'grove-wide')
grove(1560,1100,1040,[('oak',300,520),('ash',720,470),('pine',1080,620),('maple',1390,400),('seed-maple',1530,26)],'grove-phone')
Image.open('grove-wide.png').resize((1600,625)).save('gw-s.png')
