import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { createDistribution } from './package-distribution.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = createDistribution();
const packagedFavicon = join(directory, 'dist', 'web', 'favicon.ico');
mkdirSync(join(root, '.cache'), { recursive: true });
const data = mkdtempSync(join(root, '.cache', 'distribution dados-'));
assert(!existsSync(join(directory, 'apps/controller/src')));
assert(!existsSync(join(directory, 'dist/apps/controller/src/modules/storage/migrations')));
assert.deepEqual(readdirSync(join(directory, 'dist/resources/storage')).sort(), [
  '055_issue_history_repository_reference.sql', 'initial-schema.v56.sql', 'schema-recognition.v1.json',
]);
assert(!existsSync(join(directory, '.agents')));
assert(!existsSync(join(directory, 'node_modules/typescript')));
const main = pathToFileURL(join(directory, 'dist/apps/controller/src/main.js')).href;
const launcher = pathToFileURL(join(directory, 'scripts/start-host.mjs')).href;
const execution = pathToFileURL(join(directory, 'dist/apps/controller/src/modules/execution/index.js')).href;
const storage = pathToFileURL(join(directory, 'dist/apps/controller/src/modules/storage/index.js')).href;
const configuration = pathToFileURL(join(directory, 'dist/apps/controller/src/config.js')).href;
const fixedData = join(directory, 'var', 'factory');
const lockProbe = `import {startController} from ${JSON.stringify(main)};
try { await startController(); process.exitCode=1; }
catch(error) { console.log(JSON.stringify({code:error.code})); }`;
// Separate native processes and cwd values must resolve the same distributed database path.
const pathProbe = `import {loadConfiguration} from ${JSON.stringify(configuration)};
import {join} from 'node:path';
console.log(join(loadConfiguration({FACTORY_DATA_DIR:'ignored-override'},${JSON.stringify(directory)}).dataDirectory,'factory.sqlite'));`;
for (const cwd of [directory, data]) {
  const probe = await promisify(execFile)(process.execPath, ['--input-type=module', '--eval', pathProbe], { cwd, timeout: 15_000, maxBuffer: 4096, windowsHide: true });
  assert.equal(probe.stdout.trim(), join(fixedData, 'factory.sqlite'));
}
const code = `
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { hostname } from 'node:os';
import { startController } from ${JSON.stringify(main)};
import { createExecution } from ${JSON.stringify(execution)};
import { openStorage } from ${JSON.stringify(storage)};
import { readFileSync } from 'node:fs';
const reservation = createServer();
await new Promise((resolve,reject) => { reservation.once('error',reject); reservation.listen(0,'127.0.0.1',resolve); });
const port = reservation.address().port;
await new Promise((resolve,reject)=>reservation.close(error=>error?reject(error):resolve()));
Object.assign(process.env, { FACTORY_PORT: String(port), FACTORY_BIND_HOST:'127.0.0.1', FACTORY_BROWSER_ORIGIN:'http://127.0.0.1:'+port, FACTORY_LOG_LEVEL:'silent', FACTORY_DATA_DIR:${JSON.stringify(data)} });
const { hostContext } = await import(${JSON.stringify(launcher)});
const accessible = await startController(hostContext([]));
try {
  const origin = process.env.FACTORY_BROWSER_ORIGIN;
  assert.equal((await fetch(origin+'/api/v1/health')).status,200);
  const bootstrap = await fetch(origin+'/api/v1/session',{method:'POST',headers:{origin,'content-type':'application/json','x-factory-client':'web'},body:'{}'});
  assert.equal(bootstrap.status,200);
  const cookie = bootstrap.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(origin+'/api/v1/settings',{headers:{cookie}})).status,200);
} finally { await accessible.close(); }
// Controlled preflight is a local test seam, never evidence of Maestri connectivity.
const dependencies = { executionFactory: options => ({ ...createExecution(options), preflight:async()=>({ready:true,code:null,ompVersion:'18.11.1'}) }) };
let app;
try {
  app = await startController({},dependencies);
  const contender = await promisify(execFile)(process.execPath, ['--input-type=module','--eval',${JSON.stringify(lockProbe)}], {
    cwd:${JSON.stringify(directory)},timeout:15_000,maxBuffer:4096,windowsHide:true,
  });
  assert.equal(JSON.parse(contender.stdout.trim()).code,'CONTROLLER_LOCK_UNAVAILABLE');
  const origin = process.env.FACTORY_BROWSER_ORIGIN;
  const html = await fetch(origin,{headers:{'sec-fetch-site':'none','sec-fetch-mode':'navigate'}}); assert.equal(html.status,200);
  assert.match(html.headers.get('content-type'),/^text\\/html/);
  assert.equal(html.headers.get('cache-control'),'no-store');
  assert.equal(html.headers.get('set-cookie'),null);
  const document = await html.text();
  assert.match(document, /<link rel="icon" href="\\/favicon\\.ico"[^>]*type="image\\/vnd\\.microsoft\\.icon"/);
  const favicon = await fetch(origin+'/favicon.ico',{headers:{'sec-fetch-site':'none','sec-fetch-mode':'navigate'}});
  assert.equal(favicon.status,200);
  assert.equal(favicon.headers.get('content-type'),'image/vnd.microsoft.icon');
  assert.equal(favicon.headers.get('cache-control'),'public, max-age=31536000, immutable');
  assert.equal(favicon.headers.get('set-cookie'),null);
  const iconBytes=Buffer.from(await favicon.arrayBuffer());
  assert.deepEqual(iconBytes,readFileSync(${JSON.stringify(packagedFavicon)}));
  assert.deepEqual([...iconBytes.subarray(0,6)],[0,0,1,0,1,0]);
  assert.deepEqual([...iconBytes.subarray(6,8)],[32,32]);
  const faviconHead=await fetch(origin+'/favicon.ico',{method:'HEAD'});
  assert.equal(faviconHead.status,200);
  assert.equal(faviconHead.headers.get('content-type'),'image/vnd.microsoft.icon');
  assert.equal(faviconHead.headers.get('content-length'),String(iconBytes.length));
  const bundle = /src="([^"]+\\.js)"/.exec(document)?.[1]; assert(bundle);
  const js = await fetch(origin+bundle); assert.equal(js.status,200); assert((await js.text()).length>100);
  assert.equal(js.headers.get('cache-control'),'public, max-age=31536000, immutable');
  const stylesheet = /href="([^"]+\\.css)"/.exec(document)?.[1]; assert(stylesheet);
  const css = await fetch(origin+stylesheet); assert.equal(css.status,200); assert((await css.text()).length>100);
  assert.equal((await fetch(origin,{method:'HEAD'})).status,200);
  assert.equal((await fetch(origin+bundle,{method:'HEAD'})).status,200);
  assert.equal((await fetch(origin,{headers:{origin:'http://foreign.invalid'}})).status,403);
  assert.equal((await fetch(origin+bundle,{headers:{origin:'http://foreign.invalid'}})).status,403);
  assert.equal((await fetch(origin+'/favicon.ico',{headers:{origin:'http://foreign.invalid'}})).status,403);
  for (const path of ['/api/v1/settings','/api/v1/operations/00000000-0000-4000-8000-000000000000','/api/v1/events','/api/v1/events/stream','/api/v1/diagnostics','/api/v1/projects','/api/v1/attempts','/api/v1/unknown']) {
    assert.equal((await fetch(origin+path)).status,401);
  }
  assert.equal((await fetch(origin+'/api/v1/health')).status,200);
  assert.equal((await fetch(origin+'/api/v1/health',{headers:{origin:'http://foreign.invalid'}})).status,403);
  const session = await fetch(origin+'/api/v1/session',{method:'POST',headers:{origin,'content-type':'application/json','x-factory-client':'web'},body:'{}'});
  assert.equal(session.status,200);
  const cookie=session.headers.get('set-cookie').split(';')[0];
  const options=await fetch(origin+'/api/v1/scaffold/options',{headers:{cookie}});
  assert.equal(options.status,200); assert.equal((await options.json()).catalog.id,'factory.engineering');
  assert.equal((await fetch(origin+'/api/v1/settings',{method:'PUT',headers:{origin,'content-type':'application/json','idempotency-key':'00000000-0000-4000-8000-000000000000','if-match':'"invalid"',cookie},body:'{}'})).status,403);
  const store=openStorage({dataDirectory:${JSON.stringify(fixedData)}});
  assert.equal(store.getSettings().designated_host,hostname());
  const identity=store.getSettings().installation_id; store.close();
  await app.close(); app=undefined;
  app=await startController({},dependencies);
  assert.equal((await fetch(origin+'/api/v1/settings',{headers:{cookie}})).status,401);
  const reopened=openStorage({dataDirectory:${JSON.stringify(fixedData)}});
  assert.equal(reopened.getSettings().installation_id,identity); reopened.close();
  console.log(JSON.stringify({assetsAndApi:'same_loopback_origin',sqlite:'native',fixedDatabase:'var/factory/factory.sqlite',distinctCwdProcesses:2,secondController:'refused',localHost:'captured',restart:'sessions_revoked_identity_preserved',anchor:'controlled',maestriOmp:'not_executed'}));
} finally { if(app) await app.close(); }
`;
try {
  const result = await promisify(execFile)(process.execPath, ['--input-type=module', '--eval', code], {
    cwd: data, timeout: 60_000, maxBuffer: 65_536, windowsHide: true,
  });
  // Only our closed summary is forwarded; native stderr and exception/environment are discarded.
  const summary = JSON.parse(result.stdout.trim());
  assert.equal(summary.maestriOmp, 'not_executed');
  assert(existsSync(join(fixedData, 'factory.sqlite')));
  assert(!existsSync(join(data, 'factory.sqlite')));
  console.log(JSON.stringify({ distribution: directory, ...summary }));
} catch {
  console.error(JSON.stringify({ code: 'DISTRIBUTION_SMOKE_FAILED', message: 'Relocated HTTP/SQLite smoke failed; package and test data preserved for diagnosis.' }));
  process.exitCode = 1;
}
