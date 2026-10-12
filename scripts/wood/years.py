import sys, numpy as np
from PIL import Image
src,x0,x1,y0,y1,out=sys.argv[1],*map(int,sys.argv[2:6]),sys.argv[6]
mode=sys.argv[7] if len(sys.argv)>7 else 'pores'
MINSP=int(sys.argv[9]) if len(sys.argv)>9 else 40
a=np.asarray(Image.open(src).convert('L'),dtype=np.float32)[y0:y1,x0:x1]; h,w=a.shape
def smooth(v,k):
    k=int(k); return np.convolve(np.pad(v,(k,k),mode='edge'),np.ones(2*k+1)/(2*k+1),mode='same')[k:-k]
# per column-window profiles
win=24; cols=np.arange(0,w-win+1,win//2)
if mode=='pores':
    med=np.median(a); dark=(a<med*0.55).astype(np.float32)
    sig=dark
else:  # latewood darkness
    sig=-a
prof=[smooth(sig[:,c:c+win].mean(1),2) for c in cols]
# global row profile to find approximate boundaries
g=smooth(np.mean(prof,0),3)
d=np.diff(g); 
if mode!='pores': d=-d  # light->? boundary at latewood->earlywood: darkness drops
# boundary = strong rises of pore density (top of pore band); pick peaks spaced
cand=[i for i in range(3,len(d)-3) if d[i]==d[i-3:i+4].max() and d[i]>0]
cand.sort(key=lambda i:-d[i])
sel=[]
for i in cand:
    if all(abs(i-j)>MINSP for j in sel): sel.append(i)
thr=np.median([d[i] for i in sel[:30]])*0.35
sel=sorted(i for i in sel if d[i]>thr)
print('global boundaries',sel, 'spacing', np.diff(sel))
# refine per column window: nearest strong rise within +-25 rows
B=np.zeros((len(sel),len(cols)))
for ci,p in enumerate(prof):
    dd=np.diff(p) if mode=='pores' else -np.diff(p)
    for bi,b in enumerate(sel):
        lo,hi=max(0,b-22),min(len(dd),b+23); B[bi,ci]=lo+np.argmax(dd[lo:hi])
# smooth each boundary along columns
for bi in range(len(sel)): B[bi]=smooth(B[bi],1)
np.save(out+'.npy',B); np.save(out+'-cols.npy',cols+win/2)
# rectify: each year -> 64 rows
YR=int(sys.argv[8]) if len(sys.argv)>8 else 64; xs=np.arange(w); res=[]
for bi in range(len(sel)-1):
    top=np.interp(xs,cols+win/2,B[bi]); bot=np.interp(xs,cols+win/2,B[bi+1])
    t=(np.arange(YR)+0.5)/YR
    Y=top[None,:]+(bot-top)[None,:]*t[:,None]
    yi=np.clip(Y,0,h-1.001); f=yi-np.floor(yi); yl=np.floor(yi).astype(int)
    v=a[yl,xs[None,:]]*(1-f)+a[yl+1,xs[None,:]]*f
    res.append(v)
R=np.concatenate(res,0)
Image.fromarray(np.clip(R,0,255).astype(np.uint8)).save(out+'.png'); print(out, R.shape)
