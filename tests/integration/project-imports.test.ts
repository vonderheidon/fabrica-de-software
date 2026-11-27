import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GitHubBranch, GitHubQueryResult, GitHubRepository, OriginInspection, ProjectFolderInspection, ProjectImportView, ProjectPage, RepositoryReference, SessionResponse } from '#contracts';
import { createApp } from '../../apps/controller/src/http/app.js';
import { loadConfiguration } from '../../apps/controller/src/config.js';
import { openStorage } from '../../apps/controller/src/modules/storage/index.js';
import { createProjectFolderWorkspace } from '../../apps/controller/src/modules/workspaces/project-folder.js';
import type { GitReader } from '../../apps/controller/src/modules/workspaces/git.js';

// A scripted Git (no subprocess in the default suite) plays both the work tree and "GitHub": a clone writes a marker `.git` into the real directory.
interface Repo { id: string; owner: string; name: string; branches: string[]; archived?: boolean }
const repos: Repo[] = [
  { id: 'REPO_1', owner: 'acme', name: 'widgets', branches: ['main', 'develop'] },
  { id: 'REPO_2', owner: 'acme', name: 'other', branches: ['main'] },
  { id: 'REPO_3', owner: 'acme', name: 'archived', branches: ['main'], archived: true },
];
const urlOf = (repo: Repo) => `https://github.com/${repo.owner}/${repo.name}`;
const find = (reference: RepositoryReference) => repos.find(repo => repo.owner === reference.owner && repo.name === reference.name);
const repoForUrl = (url: string) => repos.find(repo => urlOf(repo) === url);
const sha = 'a'.repeat(40);
const complete = <T>(data: T): GitHubQueryResult<T> => ({ state: 'complete', data, diagnostics: [], retryAtMs: null });
const missing = <T>(): GitHubQueryResult<T> => ({ state: 'inaccessible', data: null, diagnostics: [], retryAtMs: null });
const repositoryOf = (repo: Repo): GitHubRepository => ({ id: repo.id, owner: { id: `OWNER_${repo.owner}`, login: repo.owner }, name: repo.name, url: urlOf(repo),
  defaultBranch: 'main', isArchived: repo.archived === true, isPrivate: true });

interface Marker { url: string; head: string | null; branches: string[] }
const markerPath = (directory: string) => join(directory, '.git', 'fake.json');
function writeMarker(directory: string, marker: Marker): void {
  mkdirSync(join(directory, '.git'), { recursive: true });
  writeFileSync(markerPath(directory), JSON.stringify(marker));
}
function readMarker(directory: string): Marker | null {
  try { return JSON.parse(readFileSync(markerPath(directory), 'utf8')) as Marker; } catch { return null; }
}

interface GitBehavior { clone: 'ok' | 'fail' | 'block'; clones: number; release: () => void; unconfirmed: boolean }
function createBehavior(): GitBehavior { return { clone: 'ok', clones: 0, release: () => {}, unconfirmed: false }; }
const exit1 = { exitCode: 1, stdout: '' };
const output = (stdout: string) => ({ exitCode: 0, stdout });
function createGit(behavior: GitBehavior): GitReader {
  return async (cwd, args) => {
    const marker = readMarker(cwd);
    if (args.includes('clone')) {
      behavior.clones += 1;
      const url = args[args.indexOf('--') + 1] ?? '';
      const base = args[args.indexOf('--branch') + 1] ?? '';
      if (behavior.clone === 'fail') { writeFileSync(join(cwd, 'partial.txt'), 'x'); return { exitCode: 128, stdout: '' }; }
      if (behavior.clone === 'block') {
        writeFileSync(join(cwd, 'partial.txt'), 'x');
        await new Promise<void>(resolve => { behavior.release = resolve; });
        return output('');
      }
      writeMarker(cwd, { url, head: base, branches: repoForUrl(url)?.branches ?? [base] });
      return output('');
    }
    if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return marker ? output(`${cwd}\n`) : { exitCode: 128, stdout: '' };
    if (args[0] === 'config' && args.includes('--get-all')) return marker ? output(`${marker.url}\0`) : exit1;
    if (args[0] === 'config' && args.includes('--get-regexp')) return exit1;
    if (args[0] === 'rev-parse' && args.includes('--verify')) {
      const branch = /^refs\/heads\/(.+)\^\{commit\}$/.exec(args.at(-1) ?? '')?.[1];
      return marker && branch && marker.branches.includes(branch) ? output(`${sha}\n`) : exit1;
    }
    if (args[0] === 'symbolic-ref') {
      if (!marker?.head) return exit1;
      return output(args.includes('--short') ? `${marker.head}\n` : `refs/heads/${marker.head}\n`);
    }
    throw new Error(`unscripted git ${args.join(' ')}`);
  };
}

