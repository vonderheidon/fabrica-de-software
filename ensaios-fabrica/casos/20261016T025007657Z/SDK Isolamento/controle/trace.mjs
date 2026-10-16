import { appendFileSync } from 'node:fs';
const log = event => appendFileSync(process.env.ENSAIO_MARKER, JSON.stringify({event,pid:process.pid,parentPid:process.ppid,at:new Date().toISOString()})+'\n');
log('start');
process.on('exit',()=>log('exit'));
