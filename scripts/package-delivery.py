"""Package the portable demo, excluding editor downloads and installed dependencies."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib
import json
import os

root = Path(__file__).resolve().parent.parent
target = root.parent / '城隍庙_Cocos演示版_M1-M3.zip'
included_dirs = {'client', 'web', 'server', 'shared', 'asset-work', 'scripts', 'deploy', 'checks', 'third-party', 'client-tools'}
excluded_dirs = {'node_modules', '.npm-cache', 'library', 'temp', 'build', '__pycache__', '.git'}
files = []
for folder, dirs, names in os.walk(root):
    dirs[:] = [name for name in dirs if name not in excluded_dirs and (Path(folder) != root or name in included_dirs)]
    for name in names:
        item = Path(folder) / name
        rel = item.relative_to(root)
        if item.suffix in {'.log', '.blend1'} or item.name == 'delivery-manifest.json':
            continue
        files.append((item, rel))
files.sort(key=lambda pair: pair[1].as_posix())
manifest = {'files': [{'path': rel.as_posix(), 'bytes': item.stat().st_size,
    'sha256': hashlib.sha256(item.read_bytes()).hexdigest()} for item, rel in files]}
manifest_path = root / 'checks' / 'delivery-manifest.json'
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
with ZipFile(target, 'w', compression=ZIP_DEFLATED, compresslevel=6) as bundle:
    for item, rel in files:
        bundle.write(item, '城隍庙演示版/' + rel.as_posix())
    bundle.write(manifest_path, '城隍庙演示版/checks/delivery-manifest.json')
with ZipFile(target) as bundle:
    assert bundle.testzip() is None
    names = set(bundle.namelist())
    for required in ['web/index.html','web/lib/colyseus.js','server/dist/index.js',
                     'server/package-lock.json','shared/scene.json','client/package.json',
                     '启动演示.cmd','交付说明.md','部署说明.md']:
        assert '城隍庙演示版/' + required in names, required
print(json.dumps({'zip': str(target), 'files': len(files)+1, 'bytes': target.stat().st_size,
    'sha256': hashlib.sha256(target.read_bytes()).hexdigest()}, ensure_ascii=False, indent=2))
