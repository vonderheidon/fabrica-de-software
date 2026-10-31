// @ts-check
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stripVTControlCharacters } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));
let phase = 'arguments';

/** Accept exactly one report from a successful, bounded local test invocation.
 * Test reports are observations, never authorization or an AC acceptance gate.
 * @param {string} output @param {string} marker
 * @returns {Record<string, unknown>}
 */
export function extractReport(output, marker) {
  const lines = stripVTControlCharacters(output).split(/\r?\n/).map(line => line.trim()).filter(line => line.startsWith(marker + ' '));
  const line = lines[0];
  if (lines.length !== 1 || !line) throw new Error('PROOF_REPORT_MISSING_OR_DUPLICATE');
  /** @type {unknown} */
  const report = JSON.parse(line.slice(marker.length + 1));
  if (!report || typeof report !== 'object' || Array.isArray(report) || !('formatVersion' in report) || report.formatVersion !== 1) {
    throw new Error('PROOF_REPORT_INVALID');
  }
  return /** @type {Record<string, unknown>} */ (report);
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }

/** A passing measurement alone must never be promoted to physical recovery proof.
 * @param {Record<string, unknown>} recovery
 */
export function assertPhysicalRecovery(recovery) {
  const pids = recovery.controllerPids;
  const physical = recovery.physicalProcesses;
  const result = recovery.recovery;
  if (recovery.controller !== 'distinct_processes_after_SIGKILL' || !Array.isArray(pids) || pids.length !== 3 ||
    pids.some(pid => !Number.isSafeInteger(pid) || pid < 1) || new Set(pids).size !== 3 ||
    !physical || typeof physical !== 'object' || !('allExitsObserved' in physical) || physical.allExitsObserved !== true ||
    !('started' in physical) || !Array.isArray(physical.started) || physical.started.length !== 2 ||
    !('stops' in physical) || !Array.isArray(physical.stops) || physical.stops.length !== 2 ||
    !result || typeof result !== 'object' || !('approvedRefTreeBasePreserved' in result) || result.approvedRefTreeBasePreserved !== true ||
    !('eligibleRemoval' in result) || result.eligibleRemoval !== true ||
    !('diffAfterRemovalAndRestart' in result) || result.diffAfterRemovalAndRestart !== true) throw new Error('PROOF_PHYSICAL_RECOVERY_MISSING');
  const exits = recovery.controllerExits;
  const starts = recovery.controllerStarts;
  if (!Array.isArray(exits) || exits.length !== 3 || !Array.isArray(starts) || starts.length !== 3 ||
    !pids.every((pid, index) => {
      const exit = exits[index]; const start = starts[index]; const previous = exits[index - 1];
      return exit && start && exit.pid === pid && start.pid === pid && exit.signal === 'SIGKILL' &&
        Number.isSafeInteger(start.readyAtMs) && Number.isSafeInteger(exit.closedAtMs) && exit.closedAtMs >= start.readyAtMs &&
        (index === 0 || start.readyAtMs >= previous.closedAtMs);
    })) throw new Error('PROOF_PHYSICAL_RECOVERY_MISSING');
  const started = physical.started; const stops = physical.stops;
  if (new Set(started.map(process => process?.pid)).size !== 2 || !started.every((process, index) => {
    const stop = stops[index];
    return process && stop && Number.isSafeInteger(process.pid) && process.pid > 0 && !pids.includes(process.pid) &&
      typeof process.passageId === 'string' && stop.passageId === process.passageId && stop.pid === process.pid &&
      (typeof stop.exitCode === 'number' || typeof stop.signal === 'string') &&
      Number.isSafeInteger(stop.closeObservedAtMs) && Number.isSafeInteger(stop.receiptRecordedAtMs) &&
      stop.receiptRecordedAtMs >= stop.closeObservedAtMs && stop.receiptRecordedAtMs <= exits[0].closedAtMs;
  })) throw new Error('PROOF_PHYSICAL_RECOVERY_MISSING');
  const persistence = isRecord(recovery.persistence) ? recovery.persistence : null;
  const clean = persistence && isRecord(persistence.cleanInitialization) ? persistence.cleanInitialization : null;
  const cleanCounts = clean && isRecord(clean.counts) ? clean.counts : null;
  const integrityValue = persistence?.integrityChecks;
  const integrity = Array.isArray(integrityValue) ? /** @type {unknown[]} */ (integrityValue) : [];
  const referencesValue = persistence?.referenceSnapshots;
  const referenceValues = Array.isArray(referencesValue) ? /** @type {unknown[]} */ (referencesValue) : [];
  const referenceRows = referenceValues.map(item => isRecord(item) ? item : null);
  const baseline = referenceRows[0];
  const baselineReceiptIds = baseline && Array.isArray(baseline.operationReceiptIds)
    ? /** @type {unknown[]} */ (baseline.operationReceiptIds) : [];
  const referencesValid = referenceRows.length === 3 && baseline !== null && baseline !== undefined && baselineReceiptIds.length > 0 &&
    baselineReceiptIds.every(id => typeof id === 'string') && referenceRows.every(item => {
      if (!item || item.sha256 !== baseline.sha256 || !Array.isArray(item.roundNumbers) || item.roundNumbers.join(',') !== '1,2' ||
        !Array.isArray(item.deliveryIds) || item.deliveryIds.length !== 2 || !Array.isArray(item.passageResultReceiptIds) || item.passageResultReceiptIds.length !== 4 ||
        !Array.isArray(item.operationReceiptIds) || !isRecord(item.counts)) return false;
      const receiptIds = /** @type {unknown[]} */ (item.operationReceiptIds);
      if (!baselineReceiptIds.every(id => receiptIds.includes(id))) return false;
      const counts = item.counts;
      return typeof counts.projectRevisions === 'number' && counts.projectRevisions >= 1 && counts.preparations === 1 && counts.attempts === 1 && counts.rounds === 2 && counts.deliveries === 2 &&
        counts.passageResults === 4 && counts.reviews === 2 && typeof counts.findings === 'number' && counts.findings >= 1 &&
        typeof counts.findingResolutions === 'number' && counts.findingResolutions >= 1;
    });
  if (!clean || !cleanCounts || clean.openedByNormalStoragePath !== true || clean.directoryCreatedExclusive !== true || clean.schemaVersion !== 55 ||
    clean.integrityCheck !== 'ok' || !Array.isArray(clean.foreignKeyViolations) || clean.foreignKeyViolations.length !== 0 ||
    clean.accountId !== null || cleanCounts.accounts !== 0 || cleanCounts.profiles !== 0 || cleanCounts.projects !== 0 || cleanCounts.preparations !== 0 || cleanCounts.attempts !== 0 ||
    integrity.length !== 3 || integrity.some(item => !isRecord(item) || item.schemaVersion !== 55 || item.integrityCheck !== 'ok' ||
      item.foreignKeyViolations !== 0 || !Array.isArray(item.retiredTables) || item.retiredTables.length !== 0) || !referencesValid) {
    throw new Error('PROOF_PERSISTENCE_REFERENCES_MISSING');
  }
}