const unused = vi.fn(async () => { throw new Error('unused in this suite'); });
const github = {
  getRepository: vi.fn(async (reference: RepositoryReference) => { const repo = find(reference); return repo ? complete(repositoryOf(repo)) : missing<GitHubRepository>(); }),
  resolveBranch: vi.fn(async (reference: RepositoryReference, branch: string) => {
    const repo = find(reference);
    return repo?.branches.includes(branch) ? complete<GitHubBranch>({ repositoryId: repo.id, name: branch, sha })
      : { state: 'inaccessible', data: null, diagnostics: [{ code: 'BRANCH_NOT_FOUND', message: 'Branch not found.', recovery: 'Choose an existing branch.' }], retryAtMs: null } satisfies GitHubQueryResult<GitHubBranch>;
  }),
  getIdentity: vi.fn(async () => complete({ id: 'ACCOUNT_test', login: 'test-user' })),
  getProjectOwner: unused, listProjects: unused, getProject: unused, validateProjectSelection: unused, listProjectItems: unused, getIssueContextById: unused,
};
const githubSetup = {
  resolveExecutable: vi.fn(async () => ({ state: 'not_found' as const, path: null, version: null, diagnostics: [] })),
  validateExecutable: vi.fn(), activateExecutable: vi.fn(), getAuthenticationAccounts: vi.fn(),
};

function createInspectOrigin(behavior: GitBehavior) {
  return async (input: { source: { location: string }; baseBranch: string }): Promise<OriginInspection> => {
    const marker = readMarker(input.source.location);
    const repo = marker ? repoForUrl(marker.url) : undefined;
    const confirmed = repo !== undefined && !behavior.unconfirmed;
    return { state: 'identified', source: { kind: 'local', location: input.source.location },
      local: { root: input.source.location, headSha: sha, dirty: false }, base: { branch: input.baseBranch, sha, observedFrom: 'local' },
      remote: confirmed ? { name: 'origin', url: urlOf(repo), confirmed: true, repository: repositoryOf(repo), branch: { repositoryId: repo.id, name: input.baseBranch, sha } } : null,
      diagnostics: confirmed ? [] : [{ code: 'REMOTE_MISSING', message: 'No remote.', recovery: 'Configure remote.' }],
      githubDiagnostics: [], retryAtMs: null, executionReady: false };
  };
}

const directories: string[] = [];
const resources: { close(): unknown }[] = [];
const host = '127.0.0.1:4310';
const bootstrap = { host, origin: `http://${host}`, 'content-type': 'application/json', 'x-factory-client': 'web' };
type App = ReturnType<typeof createApp>;

