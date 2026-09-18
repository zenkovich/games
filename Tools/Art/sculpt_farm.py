"""Blender 4.5: sculpt/remesh Sahur and bake authored farm meshes into compact atlases.
blender --background --python Tools/Art/sculpt_farm.py -- character environment
"""
import bpy, bmesh, math, sys, random
from pathlib import Path
from mathutils import Vector
import numpy as np
ROOT=Path(__file__).resolve().parents[2]; OUT=ROOT/'Assets/Models'; SRC=Path(__file__).parent/'SourceGLB'
sys.path.insert(0,str(Path(__file__).parent))
from build_sahur import Mesh, export_glb
rng=random.Random(19)

def clear():
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)

def active(obj):
    bpy.ops.object.select_all(action='DESELECT'); obj.hide_set(False); obj.hide_viewport=False; obj.hide_render=False; obj.select_set(True); bpy.context.view_layer.objects.active=obj

def apply(obj, mod):
    active(obj); bpy.ops.object.modifier_apply(modifier=mod.name)

def join(objects,name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects: o.hide_set(False); o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]; bpy.ops.object.join()
    obj=bpy.context.object; obj.name=name
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    return obj

def load(name):
    before=set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=str(SRC/name))
    objects=[o for o in bpy.data.objects if o not in before and o.type=='MESH' and o.visible_get()]
    for obj in objects:
        active(obj); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.mesh.remove_doubles(threshold=.00005); bpy.ops.mesh.normals_make_consistent(inside=False)
        bpy.ops.mesh.fill_holes(sides=0); bpy.ops.mesh.normals_make_consistent(inside=False)
        bpy.ops.object.mode_set(mode='OBJECT')
    return objects

def mat(name,color,grain=False):
    m=bpy.data.materials.new(name); m.use_nodes=True
    nodes=m.node_tree.nodes; links=m.node_tree.links; bs=nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=(*color,1); bs.inputs['Roughness'].default_value=.78
    if grain:
        tc=nodes.new('ShaderNodeTexCoord'); mapping=nodes.new('ShaderNodeVectorMath'); mapping.operation='MULTIPLY'
        mapping.inputs[1].default_value=(7,7,.4); links.new(tc.outputs['Generated'],mapping.inputs[0])
        noise=nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value=7; noise.inputs['Detail'].default_value=3
        links.new(mapping.outputs[0],noise.inputs['Vector'])
        ramp=nodes.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].position=.22; ramp.color_ramp.elements[1].position=.8
        ramp.color_ramp.elements[0].color=(*(v*.65 for v in color),1)
        ramp.color_ramp.elements[1].color=(*(min(1,v*1.25) for v in color),1)
        links.new(noise.outputs['Fac'],ramp.inputs[0]); links.new(ramp.outputs[0],bs.inputs['Base Color'])
    return m

def bevel(obj,width=.035,segments=2):
    mod=obj.modifiers.new('Rounded carved edges','BEVEL'); mod.width=width; mod.segments=segments
    apply(obj,mod)
    for p in obj.data.polygons: p.use_smooth=True
    mod=obj.modifiers.new('Weighted normals','WEIGHTED_NORMAL'); apply(obj,mod)
    return obj

def box(name,loc,size,material,rounding=.025):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc); o=bpy.context.object; o.name=name; o.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(material)
    if rounding: bevel(o,rounding)
    return o

def curve(name,points,radius,material):
    c=bpy.data.curves.new(name,'CURVE'); c.dimensions='3D'; c.resolution_u=8; c.bevel_depth=radius; c.bevel_resolution=2; c.use_fill_caps=True
    s=c.splines.new('BEZIER'); s.bezier_points.add(len(points)-1)
    for p,co in zip(s.bezier_points,points): p.co=co; p.handle_left_type='AUTO'; p.handle_right_type='AUTO'
    o=bpy.data.objects.new(name,c); bpy.context.collection.objects.link(o); c.materials.append(material)
    active(o); bpy.ops.object.convert(target='MESH'); return bpy.context.object

def text_mesh(value,loc,size,material,rotation=(math.pi/2,0,0)):
    bpy.ops.object.text_add(location=loc,rotation=rotation); o=bpy.context.object; o.data.body=value
    o.data.align_x='CENTER'; o.data.size=size; o.data.extrude=.004; o.data.bevel_depth=.002; o.data.materials.append(material)
    active(o); bpy.ops.object.convert(target='MESH'); return bpy.context.object

