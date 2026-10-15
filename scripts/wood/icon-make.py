# Well Rounded's icon (src/rings/icon/): python3 scripts/wood/icon-make.py 3
# The icon: a slice pressed in heavy ink, as the opening prints it: a few years round an off-centre heart,
# each year's latewood a solid, rough-edged band, the ink broken along the grain and by the paper's tooth.
import numpy as np, sys
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as nd
S=1024; rng=np.random.default_rng(int(sys.argv[1]) if len(sys.argv)>1 else 7)
N=720; a=np.linspace(0,2*np.pi,N,endpoint=False)
def smooth_noise(k,amp):
    out=np.zeros(N)
    for f in range(1,k+1): out+=rng.normal()*amp/f**1.3*np.cos(f*a+rng.uniform(0,2*np.pi))
    return out
cx,cy=S*0.5,S*0.5
# the heart a little off the middle; years wider on one side (toward the light)
hx,hy=S*0.5-30,S*0.5+22
lean=np.cos(a-0.6)*0.32
rings=[]; r=np.full(N,16.0); anomaly=np.zeros(N)
years=[70,58,34,50,28,42,30]
for i,yw in enumerate(years):
    anomaly=0.7*anomaly+0.3*smooth_noise(6,0.45)
    r=r+yw*(1+lean+anomaly)*(0.85+0.3*rng.random())
    rings.append(r.copy())
# scale so the outer ring sits within the square with a margin
outer=rings[-1]; xs=hx+outer*np.cos(a); ys=hy-outer*np.sin(a)
k=min((S*0.44)/max(np.abs(xs-cx).max(),1), (S*0.44)/max(np.abs(ys-cy).max(),1))
rings=[rr*k for rr in rings]
img=Image.new('L',(S,S),0); d=ImageDraw.Draw(img)
prev=np.full(N,16.0*k)
for i,o in enumerate(rings):
    share=0.32+0.28*rng.random() if i<len(rings)-1 else 0.55
    jit_o=o+smooth_noise(40,2.5)+nd.gaussian_filter1d(rng.normal(0,1.0,N),1.5,mode='wrap'); inn=o-share*(o-prev)+smooth_noise(40,3.5)+nd.gaussian_filter1d(rng.normal(0,1.4,N),1.5,mode='wrap')
    band=Image.new('L',(S,S),0); bd=ImageDraw.Draw(band)
    bd.polygon([(hx+jit_o[j]*np.cos(a[j]),hy-jit_o[j]*np.sin(a[j])) for j in range(N)],fill=255)
    bd.polygon([(hx+inn[j]*np.cos(a[j]),hy-inn[j]*np.sin(a[j])) for j in range(N)],fill=0)
    img=Image.fromarray(np.maximum(np.asarray(img),np.asarray(band))); d=ImageDraw.Draw(img)
    prev=o
d.ellipse((hx-9,hy-9,hx+9,hy+9),fill=255)
# a check: a crack from the bark in toward the heart
cr=[]; ang=4.0; rr=rings[-1][int(ang/(2*np.pi)*N)%N]+6
for t in np.linspace(0,1,60):
    R=rr*(1-0.7*t); ang+=rng.normal(0,0.02)+(0.04*rng.normal() if rng.random()<0.12 else 0); w=(16*(1-t)**1.2+0.8)
    cr.append((hx+R*np.cos(ang),hy-R*np.sin(ang),w))
ink=np.asarray(img).astype(float)/255
cm=Image.new('L',(S,S),0); dc=ImageDraw.Draw(cm)
for (x0,y0,w0),(x1,y1,w1) in zip(cr,cr[1:]): dc.line((x0,y0,x1,y1),fill=255,width=max(1,int(w0*2)))
ink*=1-np.asarray(cm.filter(ImageFilter.GaussianBlur(0.8))).astype(float)/255
# the press: grain round the rings, starved patches, the paper's tooth
yy,xx=np.mgrid[0:S,0:S]; dx=xx-hx; dy=yy-hy; R=np.hypot(dx,dy); th=np.arctan2(dy,dx)
def vn(sx,sy,seed):
    g=rng.random((64,64)); return nd.map_coordinates(g,[sy%63,sx%63],order=1,mode='wrap')
grain=0.6*vn(R/2.2+np.cos(th)*3,np.sin(th)*R/40+np.cos(th)*R/40,1)+0.4*vn(R/6+11,(np.sin(th)+np.cos(th))*R/110+5,2)
starve=nd.gaussian_filter(rng.random((S,S)),40); starve=(starve-starve.min())/(starve.max()-starve.min())
tooth=rng.random((S,S))
v=ink*(1.05-0.75*np.clip((grain-0.6)/0.3,0,1))
v*=1-0.7*np.clip((starve-0.7)/0.15,0,1)*(tooth<0.6)
v=np.clip(v,0,1)*(tooth>0.04)
v=nd.gaussian_filter(v,0.6)
P=np.array([244,239,228.]); I=np.array([36,28,23.])
# paper with a faint fibre
paper=1-0.03*nd.gaussian_filter(rng.random((S,S)),1.2)
rgb=(P*paper[...,None])*(1-v[...,None])+I*v[...,None]
im=Image.fromarray(rgb.clip(0,255).astype(np.uint8))
im.save('icon-1024.png')
for s in (180,192,512): im.resize((s,s),Image.LANCZOS).save(f'icon-{s}.png')