function launch(directory: string, behavior: GitBehavior) {
  const storage = openStorage({ dataDirectory: directory, busyTimeoutMs: 25 });
  const git = createGit(behavior);
  const workspaces = { ...createProjectFolderWorkspace(github, git), inspectOrigin: createInspectOrigin(behavior) };
  const configuration = loadConfiguration({ FACTORY_DATA_DIR: directory, FACTORY_LOG_LEVEL: 'silent' }, directory);
  const app = createApp(configuration, storage, undefined, { github, githubSetup, workspaces });
  resources.push(app);
  return { app, storage };
}
async function login(app: App) {
  const response = await app.inject({ method: 'POST', url: '/api/v1/session', headers: bootstrap, payload: {} });
  expect(response.statusCode).toBe(200);
  return { ...bootstrap, cookie: String(response.headers['set-cookie']).split(';')[0]!, 'x-csrf-token': response.json<SessionResponse>().csrf_token };
}
async function setup(options: { projectsRoot?: boolean } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'factory-imports-')); directories.push(directory);
  const root = join(directory, 'projects'); mkdirSync(root);
  const behavior = createBehavior();
  const { app, storage } = launch(directory, behavior);
  if (options.projectsRoot !== false) {
    const settings = storage.getGlobalConfiguration(); const changes = { projects_root: root };
    storage.saveSettings({ operationId: randomUUID(), expectedRevision: settings.etag, body: { changes }, changes });
  }
  return { directory, root, behavior, app, storage, headers: await login(app) };
}
type Fixture = Awaited<ReturnType<typeof setup>>;

const request = (name: string, folder: string, extra: Record<string, unknown> = {}) => ({ name, repository_url: 'https://github.com/acme/widgets', folder_name: folder, ...extra });
const postImport = (f: Fixture, body: unknown, key = randomUUID()) => f.app.inject({ method: 'POST', url: '/api/v1/projects/imports', headers: { ...f.headers, 'idempotency-key': key }, payload: body as object });
async function settle(app: App, headers: Record<string, string>, id: string): Promise<ProjectImportView> {
  let view: ProjectImportView | undefined;
  await vi.waitFor(async () => {
    const response = await app.inject({ method: 'GET', url: `/api/v1/projects/imports/${id}`, headers });
    view = response.json<ProjectImportView>();
    expect(['completed', 'failed']).toContain(view.state);
  }, { timeout: 5000, interval: 25 });
  return view!;
}
async function runImport(f: Fixture, body: unknown): Promise<ProjectImportView> {
  const response = await postImport(f, body);
  expect(response.statusCode).toBe(202);
  return settle(f.app, f.headers, response.json<{ resource: { type: string; id: string } }>().resource.id);
}
async function projectCount(f: Fixture): Promise<number> {
  return (await f.app.inject({ method: 'GET', url: '/api/v1/projects', headers: f.headers })).json<ProjectPage>().items.length;
}

afterEach(async () => {
  for (const resource of resources.splice(0).reverse()) await resource.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  vi.clearAllMocks();
});