def bake(obj,name,size=1024,ao=.65):
    active(obj)
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=.00001);bpy.ops.mesh.fill_holes(sides=0)
    bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT')
    if obj.data.uv_layers:
        source_uv=obj.data.uv_layers.active.name
        for material in obj.data.materials:
            if not material.use_nodes: continue
            source=material.node_tree.nodes.new('ShaderNodeUVMap'); source.uv_map=source_uv
            for node in material.node_tree.nodes:
                if node.type=='TEX_IMAGE' and not node.inputs['Vector'].is_linked:
                    material.node_tree.links.new(source.outputs['UV'],node.inputs['Vector'])
    obj.data.uv_layers.new(name='BakedUV'); obj.data.uv_layers.active_index=len(obj.data.uv_layers)-1; obj.data.uv_layers.active.active_render=True
    print('BAKE',name,obj.name,obj.type,len(obj.data.vertices),obj.select_get(),flush=True)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.018)
    bpy.ops.object.mode_set(mode='OBJECT')
    scene=bpy.context.scene; scene.render.engine='CYCLES'; scene.cycles.samples=12; scene.cycles.use_denoising=True
    scene.render.bake.margin=16; scene.render.bake.use_pass_direct=False; scene.render.bake.use_pass_indirect=False
    scene.render.bake.use_pass_color=True
    image=bpy.data.images.new(name,size,size,alpha=False)
    for material in obj.data.materials:
        material.use_nodes=True
        node=material.node_tree.nodes.new('ShaderNodeTexImage'); node.image=image; material.node_tree.nodes.active=node
    bpy.ops.object.bake(type='DIFFUSE',uv_layer='BakedUV')
    base=np.array(image.pixels[:],dtype=np.float32).reshape(-1,4)
    bpy.ops.object.bake(type='AO',uv_layer='BakedUV')
    occ=np.array(image.pixels[:],dtype=np.float32).reshape(-1,4)
    base[:,:3]*=(1-ao)+ao*np.sqrt(np.clip(occ[:,:3],0,1))
    pixels=base.reshape(size,size,4)
    valid=np.max(pixels[:,:,:3],axis=2)>.0001
    for _ in range(20):
        total=np.zeros((size,size,3),dtype=np.float32);count=np.zeros((size,size),dtype=np.float32)
        for axis,delta in [(0,1),(0,-1),(1,1),(1,-1)]:
            mask=np.roll(valid,delta,axis);total+=np.roll(pixels[:,:,:3],delta,axis)*mask[:,:,None];count+=mask
        fill=(~valid)&(count>0);pixels[fill,:3]=total[fill]/count[fill,None];valid[fill]=True
    base[:,3]=1; image.pixels[:]=base.reshape(-1)
    image.filepath_raw=str(OUT/(name+'.png')); image.file_format='PNG'; image.save()
    return image

def obj_export(obj,name):
    active(obj); mod=obj.modifiers.new('Triangles','TRIANGULATE'); apply(obj,mod)
    mesh=obj.data; uv=mesh.uv_layers.active.data; mw=obj.matrix_world; nm=mw.to_3x3().inverted().transposed()
    with (OUT/(name+'.obj')).open('w') as f:
        f.write('# Sculpted and baked with Blender; Tools/Art/sculpt_farm.py\n')
        for p in mesh.polygons:
            for li in p.loop_indices:
                co=mw@mesh.vertices[mesh.loops[li].vertex_index].co
                f.write('v %.3f %.3f %.3f\n'%tuple(co*100))
        for p in mesh.polygons:
            for li in p.loop_indices:
                n=(nm@mesh.corner_normals[li].vector).normalized(); f.write('vn %.5f %.5f %.5f\n'%tuple(n))
        for p in mesh.polygons:
            for li in p.loop_indices:
                u,v=uv[li].uv; f.write('vt %.6f %.6f\n'%(u,v))
        for i in range(len(mesh.polygons)):
            f.write('f '+' '.join(f'{j}/{j}/{j}' for j in range(i*3+1,i*3+4))+'\n')
    print('EXPORTED',name,len(mesh.polygons),'triangles',flush=True)

