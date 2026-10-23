import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
const root = resolve('dist/web');
const server = createServer(async (req, res) => {
  const path = resolve(root, '.' + new URL(req.url, 'http://127.0.0.1').pathname);
  if (path !== root && !path.startsWith(root + sep) || req.url.startsWith('/api/')) return res.writeHead(503).end();
  try { const file = path === root ? resolve(root, 'index.html') : path; res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' }[extname(file)] ?? 'application/octet-stream'); res.end(await readFile(file)); } catch { res.writeHead(404).end(); }
});
server.listen(4310, '127.0.0.1', () => process.stdout.write(JSON.stringify({ ownStaticServer: process.pid, port: 4310 })));
