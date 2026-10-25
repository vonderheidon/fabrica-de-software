import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import type { Delivery } from '#contracts';
import { publicationFixture } from '../fixtures/publication.js';
import { createVerification } from '../../apps/controller/src/modules/verification/index.js';

it('executes an additional configured check through the existing lifecycle using real local Node processes', async () => {
  await mkdir(join(process.cwd(), '.cache'), { recursive: true });
  if (/["%!\r\n]/.test(process.execPath)) throw new Error('NATIVE_CHECK_EXECUTABLE_PATH_UNSUPPORTED');
  const definitions = ['existing', 'additional'].map(id => ({ id, command: `"${process.execPath}" probe.mjs ${id}`, cwd_relative: '.', timeout_ms: 15_000 }));
  const f = await publicationFixture(false, 'icr', true, { temporaryRoot: join(process.cwd(), '.cache'), checks: definitions });
  try {
    let canonicalization = 'real'; let canonicalize: (path: string) => Promise<string> = path => realpath(path);
    try { await realpath(f.directory); } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EPERM')) throw error;
      canonicalization = 'controlled_after_EPERM'; canonicalize = async path => path;
    }
    const directories: string[] = [];
    const materializeCheck = async (delivery: Delivery, id: string) => {
      expect(delivery.captureState).toBe('captured');
      const directory = join(f.directory, 'work', delivery.attemptId, 'checks', id, 'checkout');
      if (directories.includes(directory)) {
        expect(await readFile(join(directory, 'probe.mjs'), 'utf8')).toContain('process.stdout.write');
        return directory;
      }
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, 'probe.mjs'), "process.stdout.write(JSON.stringify({check:process.argv[2],cwd:process.cwd(),text:'ação 😀'}));", { flag: 'wx' });
      directories.push(directory); return directory;
    };
    const verification = createVerification({ storage: f.storage, workspaces: { materializeCheck }, dataDirectory: f.directory, logFailure: f.logFailure }, { canonicalize });
    f.verification.verifyDelivery.mockImplementation(id => verification.verifyDelivery(id, new AbortController().signal));
    f.verification.getArtifact.mockImplementation(id => verification.getArtifact(id));
    await f.implement();
    const deliveryId = f.status().deliveryId!;
    const completed = f.storage.getCheckHistory(deliveryId, {}).entries;
    expect(completed).toHaveLength(2); expect(new Set(directories).size).toBe(2);
    for (const check of completed) {
      expect(check).toMatchObject({ state: 'passed', exitCode: 0, contentIdentity: f.storage.getDelivery(deliveryId).delivery.contentIdentity });
      expect(check.command).toBe(definitions.find(d => d.id === check.checkDefinitionId)!.command);
      const log = await verification.getArtifact(check.artifacts[0]!.id);
      const output: unknown = JSON.parse(log.bytes.toString('utf8'));
      expect(output).toMatchObject({ check: check.checkDefinitionId, text: 'ação 😀' });
    }
    expect(f.logFailure).not.toHaveBeenCalled();
    console.log('AC28_NATIVE_REPORT ' + JSON.stringify({ formatVersion: 1, nativeNodeChecks: 2, states: completed.map(c => c.state), evidence: 'real_files_sync_rename_checksum',
      lifecycleModified: false, sqlOrUIChangedForCheck: false, canonicalization, gitMaterialization: 'controlled', maestriProvider: 'not_started' }));
  } finally { await f.close(); }
});