describe('registration by GitHub URL clones into the Pasta do projeto', () => {
  it('clones into the suggested folder and registers the project from the clone', async () => {
    const f = await setup();
    const response = await postImport(f, request('Widgets', 'widgets'));
    expect(response.statusCode).toBe(202);
    const accepted = response.json<{ operation_id: string; resource: { type: string; id: string } }>();
    expect(accepted.resource.type).toBe('project_import');
    const view = await settle(f.app, f.headers, accepted.resource.id);
    expect(view).toMatchObject({ state: 'completed', adopted: false, repository_id: 'REPO_1', base_branch: 'main', cleanup: 'not_needed', diagnostic: null,
      destination: join(f.root, 'widgets'), repository_url: 'https://github.com/acme/widgets' });
    expect(view.steps.map(step => step.state)).toEqual(['confirmed', 'confirmed', 'confirmed', 'confirmed', 'confirmed']);
    expect(readMarker(join(f.root, 'widgets'))).toMatchObject({ url: 'https://github.com/acme/widgets', head: 'main' });
    const source = f.storage.getConfiguration(view.project_id!).view.configuration.source;
    expect(source).toMatchObject({ kind: 'local', location: join(f.root, 'widgets'), repository_id: 'REPO_1', repository_url: 'https://github.com/acme/widgets' });
    const operation = await f.app.inject({ method: 'GET', url: `/api/v1/operations/${accepted.operation_id}`, headers: f.headers });
    expect(operation.json<{ state: string }>().state).toBe('succeeded');
    const etag = (await f.app.inject({ method: 'GET', url: `/api/v1/projects/imports/${view.id}`, headers: f.headers })).headers.etag;
    expect(etag).toBe(`"project-import:${view.id}:${view.revision}"`);
  });

  it('clones into an edited folder name on the chosen base branch', async () => {
    const f = await setup();
    const view = await runImport(f, request('Widgets', 'my-widgets', { base_branch: 'develop' }));
    expect(view).toMatchObject({ state: 'completed', base_branch: 'develop', destination: join(f.root, 'my-widgets') });
    expect(readMarker(join(f.root, 'my-widgets'))).toMatchObject({ head: 'develop' });
  });

  it('adopts an existing clone of the same repository without cloning again', async () => {
    const f = await setup();
    writeMarker(join(f.root, 'widgets'), { url: 'https://github.com/acme/widgets', head: 'main', branches: ['main'] });
    const view = await runImport(f, request('Widgets', 'widgets'));
    expect(view).toMatchObject({ state: 'completed', adopted: true });
    expect(view.steps.find(step => step.step === 'clone')?.state).toBe('skipped');
    expect(f.behavior.clones).toBe(0);
    expect(f.storage.getConfiguration(view.project_id!).view.configuration.source.repository_id).toBe('REPO_1');
  });

  it('adopts an existing clone checked out on another branch as long as the base branch exists locally', async () => {
    const f = await setup();
    writeMarker(join(f.root, 'widgets'), { url: 'https://github.com/acme/widgets', head: 'develop', branches: ['main', 'develop'] });
    expect(await runImport(f, request('Widgets', 'widgets'))).toMatchObject({ state: 'completed', adopted: true });
  });

  it('blocks a destination with other content and never touches it', async () => {
    const f = await setup();
    mkdirSync(join(f.root, 'widgets')); writeFileSync(join(f.root, 'widgets', 'notes.txt'), 'mine');
    const view = await runImport(f, request('Widgets', 'widgets'));
    expect(view).toMatchObject({ state: 'failed', diagnostic: 'IMPORT_DESTINATION_OCCUPIED', cleanup: 'not_needed' });
    expect(readdirSync(join(f.root, 'widgets'))).toEqual(['notes.txt']);
    expect(await projectCount(f)).toBe(0);
  });

  it("blocks a destination that is another repository's clone", async () => {
    const f = await setup();
    writeMarker(join(f.root, 'widgets'), { url: 'https://github.com/acme/other', head: 'main', branches: ['main'] });
    const view = await runImport(f, request('Widgets', 'widgets'));
    expect(view).toMatchObject({ state: 'failed', diagnostic: 'IMPORT_DESTINATION_OCCUPIED' });
    expect(readMarker(join(f.root, 'widgets'))?.url).toBe('https://github.com/acme/other');
  });

  it('fails before creating anything when the base branch does not exist on GitHub', async () => {
    const f = await setup();
    const view = await runImport(f, request('Widgets', 'widgets', { base_branch: 'nope' }));
    expect(view).toMatchObject({ state: 'failed', diagnostic: 'IMPORT_BASE_BRANCH_NOT_FOUND', cleanup: 'not_needed' });
    expect(existsSync(join(f.root, 'widgets'))).toBe(false);
    expect(f.behavior.clones).toBe(0);
  });

  it('fails for an unknown or archived repository', async () => {
    const f = await setup();
    expect(await runImport(f, { ...request('Ghost', 'ghost'), repository_url: 'https://github.com/acme/ghost' })).toMatchObject({ state: 'failed', diagnostic: 'IMPORT_REPOSITORY_UNAVAILABLE' });
    expect(await runImport(f, { ...request('Old', 'old'), repository_url: 'https://github.com/acme/archived' })).toMatchObject({ state: 'failed', diagnostic: 'REPOSITORY_ARCHIVED' });
    expect(readdirSync(f.root)).toEqual([]);
  });
});

