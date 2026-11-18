"""Render the procedural pose targets; does not change exported runtime models."""
from pathlib import Path
import sys
import math
import bpy
from mathutils import Quaternion, Vector

WORK = Path(__file__).resolve().parent
sys.path.insert(0, str(WORK))
from prepare_assets import render

bpy.ops.wm.open_mainfile(filepath=str(WORK / 'visitor_demo.blend'))
objects = bpy.data.objects

def cocos_rotation(obj, x, y=0, z=0):
    # Cocos Quat.fromEuler uses Y-X-Z; map quaternion axes to Blender Z-up.
    x, y, z = [math.radians(a) / 2 for a in (x, y, z)]
    sx, cx = math.sin(x), math.cos(x)
    sy, cy = math.sin(y), math.cos(y)
    sz, cz = math.sin(z), math.cos(z)
    qx = sx*cy*cz + cx*sy*sz
    qy = cx*sy*cz - sx*cy*sz
    qz = cx*cy*sz - sx*sy*cz
    qw = cx*cy*cz + sx*sy*sz
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = Quaternion((qw, qx, -qz, qy))

def prop_material(name, color):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    return mat

for pose in ['hold', 'raise', 'bow', 'sit']:
    for obj in list(bpy.data.objects):
        if obj.name.startswith('_PoseProp'):
            bpy.data.objects.remove(obj, do_unlink=True)
    for name in ['Arm_L', 'Arm_R', 'Torso', 'Leg_L', 'Leg_R']:
        cocos_rotation(objects[name], 0)
    objects['Torso'].location.z = .46
    objects['RobePivot'].scale = (1, 1, 1)
    objects['Arm_L'].location.x = -.14
    objects['Arm_R'].location.x = .14
    objects['Leg_L'].location.z = .30
    objects['Leg_R'].location.z = .30
    if pose in ['hold', 'raise']:
        arm_x = -74 if pose == 'hold' else -119
        cocos_rotation(objects['Arm_L'], arm_x, 0, 25)
        cocos_rotation(objects['Arm_R'], arm_x, 0, -25)
        objects['Arm_L'].location.x = -.06
        objects['Arm_R'].location.x = .06
    elif pose == 'bow':
        cocos_rotation(objects['Arm_L'], -65, 0, 27)
        cocos_rotation(objects['Arm_R'], -65, 0, -27)
        objects['Arm_L'].location.x = -.06
        objects['Arm_R'].location.x = .06
        cocos_rotation(objects['Torso'], 30)
    else:
        objects['Torso'].location.z = .30
        objects['RobePivot'].scale.z = .72
        objects['Leg_L'].location.z = .17
        objects['Leg_R'].location.z = .17
        cocos_rotation(objects['Leg_L'], -62, 0, 63)
        cocos_rotation(objects['Leg_R'], -62, 0, -63)
        cocos_rotation(objects['Arm_L'], -35, 0, 25)
        cocos_rotation(objects['Arm_R'], -35, 0, -25)
        bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=.36, depth=.12, location=(0, 0, .06))
        cushion = bpy.context.object
        cushion.name = '_PoseProp_Cushion'
        cushion.data.materials.append(prop_material('Cushion', (.44, .41, .26)))
    bpy.context.view_layer.update()
    if pose in ['hold', 'raise']:
        palm = (objects['HandSocket_L'].matrix_world.translation + objects['HandSocket_R'].matrix_world.translation) / 2
        for i in [-1, 0, 1]:
            bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=.0048, depth=.224, location=palm + Vector((i*.020, 0, .112)))
            stick = bpy.context.object
            stick.name = '_PoseProp_Incense'
            stick.data.materials.append(prop_material('Incense', (.39, .26, .10)))
    render('visitor_pose_' + pose, (2.4, -3, 1.5), (0, 0, .54), 1.75)
print('POSE_PREVIEWS_READY')
