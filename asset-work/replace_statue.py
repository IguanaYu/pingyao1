"""Swap the demo main-hall statue for the v03 simplified-face Chenghuang statue.

Blender 4.2 --background --python asset-work/replace_statue.py
Opens asset-work/temple_demo.blend, replaces object Statue_Chenghuang with the
STATUE_EDITABLE collection appended from A风格样间_v03_简化脸部, realigns it to
the old statue's footprint (same height, feet and back plane, facing -Y),
renders previews and saves the blend. Export happens separately via export_blends.py.
"""
import json
import math
from pathlib import Path

import bpy
from mathutils import Vector

WORK = Path(__file__).resolve().parent
ROOT = WORK.parent
PROJECT = ROOT.parent
PREVIEW = WORK / 'previews'
PREVIEW.mkdir(parents=True, exist_ok=True)
SOURCE = PROJECT / 'A风格样间_v03_简化脸部' / '源文件' / 'statue_editable.blend'
TARGET_NAME = 'Statue_Chenghuang'


def world_bbox(obj):
    corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    return (
        Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners))),
        Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners))),
    )


def select_only(objects, active=None):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.hide_set(False)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = active or objects[0]


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
    sun_data = bpy.data.lights.new('_PreviewSun', 'SUN')
    sun = bpy.data.objects.new('_PreviewSun', sun_data)
    bpy.context.scene.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(25), math.radians(-24), math.radians(-30))
    sun_data.energy = 2.2
    sun_data.angle = .12
    # Interior fill so the seated statue reads inside the dark hall.
    fill_data = bpy.data.lights.new('_PreviewFill', 'POINT')
    fill_data.energy = 600
    fill_data.shadow_soft_size = 1.5
    fill = bpy.data.objects.new('_PreviewFill', fill_data)
    bpy.context.scene.collection.objects.link(fill)
    fill.location = (0, 21.0, 3.8)
    return scene


def render(name, position, target, lens=40):
    scene = bpy.context.scene
    camdata = bpy.data.cameras.new('_PreviewCamera')
    camera = bpy.data.objects.new('_PreviewCamera', camdata)
    scene.collection.objects.link(camera)
    camera.location = position
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camdata.lens = lens
    scene.camera = camera
    scene.render.filepath = str(PREVIEW / (name + '.png'))
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(camera, do_unlink=True)


def main():
    bpy.ops.wm.open_mainfile(filepath=str(WORK / 'temple_demo.blend'))
    bpy.context.preferences.filepaths.save_version = 0

    old = bpy.data.objects.get(TARGET_NAME)
    if old is None:
        raise RuntimeError('temple_demo.blend has no Statue_Chenghuang')
    old_min, old_max = world_bbox(old)
    reference_ids = old.get('reference_ids')
    bpy.data.objects.remove(old, do_unlink=True)
    print(f'OLD_BBOX min={tuple(old_min)} max={tuple(old_max)}')

    with bpy.data.libraries.load(str(SOURCE), link=False) as (data_from, data_to):
        wanted = [c for c in data_from.collections if c == 'STATUE_EDITABLE']
        if not wanted:
            raise RuntimeError('statue_editable.blend has no STATUE_EDITABLE collection')
        data_to.collections = wanted
    appended_col = bpy.data.collections.get('STATUE_EDITABLE')
    bpy.context.scene.collection.children.link(appended_col)
    appended = list(appended_col.objects)
    print(f'APPENDED {len(appended)} objects')

    for obj in appended:
        if obj.type == 'CURVE':
            select_only([obj])
            bpy.ops.object.convert(target='MESH')
    select_only(appended)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    body = bpy.data.objects.get('STATUE')
    select_only(appended, active=body)
    bpy.ops.object.join()
    merged = bpy.context.view_layer.objects.active
    merged.name = TARGET_NAME
    if reference_ids is not None:
        merged['reference_ids'] = reference_ids
    j_min, j_max = world_bbox(merged)
    print(f'JOINED name={merged.name!r} loc={tuple(round(v, 4) for v in merged.location)} '
          f'scale={tuple(round(v, 4) for v in merged.scale)} '
          f'bbox=[{j_min.x:.3f},{j_min.y:.3f},{j_min.z:.3f}]->[{j_max.x:.3f},{j_max.y:.3f},{j_max.z:.3f}] '
          f'objects_left={len(appended_col.objects)}')

    merged_min, merged_max = world_bbox(merged)
    feet_center = Vector((merged_min.x + merged_max.x, merged_min.y + merged_max.y, merged_min.z))
    feet_center.x *= .5
    feet_center.y *= .5
    bpy.context.scene.cursor.location = feet_center
    select_only([merged])
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR', center='MEDIAN')
    bpy.context.view_layer.update()
    c2 = [Vector(c) for c in merged.bound_box]
    print(f'ORIGIN_SET cursor={tuple(round(v, 4) for v in feet_center)} loc={tuple(round(v, 4) for v in merged.location)} '
          f'scale={tuple(round(v, 4) for v in merged.scale)} '
          f'local=[{min(v.x for v in c2):.3f},{min(v.y for v in c2):.3f},{min(v.z for v in c2):.3f}]->'
          f'[{max(v.x for v in c2):.3f},{max(v.y for v in c2):.3f},{max(v.z for v in c2):.3f}]')
    corners = [Vector(c) for c in merged.bound_box]
    local_min = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
    local_max = Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))

    old_height = old_max.z - old_min.z
    scale = old_height / (local_max.z - local_min.z)
    merged.rotation_euler = (0, 0, 0)
    merged.scale = (scale, scale, scale)
    # Feet on the old floor, back plane against the old shrine board, facing -Y.
    merged.location = ((old_min.x + old_max.x) * .5, old_max.y - scale * local_max.y, old_min.z)
    bpy.context.view_layer.update()
    print(f'PLACED loc={tuple(merged.location)} scale={tuple(merged.scale)} '
          f'matrix_world={["%.3f" % v for row in merged.matrix_world for v in row]} local_min={tuple(local_min)} local_max={tuple(local_max)}')

    export_col = bpy.data.collections['EXPORT']
    for col in list(merged.users_collection):
        col.objects.unlink(merged)
    export_col.objects.link(merged)
    bpy.context.scene.collection.children.unlink(appended_col)
    bpy.data.collections.remove(appended_col)
    bpy.data.orphans_purge(do_local_ids=True, do_linked_ids=False, do_recursive=True)

    merged.data.calc_loop_triangles()
    triangles = len(merged.data.loop_triangles)
    new_min, new_max = world_bbox(merged)
    report = {
        'source': str(SOURCE.relative_to(PROJECT)),
        'old_bbox': {'min': list(old_min), 'max': list(old_max)},
        'new_bbox': {'min': list(new_min), 'max': list(new_max)},
        'scale': round(scale, 6),
        'triangles': triangles,
    }
    (WORK / 'statue-swap.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
    print('SWAP_REPORT', json.dumps(report))

    lighting()
    render('statue_v03_front', (0, 19.6, 2.7), (0, 23.2, 2.4))
    render('statue_v03_threequarter', (2.6, 20.4, 2.9), (0, 23.3, 2.4))
    bpy.ops.wm.save_as_mainfile(filepath=str(WORK / 'temple_demo.blend'))
    print('STATUE_SWAPPED')


main()