/** No shell, arbitrary commands, GH, credentials in output, or provider invocation.
 * @param {string[]} args
 * @returns {Promise<string>}
 */
async function runNode(args) {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: root, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    });
    let bytes = 0;
    let failed = false;
    /** @type {Buffer[]} */
    const output = [];
    const timer = setTimeout(() => { failed = true; child.kill(); reject(new Error('PROOF_TEST_TIMEOUT')); }, 120_000);
    child.once('error', () => { clearTimeout(timer); reject(new Error('PROOF_TEST_LAUNCH_FAILED')); });
    /** @param {Buffer} chunk @param {boolean} retain */
    const consume = (chunk, retain) => {
      bytes += chunk.length;
      if (bytes > 4 * 1024 * 1024) {
        failed = true; child.kill(); reject(new Error('PROOF_TEST_OUTPUT_LIMIT')); return;
      }
      if (retain) output.push(chunk);
    };
    child.stdout.on('data', chunk => consume(chunk, true));
    child.stderr.on('data', chunk => consume(chunk, false));
    child.once('close', code => {
      clearTimeout(timer);
      if (failed || code !== 0) reject(new Error('PROOF_TEST_FAILED'));
      else resolve(Buffer.concat(output).toString('utf8'));
    });
  });
}

/** @param {string[]} args */
const runTests = args => runNode([join(root, 'node_modules/vitest/vitest.mjs'), ...args]);

