import sys, numpy as np
from PIL import Image
f,cx,cy,out=sys.argv[1],float(sys.argv[2]),float(sys.argv[3]),sys.argv[4]
im=np.asarray(Image.open(f).convert('RGB'),dtype=np.float32); h,w,_=im.shape
corners=[(0,0),(w,0),(0,h),(w,h)]
rs=[np.hypot(x-cx,y-cy) for x,y in corners]; r0,r1=min(rs),max(rs)
th=[np.arctan2(y-cy,x-cx) for x,y in corners]
# angular span: unwrap around mean
m=np.arctan2(h/2-cy,w/2-cx); d=[(t-m+np.pi)%(2*np.pi)-np.pi for t in th]
t0,t1=m+min(d),m+max(d)
rm=(r0+r1)/2; W=int((t1-t0)*rm); Hh=int(r1-r0)
T=t0+(np.arange(W)/W)*(t1-t0); R=r0+np.arange(Hh)
TT,RR=np.meshgrid(T,R)
X=cx+RR*np.cos(TT); Y=cy+RR*np.sin(TT)
ok=(X>=0)&(X<w-1)&(Y>=0)&(Y<h-1)
xi=np.clip(X.astype(int),0,w-1); yi=np.clip(Y.astype(int),0,h-1)
o=im[yi,xi]; o[~ok]=0
Image.fromarray(o.astype(np.uint8)).save(out); print(out,W,Hh)
