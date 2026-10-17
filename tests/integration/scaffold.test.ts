import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as directoryFs from 'node:fs/promises';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import { CreationView, ScaffoldOptions, ScaffoldPlanned, type CreateScaffold, type ScaffoldInput, type SessionResponse } from '#contracts';
import { createScaffold } from '../../apps/controller/src/modules/projects/index.js';
import { loadScaffoldCatalog, renderEngineering } from '../../apps/controller/src/modules/projects/scaffold-resources.js';
import { createLocalScaffolder } from '../../apps/controller/src/modules/workspaces/scaffold.js';
import type { GitReader } from '../../apps/controller/src/modules/workspaces/git.js';
import { openStorage } from '../../apps/controller/src/modules/storage/index.js';
import { createApp } from '../../apps/controller/src/http/app.js';
import { loadConfiguration } from '../../apps/controller/src/config.js';
import { applyMigrations, loadMigrations } from '../../apps/controller/src/modules/storage/migrations.js';
import { readSettings, seedSettings } from '../../apps/controller/src/modules/storage/settings.js';
import { saveTimeDefaults, settingsETag } from '../../apps/controller/src/modules/storage/operations.js';

vi.mock('node:fs/promises', async importOriginal => {
  const original = await importOriginal<typeof import('node:fs/promises')>();
  return { ...original, realpath: vi.fn(async (path: string) => resolve(path)) };
});
const directories: string[] = [];
const cleanup: (() => void | Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); for (const directory of directories.splice(0)) rmSync(directory,{ recursive: true }); vi.clearAllMocks(); });
function fixture() {
  const cache = resolve('.cache'); mkdirSync(cache,{ recursive: true }); const directory = mkdtempSync(join(cache,'scaffold-test-')); directories.push(directory);
  const projectsRoot = join(directory,'projects'); mkdirSync(projectsRoot);
  const storage = openStorage({ dataDirectory: join(directory,'data'), busyTimeoutMs: 20 }); cleanup.push(() => storage.close());
  storage.saveSettings({ operationId: randomUUID(), expectedRevision: storage.getGlobalConfiguration().etag, body: { changes: { projectsRoot } }, changes: { projectsRoot } });
  let login = 'fixture-user'; let branch = 'main'; let failGit = false;
  const calls: string[][] = [];
  const git: GitReader = async (cwd, args) => {
    calls.push([...args]);
    expect(storage.getEvents({}).items.some(e => e.eventType === 'creation.accepted')).toBe(true);
    if (args[0] === 'init') { mkdirSync(join(cwd,'.git')); branch = args.find(a => a.startsWith('--initial-branch='))!.split('=')[1]!; }
    if (failGit && args.includes('commit')) return { exitCode: 1, stdout: '' };
    return { exitCode: 0, stdout: ['rev-parse','rev-list'].includes(args[0]!) ? 'a'.repeat(40) : args[0] === 'symbolic-ref' ? `refs/heads/${branch}` : '' };
  };
  const workspaces = createLocalScaffolder(git);
  const github = { getIdentity: vi.fn(async () => ({ state: 'complete' as const, data: { id: login, login }, diagnostics: [], retryAtMs: null })) };
  const logFailure = vi.fn(); const scaffold = createScaffold({ storage, github, workspaces, logFailure }); cleanup.push(() => scaffold.close());
  const db = new Database(join(directory,'data','factory.sqlite')); cleanup.push(() => { db.close(); });
  return { directory, projectsRoot, storage, scaffold, workspaces, github, calls, db, logFailure, changeAccount: () => { login = 'other-user'; }, failGit: () => { failGit = true; } };
}
async function choices(f: ReturnType<typeof fixture>, destinationRelative = 'new-project'): Promise<ScaffoldInput> {
  const options = await f.scaffold.getOptions(); const template = options.templates[0]!;
  return { name: 'Projeto á', templateId: template.id, templateDigest: template.digest, destinationRelative, creationMode: 'local', baseBranch: 'feature/baseline', triageEnabled: false };
}
async function authorized(f: ReturnType<typeof fixture>): Promise<CreateScaffold> { const p = await f.scaffold.plan(await choices(f)); return { planHash: p.planHash, plan: p.plan, authorized: true }; }

