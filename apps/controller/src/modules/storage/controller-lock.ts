import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import Database from 'better-sqlite3';
import { StorageError } from './errors.js';

/** OS-backed SQLite file lock; independent of port and released by the OS after process death. */
export function acquireControllerLock(dataDirectory: string): { close(): void } {
  let connection: Database.Database | undefined;
  try {
    mkdirSync(dataDirectory, { recursive: true });
    connection = new Database(resolve(dataDirectory, 'controller-lock.sqlite'), { timeout: 50 });
    connection.pragma('journal_mode = DELETE');
    connection.exec('BEGIN EXCLUSIVE');
    const lock = connection;
    return { close: () => { if (lock.open) lock.close(); } };
  } catch (error) {
    if (connection?.open) connection.close();
    throw new StorageError('CONTROLLER_LOCK_UNAVAILABLE', { cause: error });
  }
}