describe('atomicity and cleanup', () => {
  it('removes only the folder it created after a failed clone', async () => {
    const f = await setup();
    f.behavior.clone = 'fail';
    const view = await runImport(f, request('Widgets', 'widgets'));
    expect(view).toMatchObject({ state: 'failed', diagnostic: 'IMPORT_CLONE_FAILED', cleanup: 'removed', project_id: null });
    expect(existsSync(join(f.root, 'widgets'))).toBe(false);
    expect(await projectCount(f)).toBe(0);
  });

  it('keeps a pre-existing empty folder after a failed clone', async () => {
    const f = await setup();
    mkdirSync(join(f.root, 'widgets'));
    f.behavior.clone = 'fail';
    const view = await runImport(f, request('Widgets', 'widgets'));
    expect(view).toMatchObject({ state: 'failed', diagnostic: 'IMPORT_CLONE_FAILED', cleanup: 'not_needed' });
    expect(existsSync(join(f.root, 'widgets'))).toBe(true);
  });

  it('leaves no project and no folder when registration fails after the clone', async () => {
    const f = await setup();
    f.behavior.unconfirmed = true;
    const view = await runImport(f, request('Widgets', 'widgets'));
    expect(view).toMatchObject({ state: 'failed', diagnostic: 'IMPORT_REGISTRATION_FAILED', cleanup: 'removed', project_id: null });
    expect(existsSync(join(f.root, 'widgets'))).toBe(false);
    expect(await projectCount(f)).toBe(0);
  });

  it('never removes an adopted folder when registration fails', async () => {
    const f = await setup();
    writeMarker(join(f.root, 'widgets'), { url: 'https://github.com/acme/widgets', head: 'main', branches: ['main'] });
    f.behavior.unconfirmed = true;
    const view = await runImport(f, request('Widgets', 'widgets'));
    expect(view).toMatchObject({ state: 'failed', diagnostic: 'IMPORT_REGISTRATION_FAILED', cleanup: 'not_needed' });
    expect(readMarker(join(f.root, 'widgets'))).not.toBeNull();
  });

  it('treats an already removed created folder as cleaned', async () => {
    const { removeCreatedProjectFolder } = createProjectFolderWorkspace(github, createGit(createBehavior()));
    await expect(removeCreatedProjectFolder(tmpdir(), join(tmpdir(), `factory-gone-${randomUUID()}`), '1:2:3')).resolves.toBeUndefined();
  });
});

