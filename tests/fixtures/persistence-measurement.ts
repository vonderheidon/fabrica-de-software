import { createHash } from 'node:crypto';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type Database from 'better-sqlite3';

export const sha256 = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
export interface MeasuredFile { path: string; sizeBytes: number; sha256: string }

/** Inspect only the exclusive fixture. No contents are retained in reports. Links fail closed. */
export async function inventory(root: string, directory = root): Promise<MeasuredFile[]> {
  const result: MeasuredFile[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) throw new Error('MEASUREMENT_LINK_UNSUPPORTED');
    if (stat.isDirectory()) result.push(...await inventory(root, path));
    else if (stat.isFile()) result.push({ path: relative(root, path).replaceAll('\\', '/'), sizeBytes: stat.size, sha256: sha256(await readFile(path)) });
    else throw new Error('MEASUREMENT_FILE_UNSUPPORTED');
  }
  return result.sort((a, b) => a.path.localeCompare(b.path));
}

export function sizes(files: MeasuredFile[]) {
  const sum = (predicate: (path: string) => boolean) => files.filter(f => predicate(f.path)).reduce((n, f) => n + f.sizeBytes, 0);
  return {
    databaseBytes: sum(p => p === 'factory.sqlite'), walBytes: sum(p => p === 'factory.sqlite-wal'),
    sharedMemoryBytes: sum(p => p === 'factory.sqlite-shm'),
    retainedGitDiskBytes: sum(p => p.startsWith('git/')),
    operationalWorkBytes: sum(p => p.startsWith('work/')),
    otherAuxiliaryBytes: sum(p => !p.startsWith('work/') && !p.startsWith('git/') && !p.startsWith('factory.sqlite')),
  };
}

/** Synthetic fingerprints only: this is a regression audit, not a universal secret/content scanner. */
export function auditDatabase(db: Database.Database, markers: string[]) {
  const tables = db.prepare<[], { name: string }>("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
  let cells = 0;
  for (const table of tables) {
    const identifier = '"' + table.name.replaceAll('"', '""') + '"';
    for (const row of db.prepare<[], Record<string, unknown>>(`SELECT * FROM ${identifier}`).iterate()) {
      for (const value of Object.values(row)) {
        if (typeof value !== 'string' && !Buffer.isBuffer(value)) continue;
        cells++;
        assertNoContent(Buffer.from(value), markers);
      }
    }
  }
  return { tables: tables.length, inspectedTextOrBlobCells: cells };
}

export function assertNoContent(bytes: Buffer, markers: string[]) {
  for (const marker of markers) {
    const representations = [marker, JSON.stringify(marker).slice(1, -1), Buffer.from(marker).toString('base64')];
    if (representations.some(text => bytes.includes(Buffer.from(text)))) throw new Error('FORBIDDEN_PROJECT_CONTENT_PERSISTED');
  }
}
