import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

/** Small valid loose Git objects, generated without a mutating Git command.
 * Only the exclusive test environment is written. Recovery uses the real Git CLI.
 * This prepares a fixture; it does not test production capture or publication.
 */
export function retainedGitObjects() {
  const objects = new Map<string, Buffer>();
  const put = (type: string, content: Buffer) => {
    const bytes = Buffer.concat([Buffer.from(`${type} ${content.length}\0`), content]);
    const oid = createHash('sha1').update(bytes).digest('hex');
    objects.set(oid, deflateSync(bytes)); return oid;
  };
  const ignore = '/node_modules/\n/cache/\n';
  const approvedBytes = 'RECOVERED_APPROVED_CONTENT_ç_😀\n';
  const originalBlob = put('blob', Buffer.from('original tracked bytes\n'));
  const approvedBlob = put('blob', Buffer.from(approvedBytes));
  const ignoreBlob = put('blob', Buffer.from(ignore));
  const tree = (blob: string) => put('tree', Buffer.concat([
    Buffer.from('100644 .gitignore\0'), Buffer.from(ignoreBlob, 'hex'),
    Buffer.from('100644 tracked.txt\0'), Buffer.from(blob, 'hex'),
  ]));
  const baseTree = tree(originalBlob); const contentIdentity = tree(approvedBlob);
  const author = 'Persistence Fixture <fixture@example.invalid> 1700000000 +0000';
  const baseSha = put('commit', Buffer.from(`tree ${baseTree}\nauthor ${author}\ncommitter ${author}\n\nFixture base\n`));
  const commitSha = put('commit', Buffer.from(`tree ${contentIdentity}\nparent ${baseSha}\nauthor ${author}\ncommitter ${author}\n\nFixture approved delivery\n`));
  return { objects, baseSha, contentIdentity, commitSha, approvedBlob, approvedBytes, ignore };
}

export async function writeRetainedGit(directory: string, attemptId: string, deliveryId: string) {
  const fixture = retainedGitObjects();
  const repository = join(directory, 'git', `${attemptId}.git`);
  const implementation = join(directory, 'work', attemptId, 'implementation');
  const gitRef = `refs/factory/deliveries/${deliveryId}`;
  for (const [metadata, bare] of [[repository, true], [join(implementation, '.git'), false]] as const) {
    await mkdir(join(metadata, 'objects', 'info'), { recursive: true });
    await mkdir(join(metadata, 'refs', 'heads'), { recursive: true });
    await mkdir(join(metadata, 'refs', 'factory', 'deliveries'), { recursive: true });
    await writeFile(join(metadata, 'config'), `[core]\nrepositoryformatversion = 0\nbare = ${bare}\nfilemode = false\n`, { flag: 'wx' });
    await writeFile(join(metadata, 'HEAD'), (bare ? fixture.commitSha : 'ref: refs/heads/main') + '\n', { flag: 'wx' });
    await writeFile(join(metadata, ...(bare ? gitRef : 'refs/heads/main').split('/')), (bare ? fixture.commitSha : fixture.baseSha) + '\n', { flag: 'wx' });
    for (const [oid, bytes] of fixture.objects) {
      await mkdir(join(metadata, 'objects', oid.slice(0, 2)), { recursive: true });
      await writeFile(join(metadata, 'objects', oid.slice(0, 2), oid.slice(2)), bytes, { flag: 'wx' });
    }
  }
  await writeFile(join(repository, 'factory-owner'), attemptId, { flag: 'wx' });
  await writeFile(join(implementation, '.gitignore'), fixture.ignore, { flag: 'wx' });
  await writeFile(join(implementation, 'tracked.txt'), fixture.approvedBytes, { flag: 'wx' });
  await mkdir(join(implementation, 'node_modules', '.cache'), { recursive: true });
  const cache = Buffer.alloc(1_048_576); cache.fill('RECOVERY_IGNORED_CACHE_BYTES');
  await writeFile(join(implementation, 'node_modules', '.cache', 'ignored.bin'), cache, { flag: 'wx' });
  return { ...fixture, gitRef, repository, implementation,
    approvedObjectPath: join(repository, 'objects', fixture.approvedBlob.slice(0, 2), fixture.approvedBlob.slice(2)) };
}
