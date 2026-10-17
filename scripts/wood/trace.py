# Trace ring boundaries in an unrolled section (rings run across, outward is down) as smooth paths, then
# straighten each year into YR rows. Usage: trace.py src out [MINSP] [top] [YR] [PEN] [OFF]: MINSP the least
# rows between edges, top the rows to skip, PEN how stiffly a path keeps its line, OFF how many rows earlier to
# put each edge (the blur sets it a little late).
import sys, numpy as np
from PIL import Image, ImageFilter
src,out=sys.argv[1],sys.argv[2]
PEN=float(sys.argv[6]) if len(sys.argv)>6 else 0.6
OFF=float(sys.argv[7]) if len(sys.argv)>7 else 0
MINSP=int(sys.argv[3]) if len(sys.argv)>3 else 16
TOP=int(sys.argv[4]) if len(sys.argv)>4 else 0
YR=int(sys.argv[5]) if len(sys.argv)>5 else 112
im=Image.open(src).convert('RGB')
a=np.asarray(im,dtype=np.float32).mean(2)
b=np.asarray(Image.fromarray(a.astype(np.uint8)).filter(ImageFilter.BoxBlur(2)),dtype=np.float32)
h,w=a.shape
# Edge: going outward, dark latewood gives way to light earlywood.
E=np.zeros_like(b); E[1:-1]=b[2:]-b[:-2]
# smooth along the ring
k=9; ker=np.ones(k)/k
E=np.apply_along_axis(lambda r: np.convolve(r,ker,mode='same'),1,E)
g=E.mean(1); g=np.convolve(g,np.ones(5)/5,mode='same')
cand=[i for i in range(max(3,TOP),h-3) if g[i]==g[i-3:i+4].max() and g[i]>0]
cand.sort(key=lambda i:-g[i]); sel=[]
for i in cand:
  if all(abs(i-j)>MINSP for j in sel): sel.append(i)
thr=np.median([g[i] for i in sel[:30]])*0.3
sel=sorted(i for i in sel if g[i]>thr)
# DP each boundary within a band about its guess, slope at most 1 px a column, penalised.
paths=[]
for n,y0 in enumerate(sel):
  lo=y0-(y0-sel[n-1])*0.45 if n else max(0,y0-MINSP); hi=y0+(sel[n+1]-y0)*0.45 if n+1<len(sel) else min(h-1,y0+MINSP)
  ys=np.arange(int(lo),int(hi)+1); m=len(ys)
  cost=np.zeros((w,m)); back=np.zeros((w,m),dtype=int)
  cost[0]=-E[ys,0]
  for x in range(1,w):
    best=np.full(m,1e9); arg=np.zeros(m,dtype=int)
    for d in (-1,0,1):
      prev=np.roll(cost[x-1],d)+PEN*abs(d)
      if d==1: prev[0]=1e9
      if d==-1: prev[-1]=1e9
      better=prev<best; best[better]=prev[better]; arg[better]=(np.arange(m)-d)[better]
    cost[x]=best-E[ys,x]; back[x]=arg
  j=int(np.argmin(cost[-1])); p=np.zeros(w)
  for x in range(w-1,-1,-1): p[x]=ys[j]; j=back[x,j]
  paths.append(np.convolve(np.pad(p,(4,4),mode='edge'),np.ones(9)/9,mode='valid'))
P=np.array(paths)
for i in range(1,len(P)): P[i]=np.maximum(P[i],P[i-1]+3)
P=P-OFF
np.save(out+'.npy',P)
xs=np.arange(w); res=[]
for i in range(len(P)-1):
  top,bot=P[i],P[i+1]; t=(np.arange(YR)+0.5)/YR
  Y=top[None,:]+(bot-top)[None,:]*t[:,None]; yi=np.clip(Y,0,h-1.001); f=yi-np.floor(yi); yl=np.floor(yi).astype(int)
  res.append(a[yl,xs[None,:]]*(1-f)+a[yl+1,xs[None,:]]*f)
R=np.concatenate(res,0)
Image.fromarray(np.clip(R,0,255).astype(np.uint8)).save(out+'.png')
print(out,'years',len(P)-1,'spacing',np.diff(sel).tolist())
