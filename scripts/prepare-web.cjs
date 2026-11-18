const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const web = path.join(root, 'web');
const index = path.join(web, 'index.html');
if (!fs.existsSync(index)) throw new Error('先运行 build-client.ps1 构建 Cocos 网页');
const sdk = path.join(root, 'server/node_modules/@colyseus/sdk/dist/colyseus.js');
if (!fs.existsSync(sdk)) throw new Error('先安装 server 的 npm 依赖');
fs.mkdirSync(path.join(web, 'lib'), { recursive: true });
fs.copyFileSync(sdk, path.join(web, 'lib/colyseus.js'));
function copyTree(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const item of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, item.name), to = path.join(destination, item.name);
    if (item.isDirectory()) copyTree(from, to); else fs.copyFileSync(from, to);
  }
}
copyTree(path.join(root, 'third-party'), path.join(web, 'licenses'));
let html = fs.readFileSync(index, 'utf8');
html = html.replace(/<title>[^<]*<\/title>/, '<title>平遥城隍庙 · 同游</title>');
if (!html.includes('lib/colyseus.js')) html = html.replace('<head>', '<head>\n<script src="./lib/colyseus.js"></script>');
if (!html.includes('theme-color')) html = html.replace('</head>', '<meta name="theme-color" content="#315745">\n</head>');
if (!html.includes('rel="icon"')) html = html.replace('</head>', '<link rel="icon" type="image/svg+xml" href="./favicon.svg">\n</head>');
fs.writeFileSync(index, html);
fs.writeFileSync(path.join(web, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#315745"/><path d="M10 30h44L32 15zM16 34h32v20H16z" fill="#e8ddbf"/><path d="M27 37h10v17H27z" fill="#315745"/></svg>');
fs.writeFileSync(path.join(web, 'runtime-config.json'), JSON.stringify({ serverUrl: 'auto', roomName: 'temple' }, null, 2) + '\n');
console.log('网页整理完成：本地 SDK、中文标题、runtime-config.json');
