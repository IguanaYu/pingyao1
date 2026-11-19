"""Read-only probe of the v03 statue_editable.blend structure.

Blender 4.2 --background --python asset-work/inspect_statue_source.py
Prints collections, objects, modifiers, transforms and evaluated triangle counts.
"""
from pathlib import Path

import bpy

WORK = Path(__file__).resolve().parent
SOURCE = WORK.parent.parent / 'A风格样间_v03_简化脸部' / '源文件' / 'statue_editable.blend'

bpy.ops.wm.open_mainfile(filepath=str(SOURCE))

print('COLLECTIONS', [c.name for c in bpy.data.collections])
depsgraph = bpy.context.evaluated_depsgraph_get()
for obj in bpy.data.objects:
    evaluated = obj.evaluated_get(depsgraph)
    me = evaluated.to_mesh()
    me.calc_loop_triangles()
    mats = sorted({slot.material.name for slot in obj.material_slots if slot.material})
    print(f'OBJ {obj.name!r} type={obj.type} loc={tuple(round(v, 4) for v in obj.location)} '
          f'scale={tuple(round(v, 4) for v in obj.scale)} rot={tuple(round(v, 4) for v in obj.rotation_euler)} '
          f'tris={len(me.loop_triangles)} verts={len(me.vertices)} polys={len(me.polygons)}')
    print(f'  modifiers={[m.name + ":" + m.type for m in obj.modifiers]}')
    print(f'  collections={[c.name for c in obj.users_collection]}')
    print(f'  materials={mats}')
    evaluated.to_mesh_clear()
print('PROBE_DONE')