def character():
    clear(); objects=load('SahurBase.glb'); obj=objects[0]
    for arm in [o for o in bpy.data.objects if o.type=='ARMATURE']: arm.data.pose_position='REST'
    active(obj)
    for modifier in list(obj.modifiers): obj.modifiers.remove(modifier)
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.separate(type='LOOSE'); bpy.ops.object.mode_set(mode='OBJECT')
    pieces=[o for o in bpy.data.objects if o.type=='MESH' and o.visible_get()]; body=[]
    for piece in pieces:
        active(piece);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.mesh.fill_holes(sides=0);bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT')
    wood=mat('Warm carved acacia',(0.58,.30,.085),True)
    for o in pieces:
        v=o.data.vertices[0]; groups={o.vertex_groups[g.group].name for g in v.groups if g.weight>.5}
        uv=o.data.uv_layers.active.data[0].uv
        if uv.x<.38:
            o.data.materials.clear(); o.data.materials.append(wood)
            if 'Body' in groups: body.append(o)
    print('BODY PARTS',[(o.name,len(o.data.vertices)) for o in body],flush=True)
    for part in body:
        active(part); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.mesh.fill_holes(sides=0); bpy.ops.mesh.normals_make_consistent(inside=False); bpy.ops.object.mode_set(mode='OBJECT')
    sculpt=join(body,'Sculpted log and face')
    sculpt.data.remesh_voxel_size=.012
    active(sculpt); bpy.ops.object.voxel_remesh()
    smooth=sculpt.modifiers.new('Sculpt polish','SMOOTH'); smooth.factor=1.4; smooth.iterations=5; apply(sculpt,smooth)
    dec=sculpt.modifiers.new('Playable retopology','DECIMATE'); dec.ratio=.065; apply(sculpt,dec)
    sculpt.vertex_groups.clear(); vg=sculpt.vertex_groups.new(name='Body'); vg.add(list(range(len(sculpt.data.vertices))),1,'REPLACE')
    for p in sculpt.data.polygons:p.use_smooth=True
    sculpt.data.materials.clear();sculpt.data.materials.append(wood)
    parts=[o for o in bpy.data.objects if o.type=='MESH' and o.visible_get()]; final=join(parts,'Sahur sculpt')
    bake(final,'SahurAtlas',1024,.48)
    mod=final.modifiers.new('Triangles','TRIANGULATE');apply(final,mod)
    joints=[('Root',-1,(0,0,0)),('Body',0,(0,.76,0)),('LegL',0,(-.16,.78,0)),('ShinL',2,(-.16,.40,0)),('LegR',0,(.16,.78,0)),('ShinR',4,(.16,.40,0)),('ArmL',1,(-.34,1.51,0)),('HandL',6,(-.46,1.04,.035)),('ArmR',1,(.34,1.51,0)),('HandR',8,(.46,1.04,.035))]
    names={name:i for i,(name,_,_) in enumerate(joints)}; m=Mesh(); mesh=final.data; uv=mesh.uv_layers.active.data
    for p in mesh.polygons:
        for li in p.loop_indices:
            v=mesh.vertices[mesh.loops[li].vertex_index]; x,y,z=v.co; nx,ny,nz=mesh.corner_normals[li].vector
            weights=[(g.weight,names.get(final.vertex_groups[g.group].name,0)) for g in v.groups]
            joint=max(weights)[1] if weights else 1
            u,w=uv[li].uv; idx=m.vertex((x,z,-y),(nx,nz,-ny),(u,1-w),joint);m.idx.append(idx)
    # Weld identical corner attributes after UV unwrap.
    welded=Mesh(); lookup={}
    for i in m.idx:
        key=tuple(round(v,6) for v in (*m.p[i],*m.n[i],*m.uv[i],m.j[i][0]))
        if key not in lookup:lookup[key]=welded.vertex(m.p[i],m.n[i],m.uv[i],m.j[i][0])
        welded.idx.append(lookup[key])
    export_glb(welded,joints)
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'Work/Models/SahurSculpt.blend'))

def fit(obj,extent,position=(0,0,0),axis=2):
    active(obj); obj.parent=None
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    points=[v.co for v in obj.data.vertices]; low=Vector(tuple(min(v[i] for v in points) for i in range(3))); high=Vector(tuple(max(v[i] for v in points) for i in range(3)))
    center=(low+high)/2; center.z=low.z; scale=extent/(high[axis]-low[axis])
    for v in obj.data.vertices:v.co=(v.co-center)*scale
    obj.rotation_mode='XYZ'; obj.location=position; return obj