async function main() {
  if (process.argv.length !== 2) throw new Error('PROOF_ARGUMENTS_UNSUPPORTED');
  // Reuse only the existing native reports that belong to this persistence proof.
  // Verbose test names can contain multiline, deliberately invalid report examples.
  // Dot output keeps those labels out of the observation stream; duplicates still fail closed.
  phase = 'measurements';
  const standard = await runTests(['run', 'tests/acceptance/persistence-maintenance.test.ts', 'tests/acceptance/persistence-audit.test.ts',
    'tests/acceptance/execution-composition.test.ts', 'tests/acceptance/persistence-report.test.ts', 'tests/boundaries.test.ts', '--reporter=dot', '--no-color']);
  phase = 'measurement_report';
  const persistence = extractReport(standard, 'AC29_REPORT');
  // Child controllers consume compiled production modules, never stale fixture closures.
  phase = 'compile_controller';
  await runNode([join(root, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json']);
  await runNode([join(root, 'scripts/copy-resources.mjs')]);
  phase = 'native_process_proofs';
  const nativeOutput = await runTests(['run', '--config', 'config/vitest.maintenance.config.ts', 'tests/native/maintenance.proof.ts',
    'tests/native/persistence-recovery.proof.ts', '--reporter=dot', '--no-color']);
  phase = 'native_reports';
  const native = extractReport(nativeOutput, 'AC28_NATIVE_REPORT');
  const processRecovery = extractReport(nativeOutput, 'AC29_RECOVERY_REPORT');
  phase = 'physical_recovery_validation';
  assertPhysicalRecovery(processRecovery);
  phase = 'source_inventory';
  const sources = await Promise.all(['scripts/check-boundaries.mjs', 'scripts/persistence-proof.mjs', 'tests/acceptance/persistence-maintenance.test.ts',
    'tests/fixtures/persistence-measurement.ts', 'tests/fixtures/retained-git.ts', 'tests/fixtures/attempt.ts', 'tests/fixtures/publication.ts',
    'tests/native/maintenance.proof.ts', 'tests/native/persistence-recovery.proof.ts', 'tests/native/persistence-controller.mjs', 'tests/native/persistence-references.mjs',
    'tests/native/persistence-probe.mjs', 'tests/acceptance/execution-composition.test.ts', 'config/vitest.maintenance.config.ts', 'package.json', 'package-lock.json'].map(async file => {
    const bytes = await readFile(join(root, file));
    return { path: file, sizeBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  }));
  phase = 'write_report';
  const cache = join(root, '.cache');
  await mkdir(cache, { recursive: true });
  if ((await lstat(cache)).isSymbolicLink()) throw new Error('PROOF_OUTPUT_LINK_UNSUPPORTED');
  const directory = await mkdtemp(join(cache, 'persistence-proof-'));
  const report = { formatVersion: 1, observedAt: new Date().toISOString(), node: process.version,
    status: 'local_persistence_and_process_recovery_passed', persistence, native, processRecovery, sources,
    sourceScope: 'Selected proof files and lockfile only; not a Git ref or a complete source inventory.',
    limitations: ['Cache measurements use controlled Git/executor/runner/materialization; they are distinct from the process recovery proof.',
      'Process recovery uses real read-only Git CLI on valid loose objects generated in an exclusive fixture; capture/approval inputs remain controlled.',
      'HTTP uses inject inside compiled child controllers. Keyring, native Maestri/OMP/provider and publication are not exercised.',
      'No latency SLA or production executor substitution is claimed.'] };
  await writeFile(join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  await writeFile(join(directory, 'report.md'), '# Prova de persistência e manutenção modular\n\n' +
    'Validações locais e recuperação após encerramento físico concluídas.\n\n' +
    'O JSON contém massa 0/16/64 MiB, tamanhos, payloads, latências, identidade ref/tree/base, diagnósticos e hashes dos arquivos selecionados.\n\n' +
    'A prova inicializa SQLite vazio pelo openStorage normal, valida o schema direto 54, integrity_check e foreign_key_check, e registra a referência dos dados. ' +
    'Ela conserva duas rodadas (uma rejeitada e a seguinte aprovada), capturas, resultados, recibos, pareceres e evidências estruturadas em três controladores compilados em PIDs distintos, ' +
    'dois processos Node com saída observada, SIGKILL dos controladores e Git CLI somente leitura em objetos válidos no disco. ' +
    'Hashes de referência e contagens são comparados após cada reinício; após a remoção elegível do ambiente temporário, outro controlador recupera as refs/tree/base, aprovação, diff e evidência. ' +
    'O JSON registra tamanhos, hashes, PIDs, recibos e diagnósticos para corrupção/ausência. ' +
    'Captura e resultados de aprovação são fixtures; não há SLA, prova nativa Maestri/OMP/provider, publicação ou mutação Git.\n', { flag: 'wx' });
  console.log(JSON.stringify({ status: report.status, report: relative(root, join(directory, 'report.json')).replaceAll('\\', '/') }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    const cause = error instanceof Error && /^PROOF_[A-Z_]+$/.test(error.message) ? error.message : 'PROOF_UNEXPECTED_FAILURE';
    console.error(JSON.stringify({ code: 'PERSISTENCE_PROOF_FAILED', phase, cause, message: 'No successful report issued; inspect the configured stage locally.' }));
    process.exitCode = 1;
  });
}
