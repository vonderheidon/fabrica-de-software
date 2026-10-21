import { copyFileSync, mkdirSync, readdirSync, cpSync, readFileSync, writeFileSync } from 'node:fs';

const source = new URL('../apps/controller/src/modules/storage/migrations/', import.meta.url);
const target = new URL('../dist/apps/controller/src/modules/storage/migrations/', import.meta.url);
mkdirSync(target, { recursive: true });
for (const name of readdirSync(source).filter((file) => file.endsWith('.sql'))) {
  copyFileSync(new URL(name, source), new URL(name, target));
}

const roles = new URL('../resources/roles/', import.meta.url);
const distributedRoles = new URL('../dist/resources/roles/', import.meta.url);
mkdirSync(distributedRoles, { recursive: true });
for (const name of ['implementer.v1.json', 'reviewer.v1.json']) {
  copyFileSync(new URL(name, roles), new URL(name, distributedRoles));
}
cpSync(new URL('../resources/templates/', import.meta.url), new URL('../dist/resources/templates/', import.meta.url), { recursive: true });
cpSync(new URL('../resources/deletion/', import.meta.url), new URL('../dist/resources/deletion/', import.meta.url), { recursive: true });

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
