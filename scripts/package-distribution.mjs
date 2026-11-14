import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

/** Package a compiled installation, never project data, environment, caches or personal skills.
 * Native dependencies make the result specific to this OS/architecture and Node 24 ABI.
 */
export function createDistribution() {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
  for (const file of ['dist/apps/controller/src/main.js', 'dist/web/index.html', 'dist/web/favicon.ico',
    'dist/packages/contracts/src/index.js', 'dist/resources/roles/implementer.v1.json',
    'dist/resources/roles/reviewer.v1.json', 'dist/resources/templates/catalog.v1.json',
    'dist/resources/storage/057_issue_body_effect.sql', 'dist/resources/storage/initial-schema.v58.sql',
    'dist/resources/storage/schema-recognition.v1.json']) {
    if (!existsSync(join(root, file))) throw new Error('DISTRIBUTION_BUILD_REQUIRED');
  }
  if (existsSync(join(root, 'dist/apps/controller/src/modules/storage/migrations'))) {
    throw new Error('DISTRIBUTION_HISTORICAL_MIGRATIONS_INCLUDED');
  }
  mkdirSync(join(root, 'build'), { recursive: true });
  const target = mkdtempSync(join(root, 'build', 'Fábrica distribuição-'));
  /** @param {string} source @param {string} destination @param {boolean} [excludeNestedModules] */
  function copy(source, destination, excludeNestedModules = false, runtimeOnly = false) {
    cpSync(source, destination, { recursive: true, errorOnExist: true, force: false, filter: current => {
      if (excludeNestedModules && current !== source && basename(current) === 'node_modules') return false;
      if (runtimeOnly && (current.endsWith('.d.ts') || current.endsWith('.map'))) return false;
      const info = lstatSync(current);
      if (info.isSymbolicLink() || !(info.isFile() || info.isDirectory())) throw new Error('DISTRIBUTION_RESOURCE_REDIRECTED');
      return true;
    } });
  }
  for (const name of ['apps/controller', 'packages/contracts', 'resources', 'web']) {
    copy(join(root, 'dist', name), join(target, 'dist', name), false, true);
  }
  copy(join(root, 'package-lock.json'), join(target, 'package-lock.json'));
  mkdirSync(join(target, 'scripts'));
  copy(join(root, 'scripts/start-host.mjs'), join(target, 'scripts/start-host.mjs'));
  const runtimeManifest = { ...manifest, scripts: { start: manifest.scripts.start },
    imports: { '#contracts': './dist/packages/contracts/src/index.js' } };
  delete runtimeManifest.devDependencies;
  writeFileSync(join(target, 'package.json'), JSON.stringify(runtimeManifest, null, 2) + '\n', { flag: 'wx' });
  let packages = 0;
  for (const [name, entry] of Object.entries(lock.packages)) {
    if (!name || entry.dev) continue;
    if (!/^node_modules\/(?:@[^/]+\/)?[^/]+(?:\/node_modules\/(?:@[^/]+\/)?[^/]+)*$/.test(name) || entry.link) throw new Error('DISTRIBUTION_LOCK_INVALID');
    const source = join(root, name);
    if (!existsSync(source)) {
      if (entry.optional) continue;
      throw new Error('DISTRIBUTION_DEPENDENCY_MISSING');
    }
    copy(source, join(target, name), true);
    packages++;
  }
  writeFileSync(join(target, 'distribution.json'), JSON.stringify({ formatVersion: 1, version: manifest.version, createdAt: new Date().toISOString(), nodeMajor: 24, databasePath: 'var/factory/factory.sqlite',
    platform: process.platform, architecture: process.arch, nativeModulesAbi: process.versions.modules, packages }, null, 2) + '\n', { flag: 'wx' });
  return target;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify({ directory: createDistribution(), nativeIntegration: 'not_executed' })); }
  catch { console.error(JSON.stringify({ code: 'DISTRIBUTION_FAILED', message: 'Check build, lockfile and installed production dependencies. Partial package is preserved under build.' })); process.exitCode = 1; }
}
