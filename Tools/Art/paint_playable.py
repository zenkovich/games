"""Paint compact terrain, interaction decals and UI, plus the golden brain variant."""
from pathlib import Path
import math, random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
ROOT=Path(__file__).resolve().parents[2]; OUT=ROOT/'Assets/Models'; UI=ROOT/'Assets/UI'
rng=random.Random(12)
w,h=896,1024
ys,xs=np.mgrid[0:h,0:w];x=xs/w*22-11;y=(1-ys/h)*26-12
variation=4*np.sin(x*.9+y*.5)+3*np.sin(y*1.1-x*.7)
base=np.empty((h,w,3));base[:]=[119,176,76];base+=variation[:,:,None]
roads=[((-11,-8.7),(11,-8.7),1.0),((7.0,-8.7),(7.0,10.5),1.8)]
for lane in [-4.6,-.5,3.7,7.8]:roads.append(((-10.0,lane),(7.0,lane),.40))
for a,b,width in roads:
 ax,ay=a;bx,by=b;dx=bx-ax;dy=by-ay;t=np.clip(((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy),0,1)
 dist=np.sqrt((x-ax-t*dx)**2+(y-ay-t*dy)**2)
 edge=dist-width+.045*np.sin(y*12+x*9)
 mask=np.clip((.13-edge)/.24,0,1)
 color=np.array([218,190,134])+variation[:,:,None]*.45
 base=base*(1-mask[:,:,None])+color*mask[:,:,None]
im=Image.fromarray(np.uint8(np.clip(base,0,255))).convert('RGB');d=ImageDraw.Draw(im)
def xy(x,y):return((x+11)/22*w,(1-(y+12)/26)*h)
for i in range(2600):
 xx=rng.uniform(-10.9,10.9);yy=rng.uniform(-11.8,13.8)
 if abs(yy+8.7)<1.2 or abs(xx-7)<2.0:continue
 if -9.8<xx<5.1 and any(abs(yy-c)<1.75 for c in [-2.6,1.6,5.8]):continue
 px,py=xy(xx,yy);c=rng.choice([(100,159,61),(144,190,91),(159,195,109)])
 d.line([(px-2,py-4),(px,py),(px+2,py-5)],fill=c,width=1)
for row in range(3):
 for col in range(42):
  xx=-10.9+col*.53+(row%2)*.265;yy=-9.25+row*.51
  ax,ay=xy(xx,yy);bx,by=xy(xx+.48,yy+.45)
  d.rounded_rectangle((ax,by,bx,ay),radius=3,fill=rng.choice([(207,180,130),(218,195,148),(223,199,147)]),outline=(193,166,120),width=1)
im.save(OUT/'TerrainPaint.png',optimize=True)
# Rounded frame, amber inner line, and a distinct directional chevron.
atlas=Image.new('RGBA',(256,128),(0,0,0,0));d=ImageDraw.Draw(atlas)
d.rounded_rectangle((5,5,123,123),radius=25,fill=(69,157,136,235),outline=(231,255,187,255),width=6)
d.rounded_rectangle((16,16,112,112),radius=16,outline=(113,200,148,255),width=2)
d.polygon([(156,22),(184,50),(212,22),(231,42),(184,89),(137,42)],fill=(255,220,106,255))
d.rectangle((240,98,255,127),fill=(243,255,194,255))
atlas.save(OUT/'PadPaint.png')
# The decals are opaque outlined meshes, keeping the deferred path depth-correct.
def mesh(name,polys,uvs):
 with (OUT/(name+'.obj')).open('w') as f:
  count=1
  for poly,uv in zip(polys,uvs):
   for xx,yy in poly:f.write(f'v {xx:.3f} {yy:.3f} 0\n')
   for a,b in uv:f.write(f'vt {a:.5f} {b:.5f}\n')
   for _ in poly:f.write('vn 0 0 1\n')
   for j in range(1,len(poly)-1):f.write('f '+' '.join(f'{k}/{k}/{k}' for k in [count,count+j,count+j+1])+'\n')
   count+=len(poly)
polys=[];uvs=[]
for i in range(48):
 a=i/48*math.tau;b=(i+1)/48*math.tau
 p=[]
 for angle,r in [(a,88),(b,88),(b,80),(a,80)]:
  # Superellipse contours make a rounded build pad.
  xx=math.copysign(abs(math.cos(angle))**.45,math.cos(angle))*r
  yy=math.copysign(abs(math.sin(angle))**.45,math.sin(angle))*r;p.append((xx,yy))
 polys.append(p);uvs.append([(.967,.12)]*4)
mesh('BuildPad',polys,uvs)
mesh('Guide',[[(-20,21),(0,2),(20,21),(28,13),(0,-14),(-28,13)]],[[(.967,.12)]*6])
# Engine widgets consume the same small family of rounded plates.
for name,bg,border in [('card',(255,248,222,255),(255,255,242,255)),('dark_card',(31,69,58,248),(124,161,117,255)),('gold_card',(253,211,104,255),(255,246,197,255))]:
 im=Image.new('RGBA',(512,144));d=ImageDraw.Draw(im)
 d.rounded_rectangle((4,10,508,142),radius=36,fill=(20,48,37,65));d.rounded_rectangle((4,2,508,132),radius=34,fill=bg,outline=border,width=3)
 im.resize((256,72),Image.Resampling.LANCZOS).save(UI/(name+'.png'))
for name,color in [('progress_back',(17,43,35,255)),('progress_fill',(198,231,132,255))]:
 Image.new('RGBA',(8,8),color).save(UI/(name+'.png'))
im=Image.new('RGBA',(128,128));d=ImageDraw.Draw(im)
d.ellipse((8,14,120,124),fill=(154,99,31));d.ellipse((8,5,120,116),fill=(249,190,57),outline=(255,232,139),width=7);d.ellipse((26,22,102,98),outline=(213,143,36),width=4)
pts=[]
for i in range(10):
 a=-math.pi/2+i*math.pi/5;r=29 if i%2==0 else 13;pts.append((64+math.cos(a)*r,61+math.sin(a)*r))
d.polygon(pts,fill=(255,238,160));im.resize((64,64),Image.Resampling.LANCZOS).save(UI/'coin.png')
im=Image.new('RGBA',(128,128));d=ImageDraw.Draw(im)
d.rounded_rectangle((14,31,113,100),radius=27,fill=(192,84,113));d.ellipse((13,15,77,96),fill=(243,139,163));d.ellipse((56,16,119,97),fill=(250,154,175));d.line([(65,25),(61,48),(67,64),(62,89)],fill=(185,74,114),width=5)
for px,py in [(36,37),(35,69),(86,38),(91,65)]:d.arc((px-12,py-10,px+13,py+13),30,280,fill=(204,90,129),width=4)
im.resize((64,64),Image.Resampling.LANCZOS).save(UI/'brain_icon.png')
im=Image.new('RGBA',(512,480));d=ImageDraw.Draw(im)
d.rounded_rectangle((5,12,507,478),radius=34,fill=(16,40,31,85))
d.rounded_rectangle((5,3,507,467),radius=32,fill=(31,69,58,255),outline=(140,177,128,255),width=4)
im.save(UI/'modal.png')
p=OUT/'BrainPaint.png'
if p.exists():
 a=np.array(Image.open(p).convert('RGB'),dtype=float);lum=np.max(a,axis=2)/255
 rgb=np.stack([lum*255,lum*202,lum*65],axis=2);Image.fromarray(np.uint8(rgb)).save(OUT/'BrainGold.png',optimize=True)
for name in ['SahurAtlas','StandPaint','FarmPaint','GardenPaint','BrainPaint','BrainGold','TerrainPaint']:
 path=OUT/(name+'.png')
 if path.exists():
  im=Image.open(path).convert('RGB')
  limit={'SahurAtlas':1024,'StandPaint':512,'FarmPaint':768,'GardenPaint':512,'BrainPaint':256,'BrainGold':256,'TerrainPaint':768}[name]
  im.thumbnail((limit,limit),Image.Resampling.LANCZOS)
  im=im.quantize(colors=128,dither=Image.Dither.NONE)
  im.save(path,optimize=True)
  print(name,path.stat().st_size)

# Floating thumbstick: soft shadow, translucent shell, directional notches and raised thumb pad.
S=384
im=Image.new('RGBA',(S,S));d=ImageDraw.Draw(im)
d.ellipse((21,29,363,371),fill=(22,73,59,55))
d.ellipse((21,15,363,357),fill=(255,253,224,50),outline=(255,254,230,225),width=7)
d.ellipse((48,42,336,330),outline=(255,254,229,105),width=3)
for angle in [0,math.pi/2,math.pi,math.pi*1.5]:
 cx=192+136*math.sin(angle);cy=186-136*math.cos(angle)
 d.ellipse((cx-5,cy-5,cx+5,cy+5),fill=(255,253,227,210))
im.resize((192,192),Image.Resampling.LANCZOS).save(UI/'joystick_base.png')
im=Image.new('RGBA',(192,192));d=ImageDraw.Draw(im)
d.ellipse((11,21,181,191),fill=(23,74,57,90))
for r in range(84,0,-1):
 t=r/84;d.ellipse((96-r,90-r,96+r,90+r),fill=(int(255-30*t),int(245-25*t),int(198-21*t),255))
d.ellipse((12,6,180,174),outline=(255,255,237,255),width=5)
d.arc((33,25,159,145),205,320,fill=(255,255,247,220),width=6)
d.ellipse((80,74,112,106),fill=(64,124,94,230))
im.resize((96,96),Image.Resampling.LANCZOS).save(UI/'joystick_knob.png')
im=Image.new('RGBA',(128,128));d=ImageDraw.Draw(im)
for r in range(62,0,-1):
 alpha=int(100*(1-r/63)**2);d.ellipse((64-r,64-r,64+r,64+r),fill=(255,221,116,alpha))
im.save(UI/'joystick_glow.png')
im=Image.new('RGBA',(96,96));d=ImageDraw.Draw(im)
d.ellipse((4,7,92,95),fill=(26,68,51,100));d.ellipse((4,2,92,90),fill=(255,229,135,255),outline=(255,253,216,255),width=4)
d.polygon([(48,19),(69,50),(57,50),(57,72),(39,72),(39,50),(27,50)],fill=(53,110,77,255))
im.resize((64,64),Image.Resampling.LANCZOS).save(UI/'nav_arrow.png')
