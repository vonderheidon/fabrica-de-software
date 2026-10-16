import { createServer } from 'node:http';
import { writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
const [evidence] = process.argv.slice(2);
const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ensaio Chrome SDK</title><style>body{font:20px system-ui;margin:40px;max-width:720px}input,button{font:inherit;padding:12px;margin:8px 0;max-width:90%}label,output{display:block}</style><h1>Ensaio Chrome SDK</h1><p>Fixture local de integração MCP.</p><form><label for="nome">Nome</label><input id="nome" name="nome" autocomplete="off"><button>Confirmar</button></form><output aria-live="polite">Aguardando confirmação</output><script>document.querySelector('form').onsubmit=e=>{e.preventDefault();document.querySelector('output').textContent='Confirmado: '+document.querySelector('input').value};</script></html>`;
const server = createServer((req, res) => {
  appendFileSync(join(evidence, 'http.jsonl'), JSON.stringify({ at: new Date().toISOString(), url: req.url }) + '\n');
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
});
server.listen(0, '127.0.0.1', () => writeFileSync(join(evidence, 'http-ready.json'), JSON.stringify({ pid: process.pid, url: `http://127.0.0.1:${server.address().port}` })));
