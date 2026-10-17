// Owned test process; no network, provider, filesystem writes or grandchildren.
if (!process.send) throw new Error('PROBE_IPC_REQUIRED');
const timer = setInterval(() => {}, 1000);
process.on('disconnect', () => { clearInterval(timer); });
process.send({ ready: true, pid: process.pid });
