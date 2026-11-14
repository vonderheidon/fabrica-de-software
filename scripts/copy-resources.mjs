import { copyFileSync, mkdirSync, readdirSync, cpSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const oldMigrationTarget = new URL('../dist/apps/controller/src/modules/storage/migrations/', import.meta.url);
if (existsSync(oldMigrationTarget)) rmSync(oldMigrationTarget, { recursive: true, force: true });
const storageResources = new URL('../resources/storage/', import.meta.url);
const distributedStorageResources = new URL('../dist/resources/storage/', import.meta.url);
const storageResourceNames = ['057_issue_body_effect.sql', 'initial-schema.v58.sql', 'schema-recognition.v1.json'];
const historicalStorageResourceNames = ['055_issue_history_repository_reference.sql', '056_immediate_controller_shutdown.sql', 'initial-schema.v57.sql', 'initial-schema.v54.sql', 'initial-schema.v55.sql', 'initial-schema.v56.sql'];
const availableStorageResourceNames = readdirSync(storageResources).sort();
if (!storageResourceNames.every(name => availableStorageResourceNames.includes(name)) ||
    availableStorageResourceNames.some(name => ![...storageResourceNames, ...historicalStorageResourceNames].includes(name))) {
  throw new Error('STORAGE_RESOURCES_INVALID');
}
if (existsSync(distributedStorageResources)) rmSync(distributedStorageResources, { recursive: true, force: true });
mkdirSync(distributedStorageResources, { recursive: true });
for (const name of storageResourceNames) {
  copyFileSync(new URL(name, storageResources), new URL(name, distributedStorageResources));
}

const roles = new URL('../resources/roles/', import.meta.url);
const distributedRoles = new URL('../dist/resources/roles/', import.meta.url);
mkdirSync(distributedRoles, { recursive: true });
for (const name of ['implementer.v1.json', 'reviewer.v1.json']) {
  copyFileSync(new URL(name, roles), new URL(name, distributedRoles));
}
cpSync(new URL('../resources/templates/', import.meta.url), new URL('../dist/resources/templates/', import.meta.url), { recursive: true });
cpSync(new URL('../resources/deletion/', import.meta.url), new URL('../dist/resources/deletion/', import.meta.url), { recursive: true });

if (process.platform === 'win32') {
  const nativeDirectory = new URL('../dist/resources/native-selection/', import.meta.url);
  mkdirSync(nativeDirectory, { recursive: true });
  const compiler = join(process.env.SystemRoot, 'Microsoft.NET', process.arch === 'ia32' ? 'Framework' : 'Framework64', 'v4.0.30319', 'csc.exe');
  const compiled = spawnSync(compiler, ['/nologo', '/target:exe', '/optimize+', '/reference:System.Windows.Forms.dll',
    `/out:${fileURLToPath(new URL('picker.exe', nativeDirectory))}`,
    fileURLToPath(new URL('../resources/native-selection/picker.cs', import.meta.url))], { windowsHide: true, encoding: 'utf8' });
  if (compiled.error || compiled.status !== 0) throw new Error(`NATIVE_PICKER_BUILD_FAILED: ${compiled.stdout ?? ''}`);
  const executionDirectory = new URL('../dist/resources/execution/', import.meta.url);
  mkdirSync(executionDirectory, { recursive: true });
  const job = spawnSync(compiler, ['/nologo', '/target:exe', '/optimize+',
    `/out:${fileURLToPath(new URL('terminal-job.exe', executionDirectory))}`,
    fileURLToPath(new URL('../resources/execution/terminal-job.cs', import.meta.url))], { windowsHide: true, encoding: 'utf8' });
  if (job.error || job.status !== 0) throw new Error(`NATIVE_TERMINAL_JOB_BUILD_FAILED: ${job.stdout ?? ''}`);
}

const faviconDefinition = JSON.parse(readFileSync(new URL('../resources/favicon.v1.json', import.meta.url), 'utf8'));
const faviconBytes = createFaviconIco(faviconDefinition);
mkdirSync(new URL('../dist/web/', import.meta.url), { recursive: true });
writeFileSync(new URL('../dist/web/favicon.ico', import.meta.url), faviconBytes);

function createFaviconIco(definition) {
  if (definition.format_version !== 1 || !/^#[0-9a-f]{6}$/i.test(definition.background) ||
      !Array.isArray(definition.glyph) || definition.glyph.length !== 5 ||
      definition.glyph.some(row => typeof row !== 'string' || !/^[01]{7}$/.test(row))) {
    throw new Error('FAVICON_SOURCE_INVALID');
  }

  const size = 32;
  const rowBytes = size * 4;
  const maskRowBytes = Math.ceil(size / 32) * 4;
  const imageBytes = rowBytes * size;
  const maskBytes = maskRowBytes * size;
  const imageOffset = 22 + 40;
  const maskOffset = imageOffset + imageBytes;
  const icon = Buffer.alloc(maskOffset + maskBytes);
  const color = [
    Number.parseInt(definition.background.slice(5, 7), 16),
    Number.parseInt(definition.background.slice(3, 5), 16),
    Number.parseInt(definition.background.slice(1, 3), 16),
  ];

  icon.writeUInt16LE(1, 2);
  icon.writeUInt16LE(1, 4);
  icon[6] = size;
  icon[7] = size;
  icon.writeUInt16LE(1, 10);
  icon.writeUInt16LE(32, 12);
  icon.writeUInt32LE(40 + imageBytes + maskBytes, 14);
  icon.writeUInt32LE(22, 18);
  icon.writeUInt32LE(40, 22);
  icon.writeInt32LE(size, 26);
  icon.writeInt32LE(size * 2, 30);
  icon.writeUInt16LE(1, 34);
  icon.writeUInt16LE(32, 36);
  icon.writeUInt32LE(imageBytes, 42);

  const scale = 3;
  const glyphX = Math.floor((size - 7 * scale) / 2);
  const glyphY = Math.floor((size - 5 * scale) / 2);
  const radius = 5;
  for (let row = 0; row < size; row += 1) {
    const y = size - 1 - row;
    for (let x = 0; x < size; x += 1) {
      const edgeX = x < radius ? radius - x - 1 : x >= size - radius ? x - (size - radius) : 0;
      const edgeY = y < radius ? radius - y - 1 : y >= size - radius ? y - (size - radius) : 0;
      const opaque = edgeX * edgeX + edgeY * edgeY <= radius * radius;
      const glyphColumn = Math.floor((x - glyphX) / scale);
      const glyphRow = Math.floor((y - glyphY) / scale);
      const isGlyph = opaque && glyphRow >= 0 && glyphRow < definition.glyph.length &&
        glyphColumn >= 0 && glyphColumn < 7 && definition.glyph[glyphRow][glyphColumn] === '1';
      const pixelOffset = imageOffset + row * rowBytes + x * 4;
      icon[pixelOffset] = isGlyph ? 0xff : opaque ? color[0] : 0;
      icon[pixelOffset + 1] = isGlyph ? 0xff : opaque ? color[1] : 0;
      icon[pixelOffset + 2] = isGlyph ? 0xff : opaque ? color[2] : 0;
      icon[pixelOffset + 3] = opaque ? 0xff : 0;
      if (!opaque) icon[maskOffset + row * maskRowBytes + Math.floor(x / 8)] |= 1 << (7 - x % 8);
    }
  }
  return icon;
}