describe('local scaffold planning and durable creation (controlled Git and canonicalization)', () => {
  it('returns versioned options and a deterministic plan with no destination or Git effects', async () => {
    const f = fixture(); const before = f.storage.getEvents({}); const options = await f.scaffold.getOptions(); expect(Value.Check(ScaffoldOptions,options)).toBe(true);
    expect(options.creationModes.map(m => m.capability.available)).toEqual([true,false,false]);
    const input = await choices(f); const first = await f.scaffold.plan(input); const second = await f.scaffold.plan(input);
    expect(Value.Check(ScaffoldPlanned,first)).toBe(true); expect(first).toEqual(second);
    expect(first.plan).toMatchObject({ destination: join(f.projectsRoot,'new-project'), ownerId: null, engineering: { tracker: 'github', installsSkills: false, createsLabels: false }, account: { id: 'fixture-user' } });
    expect(first.plan.files.map(f => f.path)).toContain('AGENTS.md'); expect(first.plan.files.some(f => f.path.includes('triage-labels'))).toBe(false);
    expect(existsSync(first.plan.destination)).toBe(false); expect(f.calls).toEqual([]); expect(f.storage.getEvents({})).toEqual(before);
  });
  it('persists intent before files/Git, finishes with baseline and a configurable project on the same branch', async () => {
    const f = fixture(); const body = await authorized(f); const operationId = randomUUID();
    const operation = await f.scaffold.create(body,operationId); expect(operation.resource.type).toBe('creation'); expect(operation.receipt).toBeDefined();
    await f.scaffold.drain(); const view = f.scaffold.getCreation(operation.resource.id); expect(Value.Check(CreationView,view)).toBe(true);
    expect(view.creation).toMatchObject({ state: 'completed', baselineSha: 'a'.repeat(40), baselineRef: 'refs/heads/feature/baseline' });
    expect(view.confirmedEffects.map(e => e.step)).toEqual(['directory','files','git','baseline','registration']); expect(view.pendingEffects).toEqual([]);
    const project = f.storage.getConfiguration(view.creation.projectId!).view;
    expect(project.configuration).toMatchObject({ baseBranch: 'feature/baseline', source: { kind: 'local', location: body.plan.destination }, githubProject: null, automationEnabled: false });
    expect(project.prerequisites.map(p => p.code)).toEqual(expect.arrayContaining(['REMOTE_UNCONFIRMED','PROJECT_REQUIRED']));
    expect(f.storage.getOperation(operationId)?.state).toBe('succeeded');
    expect(readFileSync(join(body.plan.destination,'AGENTS.md'),'utf8')).toContain('docs/agents/domain.md');
    expect(existsSync(join(body.plan.destination,'.agents'))).toBe(false);
    expect(f.db.prepare('SELECT count(*) AS n FROM attempts').get()).toEqual({ n: 0 });
    const previous = f.calls.length; const replay = await f.scaffold.create(body,operationId); await f.scaffold.drain();
    expect(replay.resource).toEqual(operation.resource); expect(replay.receipt).toEqual(operation.receipt); expect(f.calls).toHaveLength(previous);
    const stored = JSON.stringify(f.db.prepare('SELECT * FROM project_creations').all()); expect(stored).not.toContain('Engineering configuration generated');
    expect(() => f.db.prepare("UPDATE project_creations SET plan_hash=?,revision=revision+1").run('b'.repeat(64))).toThrow();
  });
  it.each(['../escape', '/absolute', 'C:/drive', 'link\\escape', 'NUL', 'bad:stream', 'trail.'])('rejects unsafe destination %s before writing', async destination => {
    const f = fixture(); await expect(f.scaffold.plan(await choices(f,destination))).rejects.toMatchObject({ code: 'SCAFFOLD_PATH_INVALID' }); expect(f.calls).toEqual([]);
  });
  it('refuses existing destination, changed account/configuration, changed branch and stale template without effects', async () => {
    const f = fixture(); const body = await authorized(f); mkdirSync(body.plan.destination);
    await expect(f.scaffold.create(body,randomUUID())).rejects.toMatchObject({ code: 'SCAFFOLD_DESTINATION_EXISTS' });
    const other = await f.scaffold.plan(await choices(f,'other')); f.changeAccount();
    await expect(f.scaffold.create({ planHash: other.planHash, plan: other.plan, authorized: true },randomUUID())).rejects.toMatchObject({ code: 'SCAFFOLD_PLAN_CHANGED' });
    const third = await f.scaffold.plan(await choices(f,'third'));
    await expect(f.scaffold.create({ ...third, authorized: true, plan: { ...third.plan, input: { ...third.plan.input, baseBranch: 'another' } } },randomUUID())).rejects.toMatchObject({ code: 'SCAFFOLD_COMMAND_INVALID' });
    f.storage.saveTimeDefaults({ operationId: randomUUID(), expectedRevision: f.storage.getSettingsETag(), timeDefaults: { ...f.storage.getSettings().timeDefaults, pollingIntervalMs: 13000 } });
    await expect(f.scaffold.create({ planHash: third.planHash, plan: third.plan, authorized: true },randomUUID())).rejects.toMatchObject({ code: 'SCAFFOLD_PLAN_CHANGED' });
    await expect(f.scaffold.plan({ ...await choices(f,'fourth'), templateDigest: 'b'.repeat(64) })).rejects.toMatchObject({ code: 'SCAFFOLD_TEMPLATE_CHANGED' });
    expect(f.calls).toEqual([]); expect(f.db.prepare('SELECT count(*) AS n FROM project_creations').get()).toEqual({ n: 0 });
  });
  it('refuses canonical redirection and missing parent before writes', async () => {
    const f = fixture(); const input = await choices(f,'missing/child'); await expect(f.scaffold.plan(input)).rejects.toMatchObject({ code: 'SCAFFOLD_DESTINATION_UNAVAILABLE' });
    const safeInput = await choices(f); vi.mocked(directoryFs.realpath).mockImplementationOnce(async () => resolve('.cache'));
    await expect(f.scaffold.plan(safeInput)).rejects.toMatchObject({ code: 'SCAFFOLD_PATH_REDIRECTED' }); expect(f.calls).toEqual([]);
    vi.mocked(directoryFs.realpath).mockImplementation(async path => resolve(String(path)));
  });
  it('preserves partial files and uncertain baseline, with no blind replay or registration', async () => {
    const f = fixture(); f.failGit(); const body = await authorized(f); const id = randomUUID(); const op = await f.scaffold.create(body,id); await f.scaffold.drain();
    expect(f.scaffold.getCreation(op.resource.id)).toMatchObject({ creation: { state: 'partial', projectId: null, diagnostic: 'SCAFFOLD_GIT_FAILED' }, pendingEffects: [{ step: 'baseline',state: 'unknown' },{ step: 'registration',state: 'not_started' }] });
    expect(existsSync(join(body.plan.destination,'AGENTS.md'))).toBe(true); const count = f.calls.length;
    expect((await f.scaffold.create(body,id)).state).toBe('unknown'); await f.scaffold.drain(); expect(f.calls).toHaveLength(count);
    expect(f.storage.listProjects({}).items).toEqual([]);
  });
  it('rolls back acceptance when its event cannot be persisted, before filesystem work', async () => {
    const f = fixture(); const body = await authorized(f);
    f.db.exec("CREATE TRIGGER fail_creation BEFORE INSERT ON events WHEN NEW.event_type='creation.accepted' BEGIN SELECT RAISE(ABORT,'TEST_FAILURE'); END");
    await expect(f.scaffold.create(body,randomUUID())).rejects.toThrow(); await f.scaffold.drain();
    expect(f.db.prepare('SELECT count(*) AS n FROM project_creations').get()).toEqual({ n: 0 }); expect(existsSync(body.plan.destination)).toBe(false); expect(f.calls).toEqual([]);
  });
  it('preserves baseline when registration fails and rolls back the entire project aggregate', async () => {
    const f = fixture(); const body = await authorized(f);
    f.db.exec("CREATE TRIGGER fail_registration BEFORE INSERT ON project_revisions BEGIN SELECT RAISE(ABORT,'TEST_FAILURE'); END");
    const op = await f.scaffold.create(body,randomUUID()); await f.scaffold.drain();
    expect(f.scaffold.getCreation(op.resource.id).creation).toMatchObject({ state: 'partial', baselineSha: 'a'.repeat(40), projectId: null });
    expect(f.storage.listProjects({}).items).toEqual([]); expect(existsSync(body.plan.destination)).toBe(true);
  });
  it('marks unfinished intentions interrupted on restart and recovers receipts without launching', async () => {
    const f = fixture(); const body = await authorized(f); const operationId = randomUUID(); const accepted = f.storage.acceptCreation({ operationId,body });
    f.storage.interruptCreations(); expect(f.storage.getCreation(accepted.operation.resource.id).creation.diagnostic).toBe('CREATION_INTERRUPTED');
    expect((await f.scaffold.create(body,operationId)).state).toBe('failed'); expect(f.calls).toEqual([]);
  });
  it('deduplicates concurrent identical commands and conflicts with changed content', async () => {
    const f = fixture(); const body = await authorized(f); const operationId = randomUUID();
    const operations = await Promise.all([f.scaffold.create(body,operationId),f.scaffold.create(body,operationId)]); await f.scaffold.drain();
    expect(operations[0]!.resource).toEqual(operations[1]!.resource); expect(f.calls.filter(a => a.includes('commit'))).toHaveLength(1);
    const other = await f.scaffold.plan(await choices(f,'other-project'));
    await expect(f.scaffold.create({ planHash: other.planHash,plan: other.plan,authorized: true },operationId)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });
  it.each(['HEAD','bad..name','bad.lock','-option','bad name','nested/.hidden'])('rejects invalid branch %s before any write', async baseBranch => {
    const f = fixture(); await expect(f.scaffold.plan({ ...await choices(f),baseBranch })).rejects.toMatchObject({ code: 'SCAFFOLD_BRANCH_INVALID' }); expect(f.calls).toEqual([]);
  });
  it('commits metadata only after each durable step and preserves files when the next step cannot be recorded', async () => {
    const f = fixture(); const body = await authorized(f);
    f.db.exec("CREATE TRIGGER fail_files_confirmed BEFORE INSERT ON events WHEN NEW.event_type='creation.files.confirmed' BEGIN SELECT RAISE(ABORT,'TEST_FAILURE'); END");
    const operation = await f.scaffold.create(body,randomUUID()); await f.scaffold.drain();
    const view = f.storage.getCreation(operation.resource.id);
    expect(view.creation.state).toBe('partial'); expect(view.pendingEffects).toContainEqual({ step: 'files',state: 'unknown' });
    expect(existsSync(join(body.plan.destination,'AGENTS.md'))).toBe(true); expect(f.calls).toEqual([]); expect(f.storage.listProjects({}).items).toEqual([]);
  });
  it('upgrades real SQLite v12 preserving settings and receipts without manufacturing projects or creations', () => {
    const directory = mkdtempSync(resolve('.cache/scaffold-migration-')); directories.push(directory);
    const db = new Database(join(directory,'factory.sqlite'));
    applyMigrations(db,loadMigrations().slice(0,12),() => seedSettings(db,directory));
    const old = readSettings(db); const identity = old.installationId; const operationId = randomUUID();
    const receipt = saveTimeDefaults(db,{ operationId,expectedRevision: settingsETag(identity,old.revision),timeDefaults: { ...old.timeDefaults,pollingIntervalMs: 2000 } });
    expect(db.pragma('user_version',{ simple: true })).toBe(12); db.close();
    const reopened = openStorage({ dataDirectory: directory }); cleanup.push(() => reopened.close());
    expect(reopened.getSettings()).toMatchObject({ installationId: identity,timeDefaults: { pollingIntervalMs: 2000 } }); expect(reopened.getDiagnostics().schemaVersion).toBe(16);
    expect(reopened.getOperation(operationId)).toEqual(receipt); expect(reopened.listProjects({}).items).toEqual([]);
    const probe = new Database(join(directory,'factory.sqlite')); try { expect(probe.prepare('SELECT count(*) AS n FROM project_creations').get()).toEqual({ n: 0 }); expect(probe.pragma('foreign_key_check')).toEqual([]); } finally { probe.close(); }
  });
  it('serves authenticated options/plans/creation resources with durable operation lookup', async () => {
    const f = fixture(); const configuration = loadConfiguration({ FACTORY_DATA_DIR: join(f.directory,'data'), FACTORY_LOG_LEVEL: 'silent' },f.directory);
    const app = createApp(configuration,f.storage,undefined,undefined,undefined,undefined,{ github: f.github,workspaces: f.workspaces }); cleanup.push(() => app.close());
    expect((await app.inject({ url: '/api/v1/scaffold/options',headers: { host: '127.0.0.1:4310' } })).statusCode).toBe(401);
    const headers = { host: '127.0.0.1:4310',origin: 'http://127.0.0.1:4310','content-type': 'application/json','x-factory-client': 'web' };
    const session = await app.inject({ method: 'POST',url: '/api/v1/session',headers,payload: {} });
    const authenticated = { ...headers,cookie: String(session.headers['set-cookie']).split(';')[0]!, 'x-csrf-token': session.json<SessionResponse>().csrfToken };
    const options = await app.inject({ url: '/api/v1/scaffold/options',headers: authenticated }); expect(options.statusCode).toBe(200);
    const planned = await app.inject({ method: 'POST',url: '/api/v1/scaffold/plans',headers: authenticated,payload: await choices(f) }); expect(planned.statusCode).toBe(200);
    const plan = planned.json<ScaffoldPlanned>();
    const created = await app.inject({ method: 'POST',url: '/api/v1/scaffold/creations',headers: { ...authenticated,'idempotency-key': randomUUID() },payload: { planHash: plan.planHash,plan: plan.plan,authorized: true } }); expect(created.statusCode).toBe(202);
    const creationId = created.json<{ resource: { id: string } }>().resource.id;
    const detail = await app.inject({ url: `/api/v1/scaffold/creations/${creationId}`,headers: authenticated }); expect(detail.statusCode).toBe(200); expect(detail.headers.etag).toBeDefined();
    expect((await app.inject({ url: String(created.headers.location),headers: authenticated })).statusCode).toBe(200);
  });
});

describe('distributed engineering resources', () => {
  it('preserves surrounding AGENTS and CLAUDE instructions without duplicate sections; triage is conditional', async () => {
    const catalog = await loadScaffoldCatalog(); const original = '# Existing\n\nKeep this.\n\n## Agent skills\n\nCustom guidance.\n\n### Domain docs\n\nCustom domain guidance.\n\n## Other\n\nKeep other.\n';
    const files = [{ path: 'AGENTS.md',content: original }, { path: 'CLAUDE.md',content: 'Keep Claude exactly.\n' }];
    const rendered = renderEngineering(files,catalog.engineering,true); const agents = rendered.find(f => f.path === 'AGENTS.md')!.content;
    expect(agents).toContain('Custom guidance.'); expect(agents).toContain('Custom domain guidance.'); expect(agents).toContain('Keep other.');
    expect(agents.match(/^## Agent skills$/gm)).toHaveLength(1); expect(agents.match(/^### Domain docs$/gm)).toHaveLength(1);
    expect(rendered.find(f => f.path === 'CLAUDE.md')?.content).toBe('Keep Claude exactly.\n'); expect(rendered.some(f => f.path.endsWith('triage-labels.md'))).toBe(true);
    const second = renderEngineering(rendered.filter(f => !f.path.startsWith('docs/agents/')),catalog.engineering,true);
    expect(second.find(f => f.path === 'AGENTS.md')?.content).toBe(agents);
  });
  it('refuses missing mandatory resources, unsafe template files and duplicate Agent skills blocks', async () => {
    const directory = mkdtempSync(resolve('.cache/scaffold-resources-')); directories.push(directory);
    await expect(loadScaffoldCatalog(directory)).rejects.toMatchObject({ code: 'SCAFFOLD_RESOURCE_INVALID' });
    mkdirSync(join(directory,'engineering'));
    for (const name of ['issue-tracker','domain','triage-labels']) writeFileSync(join(directory,'engineering',`${name}.md`),'Resource');
    for (const path of ['../escape','.env','.agents/skills/copied.md','docs','docs/file.md']) {
      writeFileSync(join(directory,'catalog.v1.json'),JSON.stringify({ formatVersion: 1,id: 'factory.engineering',templates: [{ id: 'bad',label: 'Bad',files: [{ path,content: 'x' }, ...(path === 'docs' ? [{ path: 'docs/file.md',content: 'x' }] : [])] }] }));
      if (path !== 'docs/file.md') await expect(loadScaffoldCatalog(directory)).rejects.toMatchObject({ code: 'SCAFFOLD_RESOURCE_INVALID' });
    }
    expect(() => renderEngineering([{ path: 'AGENTS.md',content: '## Agent skills\n\n## Agent skills\n' }],['a','b','c'],false)).toThrow();
  });
});
