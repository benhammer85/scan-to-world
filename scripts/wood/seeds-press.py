# Each engraved seed pressed as the slices print: solid ink or paper. Its own outline and strong strokes
# kept as they were cut; its shading turned to lines following its form in from that outline (fine where
# lit, closing up solid in shade); the ink's take broken by the paper's tooth and Munch's mottle.
from PIL import Image
import numpy as np
from scipy import ndimage as nd
sea=np.asarray(Image.open('src/rings/wood/munch-sea-ink.png').convert('L')).astype(float)/255
H_CSS={'oak':84,'ash':112,'cherry':62,'maple':92,'birch':52,'pine':64,'redwood':72,'bristlecone':118,'olive':66,'fir':96,'juniper':60}
import os
if os.environ.get('ONLY'): H_CSS={k:v for k,v in H_CSS.items() if k in os.environ['ONLY'].split(',')}
FAINT={'pine':0.09,'maple':0.13}
CONES={'redwood','bristlecone','fir'}
LINES={'oak','cherry','redwood','bristlecone','olive','fir','juniper'}   # (shaded forms; the rest are drawn in line)
rng=np.random.default_rng(7); SS=4
for k,hc in H_CSS.items():
    a0=np.asarray(Image.open(f'seedc-{k}.png')).astype(float)[...,3]/255
    Hf=hc*2; Wf=max(1,round(a0.shape[1]*Hf/a0.shape[0])); Hw,Ww=Hf*SS,Wf*SS
    a=np.asarray(Image.fromarray((a0*255).astype(np.uint8)).resize((Ww,Hw),Image.LANCZOS)).astype(float)/255
    tooth=nd.zoom(rng.random((Hf+2,Wf+2)),SS,order=1)[:Hw,:Ww]
    # Its strokes: what the engraver cut firmly, a hair fattened by the press.
    lo,bl=(0.2,0.65) if k not in LINES else ((0.5,0.45) if k in CONES else (0.42,0.45))
    lo=FAINT.get(k,lo)
    strokes=np.clip((nd.gaussian_filter(a,bl*SS)-lo+0.06*(tooth-0.5))/0.08,0,1)
    ink=strokes
    if k in LINES:
        # Its form: the figure filled to its own outline, and a hair inside it (so no line runs outside).
        form=nd.binary_fill_holes(nd.binary_closing(nd.gaussian_filter(a,0.6*SS)>0.12,iterations=2*SS))
        inside=nd.distance_transform_edt(form)/SS
        tone=np.clip((nd.gaussian_filter(a,0.9*SS)-0.08)/0.8,0,1)**(1.5 if k in CONES else 0.9)
        ph=(inside/2.3)%1.0
        lines=np.clip((tone*1.05-np.abs(ph-0.5)*2+0.02)/0.12,0,1)*(inside>0.6)
        ink=np.maximum(ink,lines)
    # How the ink took: Munch's mottle where it's solid, through the paper's tooth.
    ty=(np.arange(Hw)//SS)%sea.shape[0]; tx=(np.arange(Ww)//SS+int(rng.integers(0,200)))%sea.shape[1]
    take=sea[np.ix_(ty,tx)]; solid=nd.gaussian_filter(ink,1.5*SS)
    ink*=1-0.85*np.clip((0.62-take)/0.18,0,1)*np.clip((solid-0.55)/0.3,0,1)*(tooth>0.35)
    f=ink.reshape(Hf,SS,Wf,SS).mean((1,3))
    out=np.zeros((Hf,Wf,4),np.uint8); out[...,0]=36;out[...,1]=28;out[...,2]=23; out[...,3]=(np.clip(f,0,1)*255).astype(np.uint8)
    Image.fromarray(out).save(f'seedp-{k}.png')
