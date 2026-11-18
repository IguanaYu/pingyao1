"""Rebuild Cocos glTF files from the two supplied .blend files only.

Blender 4.2 --background --python asset-work/export_blends.py
No original project folders or third-party Python modules are required.
"""
import json
from pathlib import Path

import bpy

WORK = Path(__file__).resolve().parent
MODELS = WORK.parent / 'client' / 'assets' / 'resources' / 'models'

for asset_name, source_name, scene_name in [
    ('temple', 'temple_demo.blend', 'Temple'),
    ('visitor', 'visitor_demo.blend', 'Visitor'),
]:
    source = WORK / source_name
    if not source.is_file():
        raise FileNotFoundError(source)
    bpy.ops.wm.open_mainfile(filepath=str(source))
    export_collection = bpy.data.collections.get('EXPORT')
    if export_collection is None:
        raise RuntimeError(f'{source_name} has no EXPORT collection')
    bpy.ops.object.select_all(action='DESELECT')
    objects = list(export_collection.all_objects)
    for obj in objects:
        obj.hide_set(False)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    destination = MODELS / asset_name
    destination.mkdir(parents=True, exist_ok=True)
    target = destination / f'{asset_name}.gltf'
    bpy.ops.export_scene.gltf(
        filepath=str(target), export_format='GLTF_SEPARATE', use_selection=True,
        export_cameras=False, export_lights=False, export_animations=False,
    )
    data = json.loads(target.read_text(encoding='utf8'))
    data['scenes'][0]['name'] = scene_name
    target.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf8')
    print(f'EXPORTED {target}')

print('BLEND_ASSETS_EXPORTED')
