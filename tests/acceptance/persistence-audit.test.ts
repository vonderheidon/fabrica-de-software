import Database from 'better-sqlite3';
import { expect, it } from 'vitest';
import { assertNoContent, auditDatabase } from '../fixtures/persistence-measurement.js';

it.each(['raw', 'json', 'base64', 'blob'])('detects synthetic project bytes persisted as %s', representation => {
  const db = new Database(':memory:');
  try {
    const marker = 'PROJECT_BYTES_123\n';
    const value = representation === 'json' ? JSON.stringify({ content: marker }) : representation === 'base64' ? Buffer.from(marker).toString('base64') : representation === 'blob' ? Buffer.from(marker) : marker;
    db.exec('CREATE TABLE fixture(value)'); db.prepare('INSERT INTO fixture(value) VALUES (?)').run(value);
    expect(() => auditDatabase(db, [marker])).toThrow('FORBIDDEN_PROJECT_CONTENT_PERSISTED');
  } finally { db.close(); }
});

it('permits Git references, hashes and pertinent evidence without dumping any cell values', () => {
  const db = new Database(':memory:');
  try {
    db.exec('CREATE TABLE fixture(ref TEXT,sha TEXT)'); db.prepare('INSERT INTO fixture VALUES (?,?)').run('refs/factory/deliveries/test', 'a'.repeat(40));
    expect(auditDatabase(db, ['PROJECT_BYTES_123'])).toEqual({ tables: 1, inspectedTextOrBlobCells: 2 });
    expect(() => assertNoContent(Buffer.from('pertinent check evidence'), ['PROJECT_BYTES_123'])).not.toThrow();
  } finally { db.close(); }
});
