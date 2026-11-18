"""Re-export existing temple modules and poseable visitor for the Cocos demo.

Run with Blender 4.2 --background --python this_file.py.
Source assets remain untouched. All runtime coordinates are glTF Y-up meters.
"""
from pathlib import Path
import json
import math
import sys

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT.parent
MODELS = ROOT / 'client' / 'assets' / 'resources' / 'models'
WORK = ROOT / 'asset-work'
PREVIEW = WORK / 'previews'
PREVIEW.mkdir(parents=True, exist_ok=True)

TEMPLE_MODULES = {
    'Ground_and_street', 'Entry_paifang', 'Entry_shanmen', 'Entry_theatre',
    'Entry_bell_pavilion', 'Entry_drum_pavilion', 'Xiandian_open_hall',
    'Chenghuang_main_hall', 'Qingong_two_storey', 'West_land_temple',
    'East_six_offices', 'Main_courtyard_furnishings',
    'Aux_Land_SevenPhotographedFigures', 'Aux_SixCao_FivePhotographedOfficials',
    'Aux_SixCao_PhotographedBlackAndWhiteFigures', 'Statue_Chenghuang',
    'Statues_MainHall_Officials', 'Statues_MainHall_Warriors',
    'Ornament_Chenghuang_dragon_vertical_plaque',
    'Ornament_MainHall_dougong_and_frieze_R01',
    'Ornament_Xiandian_brackets_R14', 'Ornament_MainHall_ridge_R12_R15',
}


def reset():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for col in list(bpy.data.collections):
        if col.name != 'Collection':
            bpy.data.collections.remove(col)
    bpy.context.preferences.filepaths.save_version = 0


def mark_export(objects):
    col = bpy.data.collections.new('EXPORT')
    bpy.context.scene.collection.children.link(col)
    for obj in objects:
        for existing in list(obj.users_collection):
            existing.objects.unlink(obj)
        col.objects.link(obj)
    return col


