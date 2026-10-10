// 本機展示：node scripts/serve-demo.mjs（先用 build-shards 把資料建到 data/out）
// /         → demo/index.html
// /src/...  → src/
// /v1/...   → data/out/v1/
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const port = Number(process.env.PORT || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };

http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (url === '/panel') {
    // 側邊面板預覽：寬度跟試算表的側邊欄差不多，前面塞假的 google.script.run
    const html = fs.readFileSync(path.join(root, 'addon/Sidebar.html'), 'utf8').replace('<head>',
      '<head><style>html{background:#e8eaed}body{width:300px;min-height:100vh;margin:0 auto;background:#fff;box-shadow:0 0 0 1px #dadce0}</style>'
      + '<script src="/src/names.js"></script><script src="/demo/panel-stub.js"></script>');
    res.writeHead(200, { 'Content-Type': types['.html'] });
    return res.end(html);
  }
  let file;
  if (url === '/') file = path.join(root, 'demo/index.html');
  else if (url.startsWith('/demo/')) file = path.join(root, url);
  else if (url.startsWith('/src/')) file = path.join(root, url);
  else if (url.startsWith('/v1/')) file = path.join(root, 'data/out', url);
  const safe = file && path.resolve(file).startsWith(root) && fs.existsSync(file) && fs.statSync(file).isFile();
  if (!safe) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`http://localhost:${port}`));