def environment():
    clear()
    wood=mat('Honey oak',(0.48,.27,.105),True); darkwood=mat('Deep walnut',(.16,.083,.031),True)
    cream=mat('Linen',(.91,.81,.55)); teal=mat('Canvas teal',(.065,.39,.34)); pink=mat('Coral trim',(.69,.15,.25))
    green=mat('Sage leaves',(.19,.42,.09)); stone=mat('Warm stone',(.49,.51,.39)); soil=mat('Rich garden soil',(.22,.12,.058))
    nodes=soil.node_tree.nodes;links=soil.node_tree.links;noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=5.5;noise.inputs['Detail'].default_value=3
    coordinates=nodes.new('ShaderNodeTexCoord');links.new(coordinates.outputs['Object'],noise.inputs['Vector'])
    ramp=nodes.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=(.095,.042,.019,1);ramp.color_ramp.elements[1].color=(.29,.155,.070,1)
    links.new(noise.outputs['Fac'],ramp.inputs[0]);links.new(ramp.outputs[0],nodes.get('Principled BSDF').inputs['Base Color'])
    # Keep the authored counter base and close the cut where the canopy was removed.
    stand=fit(join(load('MarketStand.glb'),'Market'),2.3,axis=0)
    bm=bmesh.new();bm.from_mesh(stand.data)
    bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=.00001,
                          plane_co=(0,0,1.02),plane_no=(0,0,1),clear_outer=True)
    bmesh.ops.holes_fill(bm,edges=[e for e in bm.edges if e.is_boundary],sides=0)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(stand.data);bm.free()
    stand.rotation_euler.z=math.pi/2
    mats=[teal,cream,darkwood,wood]
    for i in range(len(stand.data.materials)):stand.data.materials[i]=mats[i%4]
    parts=[stand,box('Counter top',(0,-.38,.92),(2.25,.78,.12),wood,.045),box('Shop panel',(0,-.59,.47),(2.02,.12,.80),teal,.04),box('Sign board',(0,-.67,.48),(1.56,.10,.34),teal,.06),text_mesh('BRAIN MART',(0,-.73,.40),.20,cream)]
    for x in [-1.02,1.02]:parts.append(box('Paper lantern',(x,-.68,.77),(.16,.16,.23),cream,.045))
    stand=join(parts,'SahurStand');bake(stand,'StandPaint',1024,.60);obj_export(stand,'SahurStand')
    clear()
    # Each tree starts from a textured, individually modelled oak; geometry is shared before baking.
    oak=fit(join(load('Oak.glb'),'Oak'),2.9)
    dec=oak.modifiers.new('Foliage LOD','DECIMATE');dec.ratio=min(1,2600/max(1,len(oak.data.polygons)));apply(oak,dec)
    parts=[]
    for x,y,h in [(-11.2,-9.4,3.8),(11.4,-8.2,3.4),(-11.3,-1.8,4.0),(11.5,3.2,4.3),(-11.4,8.4,4.1),(11.3,12.8,3.8),(-6.4,14.8,4.0),(5.8,15.1,4.3)]:
        o=oak.copy();o.data=oak.data.copy();bpy.context.collection.objects.link(o);o.location=(x,y,0);o.scale=(h/2.9,)*3;o.rotation_euler.z=rng.random()*6.28;parts.append(o)
    bpy.data.objects.remove(oak,do_unlink=True)
    rock_objects=load('Rocks.glb')
    rocks=fit(rock_objects[0],.57,axis=0)
    for extra in rock_objects[1:]:bpy.data.objects.remove(extra,do_unlink=True)
    rockmat=mat('Limestone',(.49,.53,.40))
    rocks.data.materials.clear();rocks.data.materials.append(rockmat)
    fern=fit(join(load('Fern.glb'),'Fern'),.46)
    fern.data.materials.clear();fern.data.materials.append(green)
    for side in [-1,1]:
        for y in [-10,-6,-1,3,7,11]:
            for base in [rocks,fern]:
                o=base.copy();o.data=base.data.copy();bpy.context.collection.objects.link(o);o.location=(side*rng.uniform(10.1,10.7),y+rng.uniform(-.3,.3),0);o.rotation_euler.z=rng.random()*6.28;parts.append(o)
    bpy.data.objects.remove(rocks,do_unlink=True);bpy.data.objects.remove(fern,do_unlink=True)
    barrel=fit(join(load('Barrel.glb'),'Barrel'),.7)
    for i in range(len(barrel.data.materials)):barrel.data.materials[i]=wood if i!=1 else darkwood
    for x,y in [(9.8,-1.1),(9.4,-.6),(9.6,-4.5)]:
        o=barrel.copy();o.data=barrel.data.copy();bpy.context.collection.objects.link(o);o.location=(x,y,0);o.rotation_euler.z=rng.random()*6;parts.append(o)
    bpy.data.objects.remove(barrel,do_unlink=True)
    # Fences use tapered pickets and rounded rails; every board has individual grain.
    for side in [-1,1]:
        for y in np.arange(-11.8,13.6,1.25):
            parts.append(box('Fence post',(side*10.8,float(y),.37),(.13,.14,.74),wood,.035))
        for h in [.26,.54]:parts.append(box('Fence rail',(side*10.8,.9,h),(.10,25.4,.095),cream,.025))
        for x in np.arange(1.5,10.9,1.2):parts.append(box('Gate post',(side*float(x),13.5,.38),(.13,.14,.76),wood,.035))
        for h in [.26,.54]:parts.append(box('Gate rail',(side*6.1,13.5,h),(9.4,.10,.10),cream,.025))
    decor=join(parts,'FarmDecor');bake(decor,'FarmPaint',2048,.45);obj_export(decor,'FarmDecor')
    clear()
    parts=[box('Earth',(0,0,.035),(3.25,14.55,.10),soil,.08)]
    for x in [-1.68,1.68]:
        parts.append(box('Garden border',(x,0,.13),(.13,14.85,.26),cream,.025))
        for y in [-7.25,-4.8,-2.4,0,2.4,4.8,7.25]:
            parts.append(box('Garden post',(x,y,.23),(.17,.17,.46),cream,.025))
        parts.append(box('Garden rail',(x,0,.34),(.06,14.6,.075),cream,.015))
    for y in [7.35]:parts.append(box('End border',(0,y,.12),(3.4,.12,.24),wood,.025))
    for x in [-1.02,-.34,.34,1.02]:
        parts.append(curve('Planting furrow',[(x,-7.1,.06),(x+.035,0,.085),(x,7.1,.06)],.065,soil))
    for i in range(32):
        x=rng.uniform(-1.5,1.5);y=rng.uniform(-7.0,7.0)
        parts.append(box('Mulch',(x,y,.10),(.07,.035,.025),wood,.008))
    bed=join(parts,'GardenBed');bake(bed,'GardenPaint',512,.7);obj_export(bed,'GardenBed')
    clear()
    brain=fit(join(load('Brain.glb'),'Brain'),.53,axis=0)
    brain.data.remesh_voxel_size=.004;active(brain);bpy.ops.object.voxel_remesh()
    smooth=brain.modifiers.new('Cortex polish','SMOOTH');smooth.factor=.4;smooth.iterations=2;apply(brain,smooth)
    dec=brain.modifiers.new('Cortex LOD','DECIMATE');dec.ratio=min(1,300/max(1,len(brain.data.polygons)));apply(brain,dec)
    for p in brain.data.polygons:p.use_smooth=True
    brain.data.materials.clear();brain.data.materials.append(mat('Fresh brain',(.88,.24,.39)))
    bake(brain,'BrainPaint',512,.60);obj_export(brain,'Brain')
    clear()
    # Sculpted ground is UV-mapped across the whole island instead of using a flat swatch.
    parts=[box('Island',(0,1.0,-.19),(22,26,.40),mat('Island soil',(.30,.19,.09)),.35)]
    ground=parts[0];obj_export_untextured=None
    # The terrain texture is produced separately; UVs follow world XY exactly.
    active(ground);mod=ground.modifiers.new('Triangulate','TRIANGULATE');apply(ground,mod)
    if not ground.data.uv_layers:ground.data.uv_layers.new()
    for p in ground.data.polygons:
        for li in p.loop_indices:
            co=ground.matrix_world@ground.data.vertices[ground.data.loops[li].vertex_index].co
            ground.data.uv_layers.active.data[li].uv=((co.x+11)/22,(co.y+12)/26)
    obj_export(ground,'FarmGround')

if __name__=='__main__':
    args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else ['character','environment']
    if 'character' in args:character()
    if 'environment' in args:environment()
