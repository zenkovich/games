#!/usr/bin/env python3
"""Rebuild the original Sahur model and farm meshes. Requires numpy and Pillow."""
import json
import math
from pathlib import Path
import random
import struct

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'Assets/Models'
TAU = math.tau
COLORS = [
    (252, 238, 199), (107, 58, 23), (24, 21, 18), (255, 255, 245),
    (186, 113, 43), (233, 184, 99), (71, 122, 63), (99, 151, 70),
    (138, 177, 82), (55, 98, 65), (216, 204, 159), (240, 225, 181),
    (63, 132, 126), (229, 128, 104), (125, 87, 58), (76, 58, 44),
    (177, 190, 175), (247, 185, 71), (234, 150, 155), (146, 98, 68),
    (178, 197, 118), (111, 156, 82), (191, 218, 141), (78, 126, 76),
]


def texture():
    from PIL import Image
    a = np.zeros((256, 512, 3), np.uint8)
    for y in range(256):
        for x in range(192):
            phase = x + 1.2 * math.sin(y * .028 + x * .09)
            grain = 7 * math.sin(phase * 1.7) + 4 * math.sin(phase * .43)
            grain -= 13 * max(0, math.sin(phase * .24 + .2 * math.sin(y * .021))) ** 16
            glow = 9 * math.sin(x / 192 * TAU) + 4 * math.sin(y * .012)
            a[y, x] = np.clip(np.array([194, 132, 61]) + grain + glow, 0, 255)
    for i, color in enumerate(COLORS):
        y = (i // 4) * 40
        x = 192 + (i % 4) * 16
        a[y:y + 40, x:x + 16] = color
    for y in range(256):
        for x in range(256,512):
            dx=(x-384)/120; dy=(y-128)/120
            radius=math.sqrt(dx*dx+dy*dy)
            ring=math.sin(radius*65 + .7*math.sin(math.atan2(dy,dx)*3))
            grain=-12*max(0,ring)**8
            a[y,x]=np.clip(np.array([221,168,91])+grain,0,255)
    Image.fromarray(a).save(OUT / 'SahurAtlas.png', optimize=True)


def uv_color(c):
    return ((192 + (c % 4) * 16 + 8) / 512, ((c // 4) * 40 + 20) / 256)


class Mesh:
    def __init__(self):
        self.p, self.n, self.uv, self.j, self.idx = [], [], [], [], []

    def vertex(self, p, n, uv, joint=0):
        i = len(self.p)
        self.p.append(tuple(p))
        self.n.append(tuple(n))
        self.uv.append(tuple(uv))
        self.j.append((joint, 0, 0, 0))
        return i

    def ellipsoid(self, c, r, color=None, joint=0, seg=16, rings=10):
        start = len(self.p)
        for j in range(rings + 1):
            v = j / rings
            lat = math.pi * v
            for i in range(seg + 1):
                u = i / seg
                normal = np.array([math.sin(lat) * math.sin(TAU*u), math.cos(lat), math.sin(lat) * math.cos(TAU*u)])
                p = np.array(c) + normal * r
                n = normal / r
                n /= np.linalg.norm(n)
                uv = uv_color(color) if color is not None else ((.015 + u*.70)*.5, .05 + v*.9)
                self.vertex(p, n, uv, joint)
        for j in range(rings):
            for i in range(seg):
                a = start+j*(seg+1)+i
                b = a+seg+1
                self.idx.extend([a, b, a+1, a+1, b, b+1])

    def tube(self, points, radii, color=None, joint=0, seg=10):
        start = len(self.p)
        points = np.array(points, dtype=float)
        for j, p in enumerate(points):
            tangent = points[min(j+1, len(points)-1)] - points[max(0, j-1)]
            tangent /= np.linalg.norm(tangent)
            axis = np.array([0., 0., 1.]) if abs(tangent[2]) < .9 else np.array([1., 0., 0.])
            right = np.cross(tangent, axis); right /= np.linalg.norm(right)
            front = np.cross(right, tangent)
            for i in range(seg+1):
                u = i/seg
                n = right*math.cos(TAU*u) + front*math.sin(TAU*u)
                uv = uv_color(color) if color is not None else ((.015+u*.70)*.5, .05+j/(len(points)-1)*.9)
                self.vertex(p + n*radii[j], n, uv, joint)
        for j in range(len(points)-1):
            for i in range(seg):
                a = start+j*(seg+1)+i; b=a+seg+1
                self.idx.extend([a, b, a+1, a+1, b, b+1])

    def box(self, c, size, color):
        c = np.array(c); s = np.array(size)/2
        for axis in range(3):
            u, v = (axis+1)%3, (axis+2)%3
            for side in [-1, 1]:
                n=np.zeros(3); n[axis]=side
                ids=[]
                for a,b in [(-1,-1),(1,-1),(1,1),(-1,1)]:
                    p=c.copy(); p[axis]+=side*s[axis]; p[u]+=a*s[u]; p[v]+=b*s[v]
                    ids.append(self.vertex(p,n,uv_color(color)))
                if side<0: ids.reverse()
                self.idx.extend([ids[0],ids[1],ids[2],ids[0],ids[2],ids[3]])

    def obj(self, name):
        with (OUT / (name+'.obj')).open('w') as f:
            f.write('# Original procedural farm geometry; rebuild with Tools/Art/build_sahur.py\n')
            for x,y,z in self.p: f.write(f'v {x*100:.3f} {-z*100:.3f} {y*100:.3f}\n')
            for x,y,z in self.n: f.write(f'vn {x:.5f} {-z:.5f} {y:.5f}\n')
            for u,v in self.uv: f.write(f'vt {u:.5f} {1-v:.5f}\n')
            for i in range(0,len(self.idx),3):
                f.write('f '+' '.join(f'{j+1}/{j+1}/{j+1}' for j in self.idx[i:i+3])+'\n')
        print(name, len(self.p), 'vertices,',len(self.idx)//3,'triangles')


def character():
    m=Mesh()
    # Root plus paired upper/lower limbs; model-space bind positions.
    joints=[('Root',-1,(0,0,0)),('Body',0,(0,.76,0)),
            ('LegL',0,(-.16,.78,0)),('ShinL',2,(-.16,.40,0)),
            ('LegR',0,(.16,.78,0)),('ShinR',4,(.16,.40,0)),
            ('ArmL',1,(-.34,1.51,0)),('HandL',6,(-.46,1.04,.035)),
            ('ArmR',1,(.34,1.51,0)),('HandR',8,(.46,1.04,.035))]
    body=[(0,.73,0),(0,.76,0),(0,.80,0),(0,1.04,0),(0,1.46,0),(0,1.91,0),(0,2.13,0),(0,2.20,0),(0,2.22,0)]
    m.tube(body,[.265,.306,.323,.326,.329,.329,.32,.295,.24],joint=1,seg=40)
    cap_start=len(m.p)
    m.ellipsoid((0,2.205,0),(.294,.032,.294),5,1,seg=32,rings=4)
    for i in range(cap_start,len(m.p)):
        x,y,z=m.p[i]
        m.uv[i]=((384+x/.294*120)/512, .5+z/.294*.46)
    for side in [-1,1]:
        x=side*.145
        m.ellipsoid((x,1.88,.287),(.145,.171,.075),4,1,20,12)
        m.ellipsoid((x,1.889,.342),(.111,.132,.056),0,1,20,12)
        m.ellipsoid((x+side*.007,1.891,.389),(.069,.086,.022),1,1,20,10)
        m.ellipsoid((x+side*.007,1.891,.409),(.043,.061,.012),2,1,16,10)
        m.ellipsoid((x-.018,1.922,.421),(.018,.022,.008),3,1,10,6)
        m.ellipsoid((x+.022,1.862,.420),(.007,.009,.005),3,1,8,4)
        pts=[(x+(t/8-.5)*.25,2.04+.062*math.sin(t/8*math.pi),.302) for t in range(9)]
        m.tube(pts,[.016,.027,.031,.032,.032,.03,.027,.021,.011],1,1,8)
        m.ellipsoid((side*.217,1.627,.265),(.101,.10,.068),None,1,12,8)
        leg=2 if side<0 else 4; shin=leg+1
        m.tube([(side*.16,.79,0),(side*.171,.58,.018),(side*.16,.40,.012)],[.082,.069,.056],joint=leg)
        m.ellipsoid((side*.16,.405,.012),(.06,.072,.062),None,shin,12,8)
        m.tube([(side*.16,.43,.012),(side*.17,.26,0),(side*.17,.10,.015)],[.057,.053,.047],joint=shin)
        m.ellipsoid((side*.18,.08,.09),(.106,.075,.174),None,shin,16,8)
        for toe in range(4):
            m.ellipsoid((side*.18+(toe-1.5)*.043,.055,.221-abs(toe-1.5)*.012),(.027,.032,.069),None,shin,8,6)
        arm=6 if side<0 else 8; hand=arm+1
        m.tube([(side*.32,1.52,0),(side*.39,1.32,.012),(side*.46,1.04,.035)],[.066,.055,.046],joint=arm)
        m.ellipsoid((side*.46,1.04,.035),(.05,.057,.051),None,hand,10,6)
        m.tube([(side*.46,1.05,.035),(side*.46,.89,.083),(side*.48,.73,.102)],[.047,.043,.037],joint=hand)
        m.ellipsoid((side*.48,.70,.10),(.067,.093,.042),None,hand,12,8)
        for finger in range(3):
            x=side*.48+(finger-1)*.037
            m.tube([(x,.687,.12),(x+side*.006,.62,.135),(x-side*.009,.603,.15)],[.02,.017,.01],joint=hand,seg=7)
        m.tube([(side*.44,.735,.126),(side*.41,.684,.168),(side*.439,.657,.18)],[.024,.022,.015],joint=hand,seg=8)
    m.ellipsoid((0,1.764,.328),(.047,.116,.05),None,1,16,10)
    m.ellipsoid((0,1.703,.383),(.072,.047,.071),None,1,16,10)
    smile=[((t/18-.5)*.44,1.565+.065*((t/18-.5)*2)**2,.278+.045*math.sin(t/18*math.pi)) for t in range(19)]
    m.tube(smile,[.011]*19,1,1,6)
    m.tube([(x,y-.025,z-.008) for x,y,z in smile],[.017]*19,None,1,8)
    m.tube([(-.467,.75,.16),(-.51,.60,.17),(-.63,.31,.18),(-.72,.10,.19),(-.72,.065,.19)], [.023,.026,.056,.075,.055],None,7,16)
    export_glb(m,joints)


def export_glb(m,joints):
    blob=bytearray(); views=[]; access=[]
    def acc(data,kind,ctype=5126):
        while len(blob)%4: blob.append(0)
        n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[kind]
        flat=data if n==1 else [v for row in data for v in row]
        raw=struct.pack('<'+{5126:'f',5123:'H'}[ctype]*len(flat),*flat)
        views.append({'buffer':0,'byteOffset':len(blob),'byteLength':len(raw)})
        blob.extend(raw)
        a={'bufferView':len(views)-1,'componentType':ctype,'count':len(data),'type':kind}
        if kind in ['SCALAR','VEC3']:
            arr=np.array(data).reshape(-1,n); a['min']=arr.min(axis=0).tolist(); a['max']=arr.max(axis=0).tolist()
        access.append(a); return len(access)-1
    attrs={'POSITION':acc(m.p,'VEC3'),'NORMAL':acc(m.n,'VEC3'),'TEXCOORD_0':acc(m.uv,'VEC2'),
           'JOINTS_0':acc(m.j,'VEC4',5123),'WEIGHTS_0':acc([(1,0,0,0)]*len(m.p),'VEC4')}
    indices=acc(m.idx,'SCALAR',5123)
    nodes=[]; ibm=[]
    for i,(name,parent,pos) in enumerate(joints):
        translation=np.array(pos)-(np.array(joints[parent][2]) if parent>=0 else 0)
        node={'name':name,'translation':translation.tolist()}
        children=[k for k,(_,p,_) in enumerate(joints) if p==i]
        if children: node['children']=children
        nodes.append(node)
        matrix=np.eye(4); matrix[:3,3]=-np.array(pos); ibm.append(matrix.T.flatten().tolist())
    inv=acc(ibm,'MAT4'); nodes.append({'name':'Sahur','mesh':0,'skin':0})
    animations=[]
    for name,duration in [('Idle',2.4),('Run',.65)]:
        times=[i/24*duration for i in range(25)]; ta=acc(times,'SCALAR'); samplers=[]; channels=[]
        for j in range(len(joints)):
            rotations=[]
            for t in times:
                phase=t/duration*TAU
                a=0; axis=0
                if name=='Run':
                    if j in [2,4]: a=math.sin(phase+(math.pi if j==4 else 0))*.58
                    if j in [3,5]: a=max(0,math.sin(phase+(math.pi if j==5 else 0)))*.72
                    if j in [6,8]: a=math.sin(phase+(math.pi if j==6 else 0))*.30
                    if j==1: a=math.sin(phase)*.045; axis=2
                else:
                    if j==1: a=math.sin(phase)*.018; axis=2
                    if j in [6,8]: a=math.sin(phase)*.045; axis=0
                q=[0.,0.,0.,math.cos(a/2)]; q[axis]=math.sin(a/2); rotations.append(q)
            samplers.append({'input':ta,'output':acc(rotations,'VEC4'),'interpolation':'LINEAR'})
            channels.append({'sampler':len(samplers)-1,'target':{'node':j,'path':'rotation'}})
        bounce=[(0,(.026*(1-math.cos(t/duration*TAU*2)) if name=='Run' else .006*math.sin(t/duration*TAU)),0) for t in times]
        samplers.append({'input':ta,'output':acc(bounce,'VEC3'),'interpolation':'LINEAR'})
        channels.append({'sampler':len(samplers)-1,'target':{'node':0,'path':'translation'}})
        animations.append({'name':'CharacterArmature|'+name,'samplers':samplers,'channels':channels})
    gltf={'asset':{'version':'2.0','generator':'Sahur procedural art'},'scene':0,'scenes':[{'nodes':[0,len(joints)]}],
          'nodes':nodes,'meshes':[{'primitives':[{'attributes':attrs,'indices':indices,'material':0}]}],
          'skins':[{'joints':list(range(len(joints))),'inverseBindMatrices':inv,'skeleton':0}],
          'animations':animations,'materials':[{'pbrMetallicRoughness':{'baseColorTexture':{'index':0},'metallicFactor':0,'roughnessFactor':.72}}],
          'textures':[{'source':0}],'images':[{'uri':'SahurAtlas.png'}],
          'buffers':[{'byteLength':len(blob)}],'bufferViews':views,'accessors':access}
    js=json.dumps(gltf,separators=(',',':')).encode(); js+=b' '*(-len(js)%4); blob+=b'\0'*(-len(blob)%4)
    data=struct.pack('<III',0x46546C67,2,28+len(js)+len(blob))+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(blob),0x004E4942)+blob
    (OUT/'Sahur.glb').write_bytes(data)
    print('Sahur:',len(m.p),'vertices,',len(m.idx)//3,'triangles,',len(data),'bytes,',len(joints),'bones')


def farm():
    rng=random.Random(42)
    m=Mesh()
    # The mesh builder is Y-up; z is the negative of the game's ground-plane Y.
    m.box((0,-.075,-.6),(8.3,.14,15.6),21)
    m.box((0,.003,-2.0),(2.15,.025,4.4),10)
    m.box((0,.004,-7.35),(2.1,.025,5.4),10)
    for y in np.arange(-.1,3.9,.53):
        for x in [-.58,0,.58]:
            m.box((x+rng.uniform(-.025,.025),.035,-y),(.52,.035,.46),11 if rng.random()<.4 else 10)
    for side in [-1,1]:
        for y in np.arange(-6.9,8.7,.63):
            x=side*4.05
            m.box((x,.33,-y),(.12,.65,.13),11)
            m.ellipsoid((x,.67,-y),(.085,.08,.085),5,seg=6,rings=3)
        for h in [.25,.50]: m.box((side*4.05,h,-.9),(.09,.09,15.6),5)
        for x in np.arange(.95,4.05,.62):
            m.box((side*x,.32,-8.65),(.13,.64,.13),11)
        for h in [.25,.50]: m.box((side*2.55,h,-8.65),(3.1,.09,.10),5)
    m.obj('FarmGround')

    m=Mesh()
    for side in [-1,1]:
        for y in [-5.8,-2.9,.4,3.7,7.4,10.0]:
            x=side*(4.65+rng.random()*.3)
            h=rng.uniform(1.65,2.45)
            m.tube([(x,0,-y),(x+.05,h*.65,-y),(x-.12,h,-y)],[.14,.105,.055],14,seg=7)
            for dx,dy,dz,rr in [(0,h,0,.72),(-.40,h*.83,.1,.51),(.36,h*.9,-.15,.54),(0,h*1.23,0,.5)]:
                m.ellipsoid((x+dx,dy,-y+dz),(rr,rr*.82,rr),rng.choice([6,7,8]),seg=9,rings=5)
        for y in [-5.9,-3.1,-.2,2.4,5.9,8.0]:
            x=side*3.6
            m.ellipsoid((x,.12,-y),(.37,.23,.52),6,seg=8,rings=4)
            for i in range(5):
                fx=x+rng.uniform(-.3,.3); fz=-y+rng.uniform(-.4,.4)
                m.tube([(fx,.1,fz),(fx,.27,fz)],[.012,.009],9,seg=4)
                m.ellipsoid((fx,.28,fz),(.064,.045,.064),rng.choice([0,17,18]),seg=6,rings=3)
        for y in [-4.8,1.2,6.7]:
            x=side*3.65
            m.ellipsoid((x,.10,-y),(.23,.18,.20),16,seg=7,rings=4)
            m.ellipsoid((x-side*.2,.07,-y+.18),(.13,.11,.15),16,seg=6,rings=3)
        for i in range(38):
            x=side*rng.uniform(3.05,3.85); y=rng.uniform(-6.5,8)
            for blade in range(3):
                bx=x+blade*.06
                m.tube([(bx,0,-y),(bx+side*.04,rng.uniform(.10,.19),-y+.04)],[.026,.001],rng.choice([7,8,20]),seg=3)
    # Crates and pumpkins flank the stall, outside its interaction zone.
    for x,y in [(-2.0,4.3),(2.,4.8),(-2.5,5.0)]:
        m.box((x,.2,-y),(.60,.4,.56),14)
        for h in [.09,.29]: m.box((x,h,-y+.29),(.64,.065,.04),5)
        for dx in [-.19,0,.19]:
            m.ellipsoid((x+dx,.45,-y),(.13,.15,.16),17,seg=9,rings=5)
            m.tube([(x+dx,.56,-y),(x+dx+.02,.64,-y)],[.018,.012],9,seg=5)
    m.obj('FarmDecor')

    m=Mesh()
    m.box((0,.012,0),(1.8,.04,1.25),15)
    for x in [-.94,.94]: m.box((x,.085,0),(.10,.17,1.43),14)
    for z in [-.68,.68]: m.box((0,.085,z),(1.98,.17,.10),14)
    for x in [-.88,.88]:
        for z in [-.61,.61]: m.box((x,.11,z),(.13,.22,.13),5)
    for x in [-.45,.45]:
        for z in [-.32,.32]:
            m.ellipsoid((x,.06,z),(.34,.045,.255),19,seg=12,rings=3)
            for a in range(3):
                angle=a/3*TAU
                m.ellipsoid((x+math.sin(angle)*.21,.10,z+math.cos(angle)*.16),(.075,.025,.15),7,seg=6,rings=3)
    m.obj('GardenBed')

    m=Mesh()
    for x in [-.96,.96]:
        for z in [-.42,.42]: m.box((x,1.1,z),(.10,2.2,.10),14)
    m.box((0,.50,0),(2.05,.85,.83),12)
    for x in np.arange(-.9,1,.22): m.box((x,.5,.426),(.025,.78,.025),9)
    m.box((0,.96,0),(2.26,.13,1.04),5)
    m.box((0,1.075,-.20),(1.95,.08,.28),14)
    m.box((0,1.95,0),(2.30,.10,1.48),11)
    for i in range(10):
        x=-1.035+i*.23
        c=12 if i%2==0 else 11
        m.box((x,2.0,0),(.23,.11,1.52),c)
        m.box((x,1.88,.72),(.23,.23,.075),c)
        m.ellipsoid((x,1.77,.72),(.115,.055,.045),c,seg=8,rings=4)
    # Pink brain emblem set into a framed shop sign.
    m.box((0,1.53,.51),(.80,.34,.055),14)
    m.box((0,1.53,.55),(.72,.26,.04),11)
    for x in [-.075,.075]: m.ellipsoid((x,1.54,.595),(.09,.09,.035),18,seg=10,rings=6)
    m.obj('SahurStand')


if __name__=='__main__':
    texture()
    character()
    farm()
