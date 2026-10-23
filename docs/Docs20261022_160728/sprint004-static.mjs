import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve('dist/web');
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
  const path = resolve(root, '.' + pathname);
  if ((path !== root && !path.startsWith(root + sep)) || pathname.startsWith('/api/')) { res.writeHead(503).end(); return; }
  try {
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[extname(path === root ? 'index.html' : path)] ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.end(await readFile(path === root ? resolve(root, 'index.html') : path));
  } catch { res.writeHead(404).end(); }
});
server.listen(4310, '127.0.0.1', () => console.log(JSON.stringify({ pid: process.pid, host: '127.0.0.1', port: 4310, mode: 'static-only' })));
