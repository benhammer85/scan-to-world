# Cuts each seed whole from its plate (run in a folder holding the plate scans: pl-<kind>.jpg, Sargent's
# Silva of North America plates from the Internet Archive, mobot31753000329xxx; and ls-full.jpg, Le Maout and
# Decaisne's page n561 of generalsystemofb00lemauoft). Writes seedc-<kind>.png; then seeds-press.py.
# Each seed cut from its plate whole: the figure's own ink, nothing faded into it, nothing of its neighbours.
from PIL import Image, ImageDraw
import numpy as np
from scipy import ndimage as nd
ol=Image.open('ls-full.jpg').convert('L'); w,h=ol.size; ox,oy=int(w*0.72),int(h*0.07)
# name: (image, box, how): 'line' = a figure drawn in outline (keep the ink components touching the seed
# point's blob); 'body' = a shaded solid (keep what lies on its filled form); extra masks in plate coords.
S={
 'oak':('pl-oak.jpg',(520,3450,960,4010),'body',{'runs':40}),
 'ash':('pl-ash.jpg',(2130,3700,2290,4320),'line',{'drop':[(2130,3770,2180,3830)]}),
 'cherry':('pl-cherry.jpg',(1380,3460,1620,3760),'circle',{'c':(1505,3642,96),'stalk':[(1505,3470),(1530,3470),(1532,3560),(1503,3560)]}),
 'maple':('pl-maple.jpg',(1690,3770,2340,4310),'line',{'cut':3795}),
 'birch':('pl-birch.jpg',(2290,4010,2620,4270),'line',{}),
 'pine':('pl-pine.jpg',(1660,4100,1790,4400),'line',{}),
 'redwood':('pl-redwood.jpg',(1140,2610,1545,3125),'body',{'reach':3,'open':9,'poly':[(1170,2700),(1290,2622),(1440,2632),(1540,2760),(1540,2850),(1500,2950),(1430,3080),(1300,3115),(1200,3060),(1150,2900)]}),
 'bristlecone':('pl-bristlecone.jpg',(1620,2540,2470,3830),'body',{'reach':4,'open':9,'runs':26,'poly':[(1790,2560),(1950,2545),(2070,2620),(2160,2700),(2215,2800),(2255,2900),(2295,2980),(2330,3060),(2380,3150),(2440,3260),(2470,3830),(1620,3830),(1620,2880),(1680,2700),(1730,2610)]}),
 'olive':(None,(ox+140,oy+60,ox+420,oy+420),'body',{'runs':40}),
}
for k,(f,b,how,ex) in S.items():
    im=(ol if f is None else Image.open(f).convert('L')).crop(b)
    a=nd.gaussian_filter(np.asarray(im).astype(float),0.5)
    paper=nd.gaussian_filter(nd.maximum_filter(nd.gaussian_filter(a,2),31),20)
    al=np.clip((paper-a-10)/90,0,1)
    H,W=al.shape; yy,xx=np.mgrid[0:H,0:W]
    if 'cut' in ex: al[:max(0,ex['cut']-b[1])]=0
    for (x0,y0,x1,y1) in ex.get('drop',[]): al[y0-b[1]:y1-b[1],x0-b[0]:x1-b[0]]=0
    if how=='circle':
        cx,cy,r=ex['c']; keep=(xx+b[0]-cx)**2+(yy+b[1]-cy)**2<=r*r
        m=Image.new('L',(W,H),0); ImageDraw.Draw(m).polygon([(x-b[0],y-b[1]) for x,y in ex['stalk']],fill=1)
        keep=keep|np.asarray(m).astype(bool)
    elif how=='body':
        dense=nd.gaussian_filter(al,3)>0.12
        dense=nd.binary_opening(dense,iterations=ex.get('open',4))
        lab,n=nd.label(dense); sizes=nd.sum(dense,lab,range(1,n+1)); body=lab==(1+sizes.argmax())
        body=nd.binary_fill_holes(nd.binary_closing(body,iterations=6))
        keep=nd.binary_dilation(body,iterations=int(ex.get('reach',7)))
        # (and whatever thin ink runs on from it, a prickle, a stalk: connected, not far)
        if ex.get('runs'):
            ink=al>0.2; lab2,_=nd.label(nd.binary_dilation(ink,iterations=1)); ids=np.unique(lab2[keep&ink]); ids=ids[ids>0]
            keep=keep|(np.isin(lab2,ids)&nd.binary_dilation(body,iterations=ex['runs']))
    else:
        ink=nd.binary_dilation(al>0.12,iterations=3); lab,n=nd.label(ink); sizes=nd.sum(ink,lab,range(1,n+1))
        keep=np.isin(lab,1+np.where(sizes>=0.08*sizes.max())[0])
        keep=nd.binary_fill_holes(keep)
    if 'poly' in ex:
        m=Image.new('L',(W,H),0); ImageDraw.Draw(m).polygon([(x-b[0],y-b[1]) for x,y in ex['poly']],fill=1); keep=keep&np.asarray(m).astype(bool)
    al=al*keep
    # (Stray marks: small ink apart from the figure.)
    lab,n=nd.label(nd.binary_dilation(al>0.1,iterations=2))
    if n>1:
        sz=nd.sum(al>0.1,lab,range(1,n+1)); small=np.isin(lab,1+np.where(sz<0.01*sz.max())[0]); al[small]=0
    ys,xs=np.where(al>0.05); p=6; al=al[max(0,ys.min()-p):ys.max()+p,max(0,xs.min()-p):xs.max()+p]
    out=np.zeros(al.shape+(4,),np.uint8); out[...,0]=34;out[...,1]=28;out[...,2]=24; out[...,3]=(al*255).astype(np.uint8)
    Image.fromarray(out).save(f'seedc-{k}.png'); print(k,al.shape)
