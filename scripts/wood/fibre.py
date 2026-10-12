import sys, numpy as np
from PIL import Image, ImageFilter
src,box,out,size=sys.argv[1],tuple(map(int,sys.argv[2].split(','))),sys.argv[3],int(sys.argv[4])
sig=float(sys.argv[5]); rows=sys.argv[6]=='rows'
im=Image.open(src).convert('RGB').crop(box)
g=np.asarray(im,dtype=np.float32)[...,1]  # green: latewood/fibre contrast
lo=np.asarray(Image.fromarray(g.astype(np.uint8)).filter(ImageFilter.GaussianBlur(sig)),dtype=np.float32)
hp=g-lo
if rows: hp=hp-hp.mean(1,keepdims=True)
hp=hp; hp=hp/ (np.percentile(np.abs(hp),98)+1e-3)
hp=np.clip(hp,-1,1)
h,w=hp.shape; s=min(h,w,size)
hp=hp[:s,:s]
F=s//6; t=np.linspace(0,1,F)
hp[:,:F]=hp[:,:F]*t[None,:]+hp[:,s-F:]*(1-t[None,:]); hp=hp[:,:s-F]
hp[:F,:]=hp[:F,:]*t[:,None]+hp[s-F:,:]*(1-t[:,None]); hp=hp[:s-F,:]
Image.fromarray(np.clip(128+127*hp,0,255).astype(np.uint8)).save(out); print(out,hp.shape)
