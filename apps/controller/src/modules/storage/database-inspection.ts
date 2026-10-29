import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import Database from 'better-sqlite3';
import { StorageError } from './errors.js';
import {
  inspectHistory,
  type DatabaseRecognition,
  type SchemaRecognitionResources,
} from './migrations.js';

const sidecarSuffixes = ['', '-wal', '-shm', '-journal'] as const;

interface SnapshotFile {
  readonly suffix: typeof sidecarSuffixes[number];
  readonly bytes: Buffer;
  readonly checksum: string;
}

export interface DatabaseSnapshot {
  readonly files: readonly SnapshotFile[];
}

function hash(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function captureSnapshot(filename: string): DatabaseSnapshot {
  const files: SnapshotFile[] = [];
  for (const suffix of sidecarSuffixes) {
    const path = filename + suffix;
    if (!existsSync(path)) continue;
    try {
      const info = lstatSync(path);
      if (!info.isFile() || info.isSymbolicLink()) throw new StorageError('DATABASE_UNKNOWN');
      const bytes = readFileSync(path);
      files.push({ suffix, bytes, checksum: hash(bytes) });
    } catch (error) {
      if (error instanceof StorageError) throw error;
      throw new StorageError('DATABASE_CHANGED_DURING_OPEN', { cause: error });
    }
  }
  return { files };
}

function equalSnapshots(left: DatabaseSnapshot, right: DatabaseSnapshot): boolean {
  if (left.files.length !== right.files.length) return false;
  return left.files.every((file, index) => {
    const candidate = right.files[index];
    return candidate?.suffix === file.suffix && candidate.checksum === file.checksum &&
      candidate.bytes.length === file.bytes.length;
  });
}

function copySnapshot(filename: string, snapshot: DatabaseSnapshot, directory: string): string {
  let databasePath: string | null = null;
  for (const file of snapshot.files) {
    const target = join(directory, basename(filename) + file.suffix);
    writeFileSync(target, file.bytes, { flag: 'wx' });
    if (file.suffix === '') databasePath = target;
  }
  if (databasePath === null) throw new StorageError('DATABASE_UNKNOWN');
  return databasePath;
}

/** Inspects a byte snapshot on a temporary copy so refused opens cannot create or alter sidecars. */
export function inspectExistingDatabase(
  filename: string,
  timeout: number,
  resources: SchemaRecognitionResources,
): DatabaseRecognition {
  const snapshot = captureSnapshot(filename);
  const main = snapshot.files.find(file => file.suffix === '');
  if (!main) throw new StorageError('DATABASE_UNKNOWN');
  if (main.bytes.length === 0 && snapshot.files.length === 1) {
    return { kind: 'empty', schemaVersion: 0 };
  }

  const directory = mkdtempSync(join(tmpdir(), 'factory-storage-inspection-'));
  let probe: Database.Database | undefined;
  try {
    const probePath = copySnapshot(filename, snapshot, directory);
    probe = new Database(probePath, { readonly: true, fileMustExist: true, timeout });
    const recognition = inspectHistory(probe, resources);
    probe.close();
    probe = undefined;
    if (!equalSnapshots(snapshot, captureSnapshot(filename))) {
      throw new StorageError('DATABASE_CHANGED_DURING_OPEN');
    }
    return recognition;
  } catch (error) {
    if (error instanceof StorageError) throw error;
    throw new StorageError('STORAGE_INTEGRITY_FAILED', { cause: error });
  } finally {
    probe?.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

export function assertNoOrphanedDatabaseSidecars(filename: string): void {
  if (sidecarSuffixes.slice(1).some(suffix => existsSync(filename + suffix))) {
    throw new StorageError('DATABASE_UNKNOWN');
  }
}

export function assertDatabaseSnapshotUnchanged(filename: string, expected: DatabaseSnapshot): void {
  if (!equalSnapshots(expected, captureSnapshot(filename))) {
    throw new StorageError('DATABASE_CHANGED_DURING_OPEN');
  }
}

export function captureDatabaseSnapshot(filename: string): DatabaseSnapshot {
  return captureSnapshot(filename);
}
