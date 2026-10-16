import { appendFileSync } from 'node:fs';
appendFileSync(process.env.ENSAIO_MARKER, JSON.stringify({pid:process.pid,at:new Date().toISOString()})+'\n');
