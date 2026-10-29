import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Delivery } from '#contracts';
import { createCapturer, type CaptureInput } from '../../apps/controller/src/modules/workspaces/capture.js';
import { createDeliveryDiff } from '../../apps/controller/src/modules/workspaces/diff.js';
import type { GitReader } from '../../apps/controller/src/modules/workspaces/git.js';

const oid = (text: string | Buffer) => createHash('sha1').update(text).digest('hex');
export async function captureFixture(directory?: string, identities?: Partial<CaptureInput>) {
  const root = directory ?? await mkdtemp(join(tmpdir(), 'factory-capture-'));
  const input: CaptureInput = { attemptId: randomUUID(), passageId: randomUUID(), deliveryId: randomUUID(), baseSha: 'a'.repeat(40), declaredFiles: ['cache/declared.txt'], ...identities };
  const implementation = resolve(root, 'work', input.attemptId, 'implementation');
  await mkdir(resolve(implementation, '.git'), { recursive: true });
  await mkdir(resolve(implementation, 'cache')); await writeFile(resolve(implementation, 'cache/declared.txt'), 'EXCLUDED_IGNORED_BYTES_987');
  await writeFile(resolve(implementation, '.env'), 'EXCLUDED_SECRET_BYTES_123');
  await writeFile(resolve(implementation, '.git/index'), 'IMPLEMENTATION_INDEX_UNCHANGED');
  await writeFile(resolve(implementation, 'tracked.txt'), 'changed tracked bytes\n');
  await writeFile(resolve(implementation, 'renamed ç.txt'), 'renamed bytes\n');
  await writeFile(resolve(implementation, 'new unicode ç.txt'), 'new bytes 😀\n');
  await writeFile(resolve(implementation, 'binary.bin'), Buffer.from([0, 255, 1, 2]));
  const blobs = new Map<string, Buffer>(); const modes = new Map<string, string>();
  const put = (data: string | Buffer) => { const value = Buffer.from(data); const hash = createHash('sha1').update(`blob ${value.length}\0`).update(value).digest('hex'); blobs.set(hash, value); return hash; };
  const base = new Map([['tracked.txt', put('original\n')], ['deleted.txt', put('deleted\n')], ['old ç.txt', put('renamed bytes\n')]]);
  for (const path of base.keys()) modes.set(path, '100644');
  const trees = new Map<string, Map<string, string>>(); const treeModes = new Map<string, Map<string, string>>();
  const baseTree = oid('base-tree'); trees.set(baseTree, base); treeModes.set(baseTree, new Map(modes));
  const refs = new Map<string, string>(); const commits = new Map<string, string>();
  const indexes = new Map<string, Map<string, string>>(); const indexModes = new Map<string, Map<string, string>>();
  const calls: { cwd: string; args: readonly string[]; indexFile: string | undefined }[] = [];
  let concurrent: (() => Promise<void>) | undefined; let submodule = false; let conflict = false; let externalIndex = false;
  const untracked = ['renamed ç.txt', 'new unicode ç.txt', 'binary.bin', '.env'];
  const removedFromTracking = new Set<string>(); const ignoredPaths = new Set(['cache/declared.txt']);
  const run: GitReader = async (cwd, args, options) => {
    calls.push({ cwd, args, indexFile: options?.indexFile });
    const reply = (stdout = '', exitCode = 0) => ({ stdout, exitCode });
    const command = ['rev-parse', 'ls-tree', 'config', 'ls-files', 'check-ignore', 'init', 'fetch', 'read-tree', 'hash-object', 'update-index', 'write-tree', 'show-ref', 'commit-tree', 'update-ref', 'rev-list', 'fsck', 'diff', 'cat-file', 'for-each-ref'].find(c => args.includes(c));
    const tail = command ? args.slice(args.indexOf(command) + 1) : [];
    if (command === 'config') return reply('false\n');
    if (command === 'rev-parse') {
      const value = tail.at(-1)!;
      if (value === 'HEAD' || value === `${input.baseSha}^{commit}`) return reply(input.baseSha + '\n');
      if (value === `${input.baseSha}^{tree}`) return reply(baseTree + '\n');
      if (value.endsWith('^{tree}')) return reply(commits.get(value.slice(0, -7))! + '\n');
      return refs.has(value) ? reply(refs.get(value)! + '\n') : reply('', 1);
    }
    if (command === 'ls-tree') {
      const treeId = commits.get(tail.at(-1)!); const entries = treeId ? trees.get(treeId)! : base;
      return reply([...entries].map(([path, hash]) => `${submodule ? '160000 commit' : `${treeId ? treeModes.get(treeId)?.get(path) ?? '100644' : '100644'} blob`} ${hash}\t${path}\0`).join(''));
    }
    if (command === 'ls-files' && tail.includes('--stage')) return reply([...base].filter(([p]) => !removedFromTracking.has(p)).map(([path, hash]) => `${modes.get(path)} ${hash} ${conflict ? '2' : '0'}\t${path}\0`).join(''));
    if (command === 'ls-files' && tail.includes('-v')) return reply([...base.keys()].filter(p => !removedFromTracking.has(p)).map(p => `H ${p}\0`).join(''));
    if (command === 'ls-files') return reply(untracked.map(p => `${p}\0`).join(''));
    if (command === 'check-ignore') { const path = String(options?.input).replace(/\0$/, ''); return ignoredPaths.has(path) ? reply(`${path}\0`) : reply('', 1); }
    if (command === 'init' || command === 'fetch' || command === 'fsck') return reply();
    if (command === 'read-tree') { indexes.set(options!.indexFile!, new Map(base)); indexModes.set(options!.indexFile!, new Map(modes)); return reply(); }
    if (command === 'hash-object') {
      const hash = put(options!.input!);
      if (concurrent) { const action = concurrent; concurrent = undefined; await action(); }
      if (externalIndex) { externalIndex = false; await writeFile(resolve(implementation, '.git/index'), 'EXTERNAL_INDEX_CHANGE'); }
      return reply(hash + '\n');
    }
    if (command === 'update-index') {
      const index = indexes.get(options!.indexFile!)!; const modeIndex = indexModes.get(options!.indexFile!)!;
      for (const record of String(options!.input).split('\0').filter(Boolean)) {
        const match = /^(0|[0-7]{6}) ([a-f0-9]+)\t([\s\S]+)$/.exec(record)!;
        if (match[1] === '0') { index.delete(match[3]!); modeIndex.delete(match[3]!); }
        else { index.set(match[3]!, match[2]!); modeIndex.set(match[3]!, match[1]!); }
      }
      return reply();
    }
    if (command === 'write-tree') {
      const index = indexes.get(options!.indexFile!)!; const hash = oid(JSON.stringify([...index]));
      trees.set(hash, new Map(index)); treeModes.set(hash, new Map(indexModes.get(options!.indexFile!)!)); return reply(hash + '\n');
    }
    if (command === 'show-ref') return refs.has(tail.at(-1)!) ? reply(refs.get(tail.at(-1)!)! + '\n') : reply('', 1);
    if (command === 'commit-tree') { const hash = oid(tail.join(' ')); commits.set(hash, tail[0]!); return reply(hash + '\n'); }
    if (command === 'update-ref') { const [ref, commit] = tail.filter(x => x !== '--no-deref'); if (refs.has(ref!)) return reply('', 1); refs.set(ref!, commit!); return reply(); }
    if (command === 'rev-list') return reply(`${tail.at(-1)} ${input.baseSha}\n`);
    if (command === 'for-each-ref') { const ref = tail.at(-1)!; return reply(`${ref}\0${refs.get(ref)}\0\n`); }
    if (command === 'cat-file') return reply(String(blobs.get(tail.at(-1)!)!.length) + '\n');
    if (command === 'diff') {
      const tree = trees.get(commits.get(refs.get(`refs/factory/deliveries/${input.deliveryId}`)!)!)!;
      if (tail.includes('--raw')) {
        return reply([...new Set([...base.keys(), ...tree.keys()])].sort().filter(p => base.get(p) !== tree.get(p)).map(path => {
          const old = base.get(path); const current = tree.get(path);
          return `:${old ? '100644' : '000000'} ${current ? treeModes.get([...trees.keys()].at(-1)!)!.get(path) : '000000'} ${old ?? '0'.repeat(40)} ${current ?? '0'.repeat(40)} ${!old ? 'A' : !current ? 'D' : 'M'}\0${path}\0`;
        }).join(''));
      }
      const path = tail.at(-1)!; const data = tree.get(path) ? blobs.get(tree.get(path)!)! : blobs.get(base.get(path)!)!;
      if (tail.includes('--numstat')) return reply(`${data.includes(0) ? '-\t-' : '1\t1'}\t${path}\0`);
      return reply(`diff --git ${JSON.stringify(path)}\n+${data.toString('utf8')}`);
    }
    throw new Error(`Unexpected controlled command: ${command}`);
  };
  const capture = createCapturer(root, run, async path => path, async () => root); const diff = createDeliveryDiff(root, run, async path => path, async () => root);
  return { root, input, implementation, blobs, trees, treeModes, refs, calls, untracked, base, capture, diff, run,
    setExecutable: (path: string) => { modes.set(path, '100755'); },
    removeTrackingAndIgnore: (path: string) => { removedFromTracking.add(path); ignoredPaths.add(path); },
    setConcurrent: (action: () => Promise<void>) => { concurrent = action; }, setSubmodule: () => { submodule = true; },
    setConflict: () => { conflict = true; }, setExternalIndex: () => { externalIndex = true; } };
}
export function delivery(input: CaptureInput, content: Awaited<ReturnType<ReturnType<typeof createCapturer>>>): Delivery {
  return { ...content, id: input.deliveryId, attemptId: input.attemptId, producerPassageId: input.passageId, round: 1, baseSha: input.baseSha,
    repositoryRelative: `git/${input.attemptId}.git`, captureState: 'captured', diagnostic: null, capturedAtMs: 1, revision: 3 };
}