describe('acceptance rules', () => {
  it('replays the same key and body as the same operation, and rejects a different body', async () => {
    const f = await setup();
    const key = randomUUID();
    const first = await postImport(f, request('Widgets', 'widgets'), key);
    const second = await postImport(f, request('Widgets', 'widgets'), key);
    expect([first.statusCode, second.statusCode]).toEqual([202, 202]);
    expect(second.json<{ operation_id: string }>().operation_id).toBe(first.json<{ operation_id: string }>().operation_id);
    const view = await settle(f.app, f.headers, first.json<{ resource: { id: string } }>().resource.id);
    expect(view.state).toBe('completed');
    expect(f.behavior.clones).toBe(1);
    const replay = await postImport(f, request('Widgets', 'widgets'), key);
    expect(replay.statusCode).toBe(202);
    expect(await projectCount(f)).toBe(1);
    const conflict = await postImport(f, request('Widgets', 'other-folder'), key);
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json<{ code: string }>().code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('refuses a destination already used by a registered project', async () => {
    const f = await setup();
    await runImport(f, request('Widgets', 'widgets'));
    const again = await postImport(f, request('Widgets again', 'Widgets'));
    expect(again.statusCode).toBe(409);
    expect(again.json<{ code: string }>().code).toBe('IMPORT_DESTINATION_RESERVED');
  });

  it.each([
    ['IMPORT_URL_INVALID', { ...request('X', 'x'), repository_url: 'https://example.com/acme/widgets' }],
    ['IMPORT_URL_INVALID', { ...request('X', 'x'), repository_url: 'https://token@github.com/acme/widgets' }],
    ['IMPORT_FOLDER_INVALID', request('X', '..')],
    ['IMPORT_FOLDER_INVALID', request('X', 'a/b')],
    ['IMPORT_FOLDER_INVALID', request('X', 'a\\b')],
    ['IMPORT_FOLDER_INVALID', request('X', 'CON')],
    ['IMPORT_FOLDER_INVALID', request('X', 'trailing.')],
    ['BASE_BRANCH_INVALID', request('X', 'x', { base_branch: 'bad..branch' })],
  ])('rejects %s synchronously', async (code, body) => {
    const f = await setup();
    const response = await postImport(f, body);
    expect(response.statusCode).toBe(400);
    expect(response.json<{ code: string }>().code).toBe(code);
    expect(readdirSync(f.root)).toEqual([]);
  });

  it('requires a configured projects root', async () => {
    const f = await setup({ projectsRoot: false });
    const response = await postImport(f, request('Widgets', 'widgets'));
    expect(response.statusCode).toBe(409);
    expect(response.json<{ code: string }>().code).toBe('PROJECTS_ROOT_REQUIRED');
  });

  it('answers 404 for an unknown import', async () => {
    const f = await setup();
    const response = await f.app.inject({ method: 'GET', url: `/api/v1/projects/imports/${randomUUID()}`, headers: f.headers });
    expect(response.statusCode).toBe(404);
    expect(response.json<{ code: string }>().code).toBe('PROJECT_IMPORT_NOT_FOUND');
  });
});

describe('restart', () => {
  it('resumes an import interrupted during the clone and wipes only what it created', async () => {
    const f = await setup();
    f.behavior.clone = 'block';
    const response = await postImport(f, request('Widgets', 'widgets'));
    const id = response.json<{ resource: { id: string } }>().resource.id;
    await vi.waitFor(() => expect(f.behavior.clones).toBe(1), { timeout: 5000, interval: 10 });
    expect(existsSync(join(f.root, 'widgets', 'partial.txt'))).toBe(true);
    // Simulate the crash: the connection dies while the worker is still inside the clone.
    f.storage.close();

    const second = launch(f.directory, createBehavior());
    await second.app.ready();
    const view = await settle(second.app, await login(second.app), id);
    expect(view).toMatchObject({ state: 'completed', adopted: false, cleanup: 'not_needed' });
    expect(existsSync(join(f.root, 'widgets', 'partial.txt'))).toBe(false);
    expect(readMarker(join(f.root, 'widgets'))).toMatchObject({ head: 'main' });
    expect(second.storage.getConfiguration(view.project_id!).view.configuration.source.repository_id).toBe('REPO_1');
    // Let the first process's stranded worker finish; its storage is gone, so it can change nothing.
    f.behavior.release();
    await f.app.close();
  });
});

describe('Configurar projeto', () => {
  async function importedProject(f: Fixture): Promise<string> {
    const view = await runImport(f, request('Widgets', 'widgets'));
    return view.project_id!;
  }
  const inspect = (f: Fixture, projectId: string, location: string) => f.app.inject({ method: 'POST', url: `/api/v1/projects/${projectId}/folder-inspection`, headers: f.headers, payload: { location } });
  async function changeFolder(f: Fixture, projectId: string, location: string) {
    const current = await f.app.inject({ method: 'GET', url: `/api/v1/projects/${projectId}/configuration`, headers: f.headers });
    return f.app.inject({ method: 'PUT', url: `/api/v1/projects/${projectId}/configuration`,
      headers: { ...f.headers, 'if-match': String(current.headers.etag), 'idempotency-key': randomUUID() }, payload: { project_changes: { source: { kind: 'local', location } } } });
  }

  it('labels a candidate folder: same repository, other repository, not a clone, unavailable', async () => {
    const f = await setup();
    const projectId = await importedProject(f);
    const same = join(f.root, 'widgets');
    const other = join(f.root, 'other'); writeMarker(other, { url: 'https://github.com/acme/other', head: 'main', branches: ['main'] });
    const detached = join(f.root, 'detached'); writeMarker(detached, { url: 'https://github.com/acme/widgets', head: null, branches: ['main'] });
    const plain = join(f.root, 'plain'); mkdirSync(plain);
    const read = async (location: string) => { const r = await inspect(f, projectId, location); expect(r.statusCode).toBe(200); return r.json<ProjectFolderInspection>(); };
    expect(await read(same)).toMatchObject({ clone: 'same_repository', repository: 'acme/widgets', checkout: { kind: 'branch', name: 'main' }, diagnostic: null });
    expect(await read(other)).toMatchObject({ clone: 'other_repository', repository: 'acme/widgets', checkout: { kind: 'branch', name: 'main' } });
    expect(await read(detached)).toMatchObject({ clone: 'same_repository', checkout: { kind: 'detached' } });
    expect(await read(plain)).toMatchObject({ clone: 'not_clone', checkout: null });
    expect(await read(join(f.root, 'absent'))).toMatchObject({ clone: 'unavailable', diagnostic: 'FOLDER_UNAVAILABLE' });
  });

  it("rejects another repository's folder and accepts another clone of the same repository", async () => {
    const f = await setup();
    const projectId = await importedProject(f);
    const other = join(f.root, 'other'); writeMarker(other, { url: 'https://github.com/acme/other', head: 'main', branches: ['main'] });
    const rejected = await changeFolder(f, projectId, other);
    expect(rejected.statusCode).toBe(409);
    expect(rejected.json<{ code: string; message: string }>()).toMatchObject({ code: 'PROJECT_FOLDER_NOT_CLONE', message: expect.stringContaining('acme/widgets') });
    const second = join(f.root, 'widgets-2'); writeMarker(second, { url: 'https://github.com/acme/widgets', head: 'main', branches: ['main'] });
    const accepted = await changeFolder(f, projectId, second);
    expect(accepted.statusCode).toBe(200);
    expect(f.storage.getConfiguration(projectId).view.configuration.source).toMatchObject({ location: second, repository_id: 'REPO_1' });
  });

  it('rejects a github source kind on new registrations and configuration changes', async () => {
    const f = await setup();
    const projectId = await importedProject(f);
    const registration = await f.app.inject({ method: 'POST', url: '/api/v1/projects', headers: { ...f.headers, 'idempotency-key': randomUUID() },
      payload: { name: 'Legacy', source: { kind: 'github', location: 'https://github.com/acme/widgets' }, base_branch: 'main' } });
    expect(registration.statusCode).toBe(400);
    expect(registration.json<{ code: string }>().code).toBe('SOURCE_KIND_UNSUPPORTED');
    const current = await f.app.inject({ method: 'GET', url: `/api/v1/projects/${projectId}/configuration`, headers: f.headers });
    const change = await f.app.inject({ method: 'PUT', url: `/api/v1/projects/${projectId}/configuration`,
      headers: { ...f.headers, 'if-match': String(current.headers.etag), 'idempotency-key': randomUUID() },
      payload: { project_changes: { source: { kind: 'github', location: 'https://github.com/acme/widgets' } } } });
    expect(change.statusCode).toBe(400);
    expect(change.json<{ code: string }>().code).toBe('SOURCE_KIND_UNSUPPORTED');
  });

  it('flags a legacy github-sourced project with PROJECT_FOLDER_MISSING', async () => {
    const f = await setup();
    const location = 'https://github.com/acme/widgets';
    const operation = f.storage.registerProject({ operationId: randomUUID(), expectedRevision: undefined,
      body: { name: 'Legacy', base_branch: 'main', source: { kind: 'github', location } },
      source: { kind: 'github', location, repository_id: 'REPO_1', repository_url: location }, originNotes: [] });
    expect(f.storage.getConfiguration(operation.resource.id).view.prerequisites.map(item => item.code)).toContain('PROJECT_FOLDER_MISSING');
  });
});
