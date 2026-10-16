import { appendFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const marker = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'sentinel-starts.jsonl');
appendFileSync(marker, JSON.stringify({ pid: process.pid, at: new Date().toISOString(), cwd: process.cwd() }) + '\n');