def empty(name, world_location, parent=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = world_location
    bpy.context.view_layer.update()
    if parent:
        matrix = obj.matrix_world.copy()
        obj.parent = parent
        obj.matrix_world = matrix
        bpy.context.view_layer.update()
    return obj


def parent_keep(obj, target):
    matrix = obj.matrix_world.copy()
    obj.parent = target
    obj.matrix_world = matrix
    bpy.context.view_layer.update()


def export_gltf(name, scene_name):
    destination = MODELS / name
    destination.mkdir(parents=True, exist_ok=True)
    for obj in bpy.context.selected_objects:
        obj.select_set(False)
    objects = list(bpy.data.collections['EXPORT'].objects)
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(
        filepath=str(destination / (name + '.gltf')),
        export_format='GLTF_SEPARATE', use_selection=True,
        export_cameras=False, export_lights=False, export_animations=False,
    )
    target = destination / (name + '.gltf')
    data = json.loads(target.read_text(encoding='utf8'))
    data['scenes'][0]['name'] = scene_name
    data.setdefault('asset', {}).setdefault('extras', {})['source'] = 'Existing Pingyao project assets / authored demo props'
    target.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf8')
    report = {'file': str(target.relative_to(ROOT)), 'scene': scene_name, 'triangles': 0, 'nodes': []}
    for obj in objects:
        if obj.type == 'MESH':
            obj.data.calc_loop_triangles()
            triangles = len(obj.data.loop_triangles)
            report['triangles'] += triangles
            report['nodes'].append({'name': obj.name, 'triangles': triangles})
    return report


def lighting():
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE_NEXT'
    scene.eevee.taa_render_samples = 24
    scene.render.resolution_x = 1100
    scene.render.resolution_y = 760
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.view_settings.view_transform = 'AgX'
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (.66, .72, .71, 1)
    bg.inputs['Strength'].default_value = .65
    data = bpy.data.lights.new('_PreviewSun', 'SUN')
    light = bpy.data.objects.new('_PreviewSun', data)
    bpy.context.scene.collection.objects.link(light)
    light.rotation_euler = (math.radians(25), math.radians(-24), math.radians(-30))
    data.energy = 2.2
    data.angle = .12
    return scene


def render(name, position, target, ortho=None):
    scene = bpy.context.scene
    camdata = bpy.data.cameras.new('_PreviewCamera')
    camera = bpy.data.objects.new('_PreviewCamera', camdata)
    scene.collection.objects.link(camera)
    camera.location = position
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    if ortho:
        camdata.type = 'ORTHO'
        camdata.ortho_scale = ortho
    else:
        camdata.lens = 32
    scene.camera = camera
    scene.render.filepath = str(PREVIEW / (name + '.png'))
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(camera, do_unlink=True)


def prepare_temple():
    reset()
    bpy.ops.import_scene.gltf(filepath=str(PROJECT / '城隍庙场景_v03' / '模型' / 'temple.glb'))
    for obj in list(bpy.data.objects):
        if obj.name not in TEMPLE_MODULES:
            bpy.data.objects.remove(obj, do_unlink=True)
    mark_export(list(bpy.data.objects))
    report = export_gltf('temple', 'Temple')
    lighting()
    render('temple_courtyard', (12, -10, 9), (0, 9, 1.5))
    render('temple_overview', (35, -26, 35), (0, 4, 0), 65)
    bpy.ops.wm.save_as_mainfile(filepath=str(WORK / 'temple_demo.blend'))
    return report


def prepare_visitor():
    reset()
    bpy.ops.import_scene.gltf(filepath=str(PROJECT / '城隍庙场景_v03' / '模型' / 'player.glb'))
    meshes = {obj.name: obj for obj in bpy.data.objects if obj.type == 'MESH'}
    rig = empty('VisitorRig', (0, 0, 0))
    torso = empty('Torso', (0, 0, .46), rig)
    robe = empty('RobePivot', (0, 0, .46), torso)
    head = empty('HeadPivot', (0, 0, .693), torso)
    arms = {side: empty('Arm_' + side, (sign * .14, 0, .62), torso)
            for side, sign in [('L', -1), ('R', 1)]}
    legs = {side: empty('Leg_' + side, (sign * .073, 0, .30), rig)
            for side, sign in [('L', -1), ('R', 1)]}
    for name, obj in meshes.items():
        if name.startswith(('Sleeve_', 'Cuff_', 'Hand_')):
            target = arms[name[-1]]
        elif name.startswith(('Sole_', 'Shoe_', 'Trouser_')):
            target = legs[name[-1]]
        elif name.startswith(('Head', 'Ear_', 'Eye_', 'Hair')):
            target = head
        elif name == 'Tunic_Main':
            target = robe
        else:
            target = torso
        parent_keep(obj, target)
    for side, sign in [('L', -1), ('R', 1)]:
        empty('HandSocket_' + side, (sign * .225, -.014, .385), arms[side])
    mark_export(list(bpy.data.objects))
    report = export_gltf('visitor', 'Visitor')
    # Read exported local transforms rather than relying on Blender parent UI values.
    gltf = json.loads((MODELS / 'visitor' / 'visitor.gltf').read_text(encoding='utf8'))
    useful = ['VisitorRig', 'Torso', 'RobePivot', 'HeadPivot', 'Arm_L', 'Arm_R', 'Leg_L', 'Leg_R', 'HandSocket_L', 'HandSocket_R']
    riginfo = {'up': '+Y', 'forward': '+Z', 'height': 1.158, 'angleUnit': 'degrees',
               'nodes': [{k: v for k, v in node.items() if k in ('name', 'translation', 'rotation', 'scale', 'children')}
                         for node in gltf['nodes'] if node.get('name') in useful],
               'suggestedPoses': {
                   'hold': {'Arm_L.euler': [-74, 0, 25], 'Arm_R.euler': [-74, 0, -25], 'Arm_L.position.x': -.06, 'Arm_R.position.x': .06},
                   'raise': {'Arm_L.euler': [-119, 0, 25], 'Arm_R.euler': [-119, 0, -25], 'Arm_L.position.x': -.06, 'Arm_R.position.x': .06},
                   'bow': {'Torso.euler': [30, 0, 0], 'Arm_L.euler': [-65, 0, 27], 'Arm_R.euler': [-65, 0, -27], 'Arm_L.position.x': -.06, 'Arm_R.position.x': .06},
                   'sit': {'Torso.position.y': .30, 'RobePivot.scale.y': .72, 'Leg_L.position.y': .17, 'Leg_R.position.y': .17, 'Leg_L.euler': [-62, 0, 63], 'Leg_R.euler': [-62, 0, -63]},
               }}
    (WORK / 'visitor_rig.json').write_text(json.dumps(riginfo, ensure_ascii=False, indent=2), encoding='utf8')
    lighting()
    # Stage is outside the EXPORT collection.
    bpy.ops.mesh.primitive_plane_add(size=200)
    stage = bpy.context.object
    stage.name = '_PreviewStage'
    stage.location.z = -.003
    render('visitor_front', (0, -3, 1.2), (0, 0, .58), 1.65)
    render('visitor_side', (3, -.2, 1.15), (0, 0, .58), 1.65)
    render('visitor_back', (0, 3, 1.1), (0, 0, .58), 1.65)
    bpy.ops.wm.save_as_mainfile(filepath=str(WORK / 'visitor_demo.blend'))
    return report


if __name__ == '__main__':
    if '--visitor-only' in sys.argv:
        old_report = WORK / 'asset-report.json'
        reports = json.loads(old_report.read_text(encoding='utf8'))[:1] if old_report.exists() else []
        reports.append(prepare_visitor())
    else:
        reports = [prepare_temple(), prepare_visitor()]
    (WORK / 'asset-report.json').write_text(json.dumps(reports, ensure_ascii=False, indent=2), encoding='utf8')
    print('DEMO_ASSETS_READY', json.dumps([{k: v for k, v in r.items() if k != 'nodes'} for r in reports]))
