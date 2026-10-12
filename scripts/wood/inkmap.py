import sys, numpy as np
from PIL import Image
src,out,kind=sys.argv[1],sys.argv[2],sys.argv[3]
YR=int(sys.argv[5]) if len(sys.argv)>5 else 64
from PIL import ImageFilter
L=np.asarray(Image.open(src).convert('L'),dtype=np.float32); h,w=L.shape; N=h//YR
spacing=float(sys.argv[4]) if len(sys.argv)>4 else 105
# keep the wood's aspect: a year is YR rows, so along shrinks by YR/spacing
W=int(round(w*YR/spacing))
L=np.asarray(Image.fromarray(L).resize((W,h),Image.LANCZOS),dtype=np.float32)
Lb=np.asarray(Image.fromarray(np.clip(L,0,255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2)),dtype=np.float32)
v=((np.arange(h)%YR)+0.5)/YR
ink=np.zeros_like(L)
for y in range(N):
    s=slice(y*YR,(y+1)*YR); Ly=L[s]; Lby=Lb[s]; med=np.median(Ly)
    vv=v[s][:,None]
    if kind=='oak':
        base=np.interp(vv,[0,0.3,0.4,1],[0.52,0.54,0.9,0.93])
        pore=np.clip((0.84*med-Lby)/(0.1*med),0,1)
        ray=np.clip((Ly-1.1*med)/(0.14*med),0,1)
        tex=np.clip(1+0.15*(med-Lby)/med,0.9,1.06)
        ink[s]=base*tex*(1-pore)*(1-0.55*ray)
    else:
        # darkness relative to the year's range: latewood takes the ink
        lo,hi=np.percentile(Ly,3),np.percentile(Ly,97)
        d=np.clip((hi-Ly)/(hi-lo+1e-3),0,1)
        ink[s]=np.clip(0.12+1.05*d**1.3,0,1)
# tile along: crossfade the last F columns into the first
F=max(8,W//6)
t=np.linspace(0,1,F)[None,:]
ink[:,:F]=ink[:,:F]*t+ink[:,W-F:]*(1-t)
ink=ink[:,:W-F]
Image.fromarray(np.clip(ink*255,0,255).astype(np.uint8)).save(out); print(out,ink.shape,N)
