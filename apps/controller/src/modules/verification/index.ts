import { lstat, realpath } from 'node:fs/promises';
import { isAbsolute, resolve, sep } from 'node:path';
import type { Storage, CheckCompletion } from '../storage/index.js';
import type { Workspaces } from '../workspaces/index.js';
import { CaptureError } from '../workspaces/index.js';
import { createArtifacts, VerificationError } from './artifacts.js';
import { runCheck, sanitizeCheckOutput, type CheckRunner, type CheckProcessResult } from './runner.js';
export { VerificationError } from './artifacts.js';
export { verificationLimits } from './runner.js';

export interface VerificationOptions {
  storage: Storage; workspaces: Pick<Workspaces, 'materializeCheck'>; dataDirectory: string;
  logFailure: (code: string) => void;
}
/** Resolve each segment: lexical containment alone does not reject junctions. */
export async function checkDirectory(root: string, relative: string, canonicalize: (p: string) => Promise<string> = realpath): Promise<string> {
  if (!relative || isAbsolute(relative) || /[:\\\x00-\x1f]/.test(relative) || relative.split('/').some(p => p === '..' || p === '' || p.toLowerCase() === '.git')) throw new VerificationError('CHECK_CWD_INVALID');
  const base = await canonicalize(root);
  if (base !== root) throw new VerificationError('CHECK_CWD_INVALID');
  let current = root;
  for (const part of ['.', ...relative.split('/')]) {
    current = resolve(current, part);
    if (current !== root && !current.startsWith(root + sep)) throw new VerificationError('CHECK_CWD_INVALID');
    let stat;
    try { stat = await lstat(current); } catch { throw new VerificationError('CHECK_CWD_UNAVAILABLE'); }
    if (!stat.isDirectory() || stat.isSymbolicLink() || await canonicalize(current) !== current) throw new VerificationError('CHECK_CWD_INVALID');
  }
  return current;
}
/** Internal seams let contract tests replace effects without adding HTTP command/upload APIs. */
export function createVerification(options: VerificationOptions, seams: { runner?: CheckRunner; canonicalize?: (p: string) => Promise<string> } = {}) {
  const { storage, workspaces } = options; const files = createArtifacts(options.dataDirectory, seams.canonicalize);
  const runner = seams.runner ?? runCheck;
  return {
    async verifyDelivery(deliveryId: string, signal: AbortSignal): Promise<void> {
      const plan = storage.beginVerification(deliveryId);
      try {
        for (const check of plan.checks) {
          if (signal.aborted) throw new VerificationError('VERIFICATION_CANCELLED');
          storage.startCheck(check.id);
          let completion: CheckCompletion;
          let stopUnconfirmed = false;
          let execution: CheckProcessResult | undefined;
          try {
            const root = await workspaces.materializeCheck(plan.delivery, check.id);
            const cwd = await checkDirectory(root, check.definition.cwd_relative, seams.canonicalize);
            if (signal.aborted) throw new VerificationError('VERIFICATION_CANCELLED');
            // Recheck live scope immediately before starting another owned process.
            const a = storage.getAttempt(plan.delivery.attemptId);
            if (a.result || a.suspension || a.tracking !== 'tracked' || a.deliveryId !== deliveryId) throw new VerificationError('VERIFICATION_CONTINUITY_REVOKED');
            const result = await runner(check.definition.command, cwd, check.timeoutMs, signal);
            execution = result;
            stopUnconfirmed = result.diagnostic?.includes('STOP_UNCONFIRMED') ?? false;
            const output = sanitizeCheckOutput(result.output);
            if (output.length > 1_048_576) throw new VerificationError('ARTIFACT_OUTPUT_LIMIT');
            const artifact = await files.write({ attemptId: plan.delivery.attemptId, deliveryId, checkId: check.id }, output);
            completion = { state: result.state, exitCode: result.exitCode, endedAtMs: result.endedAtMs, durationMs: result.durationMs, diagnostic: result.diagnostic, executionDiagnostic: result.diagnostic, artifact };
          } catch (error) {
            const diagnostic = error instanceof VerificationError || error instanceof CaptureError ? error.code : 'CHECK_EXECUTION_FAILED';
            options.logFailure(diagnostic);
            completion = { state: 'error', exitCode: execution?.exitCode ?? null, endedAtMs: Date.now(), durationMs: execution?.durationMs ?? 0, diagnostic, executionDiagnostic: execution?.diagnostic ?? null, artifact: null };
          }
          if (signal.aborted) completion = { ...completion, state: 'error', diagnostic: 'VERIFICATION_CANCELLED' };
          // A failed transaction cannot confirm passed. The fallback marks the run technical error.
          storage.finishCheck(check.id, completion);
          if (signal.aborted) throw new VerificationError('VERIFICATION_CANCELLED');
          if (stopUnconfirmed) throw new VerificationError(completion.diagnostic?.includes('STOP_UNCONFIRMED') ? completion.diagnostic : 'CHECK_STOP_UNCONFIRMED');
        }
        storage.finishVerification(plan.id);
      } catch (error) {
        const code = error instanceof VerificationError ? error.code : 'VERIFICATION_PERSISTENCE_FAILED';
        options.logFailure(code);
        try { storage.finishVerification(plan.id, code); }
        catch { options.logFailure('VERIFICATION_DIAGNOSTIC_PERSISTENCE_FAILED'); }
        // Remains running/error with durable prior intent; no approval or review is dispatched.
        throw new VerificationError(code, { cause: error });
      }
    },
    async getArtifact(id: string): Promise<{ bytes: Buffer; filename: string }> {
      const artifact = storage.getArtifact(id); // Scope and composed relationships before filesystem IO.
      const bytes = await files.read(artifact);
      // Scope may have changed while reading the file.
      const current = storage.getArtifact(id);
      if (JSON.stringify(current) !== JSON.stringify(artifact)) throw new VerificationError('ARTIFACT_INTEGRITY_FAILED');
      return { bytes, filename: `${artifact.id}.log` };
    },
  };
}
export type Verification = ReturnType<typeof createVerification>;
