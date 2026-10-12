import sys, numpy as np
from PIL import Image
f,cx,cy=sys.argv[1],float(sys.argv[2]),float(sys.argv[3])
s=4
im=np.asarray(Image.open(f).convert('L'),dtype=np.float32)[::s,::s]; h,w=im.shape
def unroll(cx,cy):
    cx/=s; cy/=s
    rs=[np.hypot(x-cx,y-cy) for x,y in [(0,0),(w,0),(0,h),(w,h)]]; r0,r1=min(rs),max(rs)
    m=np.arctan2(h/2-cy,w/2-cx); d=[(np.arctan2(y-cy,x-cx)-m+np.pi)%(2*np.pi)-np.pi for x,y in [(0,0),(w,0),(0,h),(w,h)]]
    t0,t1=m+min(d),m+max(d); rm=(r0+r1)/2; W=int((t1-t0)*rm); Hh=int(r1-r0)
    TT,RR=np.meshgrid(t0+np.arange(W)/W*(t1-t0), r0+np.arange(Hh))
    X=cx+RR*np.cos(TT); Y=cy+RR*np.sin(TT); ok=(X>=0)&(X<w-1)&(Y>=0)&(Y<h-1)
    return im[np.clip(Y.astype(int),0,h-1),np.clip(X.astype(int),0,w-1)],ok
def score(cx,cy):
    u,ok=unroll(cx,cy)
    def hp(p): return p-np.convolve(p,np.ones(9)/9,mode='same')
    c=ok.sum(0); col=np.where(c>30,(u*ok).sum(0)/np.maximum(c,1),np.nan)
    r=ok.sum(1); row=np.where(r>30,(u*ok).sum(1)/np.maximum(r,1),np.nan)
    col=col[~np.isnan(col)]; row=row[~np.isnan(row)]
    return np.var(hp(col)[5:-5])+np.var(hp(row)[5:-5])
best=(score(cx,cy),cx,cy)
for step in [400,200,100,50,25,12]:
  improved=True
  while improved:
    improved=False
    sc,x0,y0=best
    for dx in (-step,0,step):
      for dy in (-step,0,step):
        v=score(x0+dx,y0+dy)
        if v>best[0]+1e-6: best=(v,x0+dx,y0+dy); improved=True
print(best[1],best[2],best[0])
