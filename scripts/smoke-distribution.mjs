import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { createDistribution } from './package-distribution.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = createDistribution();
mkdirSync(join(root, '.cache'), { recursive: true });
const data = mkdtempSync(join(root, '.cache', 'distribution dados-'));
assert(!existsSync(join(directory, 'apps/controller/src')));
assert(!existsSync(join(directory, '.agents')));
assert(!existsSync(join(directory, 'node_modules/typescript')));
const main = pathToFileURL(join(directory, 'dist/apps/controller/src/main.js')).href;
const execution = pathToFileURL(join(directory, 'dist/apps/controller/src/modules/execution/index.js')).href;
const storage = pathToFileURL(join(directory, 'dist/apps/controller/src/modules/storage/index.js')).href;
const code = `
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { startController } from ${JSON.stringify(main)};
import { createExecution } from ${JSON.stringify(execution)};
import { openStorage } from ${JSON.stringify(storage)};
const reservation = createServer();
await new Promise((resolve,reject) => { reservation.once('error',reject); reservation.listen(0,'127.0.0.1',resolve); });
const port = reservation.address().port;
await new Promise((resolve,reject)=>reservation.close(error=>error?reject(error):resolve()));
Object.assign(process.env, { FACTORY_PORT: String(port), FACTORY_BIND_HOST:'127.0.0.1', FACTORY_BROWSER_ORIGIN:'http://127.0.0.1:'+port, FACTORY_LOG_LEVEL:'silent', FACTORY_DATA_DIR:${JSON.stringify(data)} });
await assert.rejects(startController(), error => error.code === 'CONTEXT_MISSING');
// Controlled preflight is a local test seam, never evidence of Maestri connectivity.
const dependencies = { executionFactory: options => ({ ...createExecution(options), preflight:async()=>({ready:true,code:null,ompVersion:'18.11.1'}) }) };
let app;
try {
  app = await startController({},dependencies);
  const origin = process.env.FACTORY_BROWSER_ORIGIN;
  const html = await fetch(origin,{headers:{'sec-fetch-site':'none','sec-fetch-mode':'navigate'}}); assert.equal(html.status,200);
  assert.match(html.headers.get('content-type'),/^text\\/html/);
  assert.equal(html.headers.get('cache-control'),'no-store');
  assert.equal(html.headers.get('set-cookie'),null);
  const document = await html.text();
  const bundle = /src="([^"]+\\.js)"/.exec(document)?.[1]; assert(bundle);
  const js = await fetch(origin+bundle); assert.equal(js.status,200); assert((await js.text()).length>100);
  assert.equal(js.headers.get('cache-control'),'public, max-age=31536000, immutable');
  const stylesheet = /href="([^"]+\\.css)"/.exec(document)?.[1]; assert(stylesheet);
  const css = await fetch(origin+stylesheet); assert.equal(css.status,200); assert((await css.text()).length>100);
  assert.equal((await fetch(origin,{method:'HEAD'})).status,200);
  assert.equal((await fetch(origin+bundle,{method:'HEAD'})).status,200);
  assert.equal((await fetch(origin,{headers:{origin:'http://foreign.invalid'}})).status,403);
  assert.equal((await fetch(origin+bundle,{headers:{origin:'http://foreign.invalid'}})).status,403);
  assert.equal((await fetch(origin+'/api/v1/settings')).status,401);
  assert.equal((await fetch(origin+'/api/v1/events/stream')).status,401);
  assert.equal((await fetch(origin+'/api/v1/unknown')).status,401);
  assert.equal((await fetch(origin+'/api/v1/health')).status,200);
  assert.equal((await fetch(origin+'/api/v1/health',{headers:{origin:'http://foreign.invalid'}})).status,403);
  const session = await fetch(origin+'/api/v1/session',{method:'POST',headers:{origin,'content-type':'application/json','x-factory-client':'web'},body:'{}'});
  assert.equal(session.status,200);
  const cookie=session.headers.get('set-cookie').split(';')[0];
  const options=await fetch(origin+'/api/v1/scaffold/options',{headers:{cookie}});
  assert.equal(options.status,200); assert.equal((await options.json()).catalog.id,'factory.engineering');
  const store=openStorage({dataDirectory:process.env.FACTORY_DATA_DIR});
  const identity=store.getSettings().installationId; store.close();
  await app.close(); app=undefined;
  app=await startController({},dependencies);
  assert.equal((await fetch(origin+'/api/v1/settings',{headers:{cookie}})).status,401);
  const reopened=openStorage({dataDirectory:process.env.FACTORY_DATA_DIR});
  assert.equal(reopened.getSettings().installationId,identity); reopened.close();
  console.log(JSON.stringify({assetsAndApi:'same_loopback_origin',sqlite:'native',restart:'sessions_revoked_identity_preserved',anchor:'controlled',maestriOmp:'not_executed'}));
} finally { if(app) await app.close(); }
`;
try {
  const result = await promisify(execFile)(process.execPath, ['--input-type=module', '--eval', code], {
    cwd: data, timeout: 60_000, maxBuffer: 65_536, windowsHide: true,
  });
  // Only our closed summary is forwarded; native stderr and exception/environment are discarded.
  const summary = JSON.parse(result.stdout.trim());
  assert.equal(summary.maestriOmp, 'not_executed');
  console.log(JSON.stringify({ distribution: directory, ...summary }));
} catch {
  console.error(JSON.stringify({ code: 'DISTRIBUTION_SMOKE_FAILED', message: 'Relocated HTTP/SQLite smoke failed; package and test data preserved for diagnosis.' }));
  process.exitCode = 1;
}
