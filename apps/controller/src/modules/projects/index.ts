import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, open, realpath, stat, unlink } from 'node:fs/promises';
import { basename, isAbsolute, join, resolve, win32 } from 'node:path';
import { Value } from '@sinclair/typebox/value';
import {
  ConfigurationOptionsQuery, ConfigurationUpdate, NativeSelectionRequest, ProjectConfiguration, ProjectRegistration, SettingsUpdate, ToolOptions,
  ExecutionCatalog, GitHubSetupOptions, ProfileChanges, StorageTransitionCommand, type StorageTransitionCommand as StorageTransitionCommandValue,
  V3StatusMapping, type CatalogQuery, type ConfigurationOptions, type GlobalChanges, type OriginInspection,
  type OnboardingChanges, type SelectionCapabilities, type StoredExecutionProfile,
  type NativeSelectionResult,
} from '#contracts';
import { OperationError, type ConfigurationCommand, type Storage, type StoredOperation } from '../storage/index.js';
import type { GitHub } from '../github/index.js';
import type { Workspaces } from '../workspaces/index.js';
import { githubReference, validBranch } from '../workspaces/index.js';
import { ExecutionError, type Execution } from '../execution/index.js';
import { createToolDetector, type ManagedTool, type ToolDetector } from '../tools/index.js';
import { createQueue } from './queue.js';
import { matchesObservedV3StatusMapping } from './status-mapping.js';
export { createPreparations, type Preparations, type PreparationDependencies } from './preparations.js';
export { createProjectDeletions } from './project-deletions.js';
export { createDeletionCoordinator } from './deletion.js';
export { createProjectImports, supportsProjectImportGitHub, supportsProjectImportWorkspaces, type ProjectImports, type ProjectImportDependencies, type ProjectImportWorkspaces } from './project-imports.js';
export { createScaffold, type Scaffold, type ScaffoldDependencies } from './scaffold.js';
export { loadScaffoldCatalog as validateScaffoldResources } from './scaffold-resources.js';
export { interpretIssue } from '../pipeline/index.js';

export interface ProjectDependencies {
  storage: Storage;
  github: Pick<GitHub, 'getIdentity' | 'getProjectOwner' | 'listProjects' | 'getProject' | 'validateProjectSelection' | 'listProjectItems' | 'getIssueContextById'>;
  githubSetup?: Pick<GitHub, 'resolveExecutable' | 'validateExecutable' | 'activateExecutable' | 'getAuthenticationAccounts'>;
  execution?: Pick<Execution, 'getCatalog'> & Partial<Pick<Execution, 'preflight'>>;
  workspaces: Pick<Workspaces, 'inspectOrigin'> & Partial<Pick<Workspaces, 'listBranches' | 'inspectProjectStorageTransition' | 'moveProjectStorageTransition'>>;
  directoryBase: string;
  selectProjectsDirectory?: (signal?: AbortSignal) => Promise<string | null>;
  selectGitHubExecutable?: (signal?: AbortSignal) => Promise<string | null>;
  selectExecutable?: (signal?: AbortSignal) => Promise<string | null>;
  toolDetector?: ToolDetector;
}
export interface CommandContext { operationId: string; expectedRevision: string | undefined }
export { createQueue, QueueSummaryChanged, type Queue } from './queue.js';
function fail(status: 400 | 404 | 409 | 412 | 428 | 503, code: string, message: string): never { throw new OperationError(status, code, message); }
function rejectGitHubSource(source: ProjectRegistration['source'] | undefined): void {
  if (source?.kind === 'github') fail(400, 'SOURCE_KIND_UNSUPPORTED', 'Repositórios GitHub são cadastrados por URL, que clona para a Pasta do projeto. Informe uma pasta local.');
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const selectionCloseConfirmationMs = 5_000;
const selectionConflictMessage = 'Já existe uma seleção em andamento. Conclua ou cancele a janela aberta e tente novamente.';
interface ActiveSelection { diagnostic: string | null }

async function proveDirectoryWritable(directory: string): Promise<void> {
  const probePath = join(directory, `.nova-fabrica-write-probe-${randomUUID()}`);
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  let ownsProbe = false;
  let failure: unknown;
  try {
    handle = await open(probePath, 'wx', 0o600);
    ownsProbe = true;
    await handle.writeFile('Nova Fabrica write access probe', 'utf8');
    await handle.sync();
  } catch (error) {
    failure = error;
  } finally {
    if (handle) {
      try { await handle.close(); } catch (error) { failure ??= error; }
    }
    if (ownsProbe) {
      try { await unlink(probePath); } catch (error) { failure ??= error; }
    }
  }
  if (failure !== undefined) throw failure;
}

async function canonicalProjectsRoot(directoryBase: string, supplied: string): Promise<string> {
  if (!supplied.trim() || /[\x00-\x1f\x7f]/.test(supplied) || /^(?:\\\\|\/\/)/.test(supplied)) throw new Error('DIRECTORY_INVALID');
  const requested = resolve(directoryBase, supplied);
  const directory = await realpath(requested);
  const samePath = process.platform === 'win32'
    ? win32.resolve(requested).toLowerCase() === win32.resolve(directory).toLowerCase()
    : requested === directory;
  if (!samePath) throw new Error('DIRECTORY_INVALID');
  if (!isAbsolute(directory) || /^(?:\\\\|\/\/)/.test(directory) || !(await stat(directory)).isDirectory()) throw new Error('DIRECTORY_INVALID');
  await access(directory, constants.R_OK | constants.W_OK);
  await proveDirectoryWritable(directory);
  return directory;
}

async function readableProjectDirectory(supplied: string): Promise<string> {
  if (!isAbsolute(supplied) || /[\x00-\x1f\x7f]/.test(supplied) || /^(?:\\\\|\/\/)/.test(supplied)) throw new Error('DIRECTORY_INVALID');
  const directory = await realpath(supplied);
  if (!(await stat(directory)).isDirectory()) throw new Error('DIRECTORY_INVALID');
  await access(directory, constants.R_OK);
  return directory;
}

async function canonicalGitHubExecutable(supplied: string): Promise<string> {
  if (!isAbsolute(supplied) || /[\x00-\x1f\x7f]/.test(supplied) || basename(supplied).toLowerCase() !== 'gh.exe' || /^(?:\\\\|\/\/)/.test(supplied)) throw new Error('EXECUTABLE_INVALID');
  const executable = await realpath(supplied);
  if (!isAbsolute(executable) || /^(?:\\\\|\/\/)/.test(executable) || !(await stat(executable)).isFile()) throw new Error('EXECUTABLE_INVALID');
  await access(executable, constants.R_OK);
  return executable;
}
async function canonicalNativeExecutable(supplied: string): Promise<string> {
  if (!isAbsolute(supplied) || /[\x00-\x1f\x7f]/.test(supplied) || /^(?:\\\\|\/\/)/.test(supplied)) throw new Error('EXECUTABLE_INVALID');
  const executable = await realpath(supplied);
  if (!isAbsolute(executable) || /^(?:\\\\|\/\/)/.test(executable) || !(await stat(executable)).isFile()) throw new Error('EXECUTABLE_INVALID');
  await access(executable, constants.R_OK);
  return executable;
}
function precondition(actual: string, expected: string | undefined): void {
  if (expected === undefined) fail(428, 'PRECONDITION_REQUIRED', 'If-Match is required.');
  if (actual !== expected) fail(412, 'REVISION_CONFLICT', 'Configuration changed. Reload current data and reapply your draft.');
}
function receipt(operation: StoredOperation) {
  if (!operation.receipt || operation.state !== 'succeeded') return fail(503, 'OPERATION_NOT_DURABLE', 'The command could not be confirmed.');
  return operation.receipt;
}
export function validateProjectConfiguration(configuration: ProjectConfiguration): void {
  if (configuration.github_project && new Set(Object.values(configuration.github_project.status_option_ids)).size !== 5) {
    fail(400, 'STATUS_MAPPING_INVALID', 'A V3 Status mapping requires five distinct option IDs.');
  }
  if (!Value.Check(ProjectConfiguration, configuration)) fail(400, 'CONFIGURATION_INVALID', 'Project configuration is invalid.');
  if (configuration.delivery_branch && !validBranch(configuration.delivery_branch.name)) fail(400,'DELIVERY_BRANCH_INVALID','Informe um nome válido para a branch de destino.');
  if (configuration.default_delivery_mode === 'pr' && configuration.delivery_branch?.name === configuration.base_branch) fail(400,'PR_BRANCH_EQUALS_BASE','A branch entregue e a base do PR precisam ser diferentes.');
}
export function createProjects({ storage, github, githubSetup, execution, workspaces, directoryBase, selectProjectsDirectory, selectGitHubExecutable,
  selectExecutable, toolDetector = createToolDetector() }: ProjectDependencies) {
  const queue = createQueue({ storage, github, workspaces });
  const unavailableSelection = (target: string): SelectionCapabilities['projects_root'] => ({
    available: false,
    reason_code: 'NATIVE_SELECTION_UNAVAILABLE',
    reason: `A seleção nativa de ${target} não está disponível neste host.`,
    recovery: 'Inicie a fábrica pelo host que oferece a seleção nativa e consulte novamente.',
  });
  const selectionCapabilities: SelectionCapabilities = {
    projects_root: selectProjectsDirectory ? { available: true } : unavailableSelection('pasta'),
    gh_executable: selectGitHubExecutable ? { available: true } : unavailableSelection('GitHub CLI'),
  };
  function settingsView() {
    const editable = storage.getGlobalConfiguration();
    return { ...editable, view: { ...editable.view, selection_capabilities: selectionCapabilities } };
  }
  async function configurationView(projectId: string) {
    const editable = storage.getConfiguration(projectId);
    const baseStorage = storage.getProjectStorageView(projectId);
    let storageView = baseStorage;
    const location = baseStorage.locations.find(item => item.location_key === 'managed' && item.current);
    if (location && baseStorage.active_transition_operation_id === null) {
      try {
        storage.assertStorageTransitionQuiescent(projectId);
        const project = storage.getProject(projectId).view.project;
        if (!workspaces.inspectProjectStorageTransition) throw new Error('STORAGE_TRANSITION_UNAVAILABLE');
        const observed = await workspaces.inspectProjectStorageTransition(projectId, location.path, location.layout_version);
        const planHash = hash([project.id, project.revision, location.path, JSON.stringify(observed.source.object_identity),
          observed.destination_relative, location.location_key]);
        storageView = { ...baseStorage, transition_plan: { location_key: location.location_key, source_location_id: location.id,
          destination_relative: observed.destination_relative, plan_hash: planHash, capability: { available: true } } };
      } catch (error) {
        const reason = error instanceof Error && /^[A-Z0-9_]{1,128}$/.test(error.message) ? error.message : 'STORAGE_TRANSITION_UNAVAILABLE';
        storageView = { ...baseStorage, transition_plan: { location_key: location.location_key, source_location_id: location.id,
          destination_relative: `var/factory/projects/${projectId}/v${location.layout_version + 1}/managed`,
          plan_hash: hash([projectId, location.id, location.verified_at_ms, reason]),
          capability: { available: false, reason_code: reason, reason: 'A origem ou o destino não pôde ser conferido com segurança.',
            recovery: 'Confira a pasta gerenciada e consulte novamente antes de autorizar a transição.' } } };
      }
    }
    return { ...editable, view: { ...editable.view, storage: storageView, selection_capabilities: selectionCapabilities } };
  }
  let activeSelection: ActiveSelection | null = null;
  async function normalizedGlobals(changes: GlobalChanges): Promise<GlobalChanges> {
    const result = { ...changes };
    for (const key of ['projects_root'] as const) {
      const supplied = changes[key];
      if (supplied === undefined || supplied === null) continue;
      try {
        result[key] = await canonicalProjectsRoot(directoryBase, supplied);
      } catch (error) {
        if (error instanceof OperationError) throw error;
        fail(400, 'DIRECTORY_INVALID', 'The directory is unavailable or cannot be written.');
      }
    }
    return result;
  }
  async function selectSetting(input: NativeSelectionRequest, callerSignal?: AbortSignal): Promise<NativeSelectionResult> {
    if (!Value.Check(NativeSelectionRequest, input)) fail(400, 'NATIVE_SELECTION_INVALID', 'Choose a supported native selection.');
    if (activeSelection) throw new OperationError(409, activeSelection.diagnostic ?? 'NATIVE_SELECTION_IN_PROGRESS', selectionConflictMessage);
    const isDirectory = input.kind === 'projects_root' || input.kind === 'project_directory';
    const select = isDirectory ? selectProjectsDirectory : input.kind === 'gh_executable' ? selectGitHubExecutable : selectExecutable;
    if (!select) return { state: 'unavailable', kind: input.kind, diagnostic: 'NATIVE_SELECTION_UNAVAILABLE' };

    const controller = new AbortController();
    const current: ActiveSelection = { diagnostic: null };
    activeSelection = current;
    let cancellationDiagnostic: string | null = null;
    let closeConfirmationTimer: ReturnType<typeof setTimeout> | undefined;
    const abortSelection = (diagnostic: string) => {
      if (controller.signal.aborted) return;
      cancellationDiagnostic = diagnostic;
      current.diagnostic = diagnostic;
      controller.abort();
      closeConfirmationTimer = setTimeout(() => {
        if (activeSelection === current) current.diagnostic = 'NATIVE_SELECTION_CLOSE_UNCONFIRMED';
      }, selectionCloseConfirmationMs);
      closeConfirmationTimer.unref?.();
    };
    const onCallerAbort = () => abortSelection('NATIVE_SELECTION_CANCELLED');
    callerSignal?.addEventListener('abort', onCallerAbort, { once: true });
    if (callerSignal?.aborted) onCallerAbort();
    try {
      const candidate = await Promise.resolve().then(() => select(controller.signal));
      if (controller.signal.aborted) return { state: 'unavailable', kind: input.kind, diagnostic: cancellationDiagnostic ?? 'NATIVE_SELECTION_CANCELLED' };
      if (candidate === null) return { state: 'cancelled', kind: input.kind };
      try {
        let path = input.kind === 'project_directory'
          ? await readableProjectDirectory(candidate)
          : input.kind === 'projects_root'
          ? await canonicalProjectsRoot(directoryBase, candidate)
          : input.kind === 'gh_executable' ? await canonicalGitHubExecutable(candidate) : await canonicalNativeExecutable(candidate);
        if (input.kind === 'gh_executable') {
          if (!githubSetup) throw new Error('GITHUB_CONTEXT_UNAVAILABLE');
          const validated = await githubSetup.validateExecutable(path);
          if (validated.state !== 'observed') throw new Error('GITHUB_EXECUTABLE_UNAVAILABLE');
          path = validated.path;
        } else if (input.kind.endsWith('_executable')) {
          const tool = input.kind.slice(0, -11) as ManagedTool;
          const validated = await toolDetector.validate(path, tool);
          if (!validated) throw new Error('TOOL_EXECUTABLE_UNAVAILABLE');
          path = validated.path;
        }
        if (controller.signal.aborted) return { state: 'unavailable', kind: input.kind, diagnostic: cancellationDiagnostic ?? 'NATIVE_SELECTION_CANCELLED' };
        return { state: 'selected', kind: input.kind, path, observed_at_ms: Date.now() };
      } catch {
        return { state: 'unavailable', kind: input.kind, diagnostic: input.kind === 'project_directory' ? 'PROJECT_DIRECTORY_UNAVAILABLE' :
          input.kind === 'projects_root' ? 'PROJECTS_ROOT_UNAVAILABLE' : input.kind === 'gh_executable' ? 'GITHUB_EXECUTABLE_UNAVAILABLE' : 'TOOL_EXECUTABLE_UNAVAILABLE' };
      }
    } catch {
      return { state: 'unavailable', kind: input.kind, diagnostic: cancellationDiagnostic ?? 'NATIVE_SELECTION_FAILED' };
    } finally {
      if (closeConfirmationTimer) clearTimeout(closeConfirmationTimer);
      callerSignal?.removeEventListener('abort', onCallerAbort);
      if (activeSelection === current) activeSelection = null;
    }
  }
  async function inspect(source: ProjectRegistration['source'], baseBranch: string) {
    const observation: OriginInspection = await workspaces.inspectOrigin({ source: { kind: source.kind, location: source.location }, baseBranch });
    if (observation.state === 'invalid' || !observation.source) {
      if (observation.state === 'unavailable') fail(503, 'ORIGIN_UNAVAILABLE', 'Origin inspection requires the authorized host context.');
      fail(400, 'ORIGIN_INVALID', 'Origin or base branch is invalid.');
    }
    if (observation.state !== 'identified') fail(503, 'ORIGIN_UNAVAILABLE', 'Origin inspection could not finish.');
    if (observation.diagnostics.some((d) => d.code === 'BRANCH_INVALID') ||
      (observation.diagnostics.some((d) => d.code === 'BRANCH_NOT_FOUND') && !(observation.base && observation.remote?.confirmed && observation.remote.repository))) {
      fail(400, 'BASE_BRANCH_INVALID', 'Choose an existing local base branch.');
    }
    const remote = observation.remote;
    return { source: { ...observation.source, ...(remote?.confirmed && remote.repository ? { repository_id: remote.repository.id, repository_url: remote.repository.url } : {}) },
      notes: observation.diagnostics.map((d) => d.code).filter((code) => code !== 'PROJECT_REQUIRED') };
  }
  async function validateMapping(configuration: ProjectConfiguration): Promise<void> {
    const mapping = configuration.github_project;
    if (!mapping) return;
    const optionIds = mapping.status_option_ids;
    const statusOptionIds = V3StatusMapping.map(({ key }) => optionIds[key]);
    const result = await github.validateProjectSelection({ id: mapping.id, statusFieldId: mapping.status_field_id, statusOptionIds });
    if (result.state !== 'complete' || !result.data) {
      const invalid = result.diagnostics.some((d) => ['STATUS_FIELD_INACCESSIBLE', 'STATUS_OPTION_INACCESSIBLE', 'STATUS_MAPPING_INCOMPATIBLE', 'NOT_FOUND_OR_INACCESSIBLE'].includes(d.code));
      fail(invalid ? 400 : 503, invalid ? 'STATUS_MAPPING_INVALID' : 'GITHUB_VALIDATION_UNAVAILABLE', 'The exact Project and Status mapping could not be validated.');
    }
    if (!matchesObservedV3StatusMapping(mapping, result.data)) fail(400, 'STATUS_MAPPING_INVALID', 'The observed Status field does not match the five approved V3 options and their order.');
  }
  async function requireAutomationReadiness(configuration: ProjectConfiguration): Promise<void> {
    if (!configuration.source.repository_id) {
      throw new OperationError(409, 'REMOTE_UNCONFIRMED', 'Confirme um repositório GitHub para o projeto antes de habilitar a automação.',
        { affected_requirements: ['RF-15'], recovery: 'Configure um remoto GitHub acessível e confirme a identidade do repositório.' });
    }
    if (!configuration.github_project) {
      throw new OperationError(409, 'PROJECT_REQUIRED', 'Vincule um quadro GitHub válido antes de habilitar a automação.',
        { affected_requirements: ['RF-15'], recovery: 'Selecione o quadro do projeto, vincule o repositório e configure as cinco opções de Status V3.' });
    }
    const origin = await workspaces.inspectOrigin({ source: { kind: configuration.source.kind, location: configuration.source.location }, baseBranch: configuration.base_branch });
    const remoteConfirmed = origin.state === 'identified' && Boolean(origin.remote?.confirmed && origin.remote.repository &&
      origin.remote.repository.id === configuration.source.repository_id && !origin.remote.repository.isArchived);
    if (!remoteConfirmed) {
      throw new OperationError(409, 'REMOTE_UNCONFIRMED', 'O remoto GitHub não pôde ser confirmado para este projeto.',
        { affected_requirements: ['RF-15'], recovery: 'Confira a pasta, o remoto e o acesso ao repositório GitHub antes de habilitar a automação.' });
    }
    const published = Boolean(origin.base && (origin.base.observedFrom === 'local' || origin.remote?.branch && origin.base.branch === configuration.base_branch &&
      origin.remote.branch.name === configuration.base_branch && origin.remote.branch.repositoryId === configuration.source.repository_id &&
      origin.remote.branch.sha === origin.base.sha));
    if (!published) {
      throw new OperationError(409, 'CODE_NOT_PUBLISHED', 'O commit da branch-base ainda não está publicado e confirmado no GitHub.',
        { affected_requirements: ['RF-15'], recovery: 'Publique a branch-base configurada e confira se o commit remoto corresponde ao commit observado na origem.' });
    }
  }
  function settingsResponse(operation: StoredOperation, warnings?: Array<{ code: string; message: string }>) {
    return { ...settingsView(), operationId: operation.operation_id, receipt: receipt(operation), ...(warnings?.length ? { warnings } : {}) };
  }
  async function configurationResponse(projectId: string, operation: StoredOperation) {
    return { ...await configurationView(projectId), operationId: operation.operation_id, receipt: receipt(operation) };
  }
  async function getGitHubOptions(): Promise<GitHubSetupOptions> {
    const linkedAccount = storage.getLinkedGitHubAccount();
    const unavailableExecutable: GitHubSetupOptions['executable'] = { state: 'unavailable', path: null, version: null,
      diagnostics: [{ code: 'GITHUB_CONTEXT_UNAVAILABLE', message: 'O contexto autorizado do GitHub CLI não está disponível.', recovery: 'Inicie a fábrica no host autorizado e consulte novamente.' }] };
    const executable = githubSetup ? await githubSetup.resolveExecutable(storage.getGitHubExecutablePath()) : unavailableExecutable;
    const diagnostics = [...executable.diagnostics];
    const accounts: GitHubSetupOptions['accounts'] = [];
    let observedAccount: GitHubSetupOptions['observed_account'] = null;
    let retryAtMs: number | null = null;

    if (executable.state === 'observed') {
      const auth = githubSetup ? await githubSetup.getAuthenticationAccounts() : { state: 'unavailable' as const, accounts: [], diagnostics: [] };
      diagnostics.push(...auth.diagnostics);
      if (auth.state === 'observed') {
        const statuses = auth.accounts.slice(0, 100);
        const activeValid = statuses.filter(account => account.active && account.valid);
        if (statuses.some(account => !account.valid) && !auth.diagnostics.some(item => item.code === 'GITHUB_AUTH_NEEDS_ATTENTION')) {
          diagnostics.push({ code: 'GITHUB_AUTH_NEEDS_ATTENTION',
            message: 'Uma ou mais contas do GitHub CLI precisam de regularização.',
            recovery: 'Ative a conta ou regularize a autenticação no GitHub CLI fora da fábrica e consulte novamente.' });
        }
        if (statuses.some(account => !account.active)) {
          diagnostics.push({ code: 'GITHUB_INACTIVE_ACCOUNTS',
            message: 'Há contas de github.com inativas no GitHub CLI.',
            recovery: 'Ative a conta desejada no GitHub CLI fora da fábrica e consulte novamente.' });
        }
        let identity: Awaited<ReturnType<GitHub['getIdentity']>> | null = null;
        if (activeValid.length === 1) {
          identity = await github.getIdentity();
          retryAtMs = identity.retryAtMs;
          if (identity.state === 'complete' && identity.data) observedAccount = identity.data;
          else diagnostics.push(...identity.diagnostics.map(item => ({ code: item.code, message: item.message, recovery: item.recovery })));
        } else if (activeValid.length > 1) {
          diagnostics.push({ code: 'GITHUB_ACTIVE_ACCOUNT_AMBIGUOUS',
            message: 'O GitHub CLI reportou mais de uma conta ativa para github.com.',
            recovery: 'Confira e regularize a conta ativa no GitHub CLI fora da fábrica; consulte novamente.' });
        }

        for (const status of statuses) {
          const identityMatches = status.active && status.valid && identity?.state === 'complete' &&
            identity.data !== null && identity.data.login.toLowerCase() === status.login.toLowerCase();
          accounts.push({ id: identityMatches && identity?.data ? identity.data.id : status.login, login: status.login,
            active: status.active, valid: status.valid, eligible: status.active && status.valid && identityMatches });
          if (status.active && status.valid && identity?.state === 'complete' && !identityMatches) {
            diagnostics.push({ code: 'GITHUB_IDENTITY_MISMATCH',
              message: 'A identidade consultada não corresponde à conta ativa reportada pelo GitHub CLI.',
              recovery: 'Confira a conta ativa e consulte novamente antes de vinculá-la.' });
          }
          if (status.active && status.valid && identity && identity.state !== 'complete' && identity.diagnostics.length === 0) {
            diagnostics.push({ code: 'GITHUB_IDENTITY_UNAVAILABLE',
              message: 'A identidade da conta ativa não pôde ser confirmada.',
              recovery: 'Confira o contexto e a conectividade do GitHub CLI; consulte novamente.' });
          }
        }
      }
    }

    if (linkedAccount && observedAccount && linkedAccount.id !== observedAccount.id) {
      diagnostics.push({ code: 'GITHUB_ACCOUNT_MISMATCH',
        message: 'A conta vinculada difere da identidade ativa observada pelo GitHub CLI.',
        recovery: 'Revise os logins e use a ação explícita de vínculo ou troca de conta; esta consulta não altera a conta vinculada.' });
    }

    const result: GitHubSetupOptions = { executable, linked_account: linkedAccount, observed_account: observedAccount,
      accounts, diagnostics: diagnostics.slice(0, 100), retry_at_ms: retryAtMs };
    if (!Value.Check(GitHubSetupOptions, result)) fail(503, 'GITHUB_SETUP_RESULT_INVALID', 'GitHub setup options could not be projected.');
    return result;
  }
  async function getExecutionOptions(): Promise<ExecutionCatalog> {
    if (!execution) return { state: 'unavailable', observed_at_ms: Date.now(), diagnostics: [{ code: 'EXECUTION_UNAVAILABLE',
      message: 'O contexto do executor OMP não está disponível.', recovery: 'Inicie a fábrica no terminal-âncora autorizado e consulte novamente.' }] };
    let catalog: ExecutionCatalog;
    try { catalog = await execution.getCatalog(); }
    catch { return { state: 'unavailable', observed_at_ms: Date.now(), diagnostics: [{ code: 'OMP_CATALOG_UNAVAILABLE',
      message: 'A consulta local do catálogo OMP falhou.', recovery: 'Confira o executável e a configuração local do OMP; consulte novamente.' }] }; }
    if (!Value.Check(ExecutionCatalog, catalog)) return { state: 'unavailable', observed_at_ms: Date.now(), diagnostics: [{ code: 'OMP_CATALOG_INVALID',
      message: 'A observação do catálogo OMP está vazia, parcial ou incompatível.', recovery: 'Confira o runtime OMP antes de salvar perfis.' }] };
    return catalog;
  }
  async function getToolOptions(): Promise<ToolOptions> {
    const settings = storage.getGlobalConfiguration().view;
    const tools = await toolDetector.detect(settings.tool_preferences, storage.getGitHubExecutablePath());
    let connection: ToolOptions['maestri_connection'] = { state: 'not_checked', diagnostic: null };
    if (execution?.preflight) {
      try {
        const preflight = await execution.preflight();
        connection = preflight.ready ? { state: 'connected', diagnostic: null }
          : { state: 'unavailable', diagnostic: preflight.code ?? 'MAESTRI_CONNECTION_UNAVAILABLE' };
      } catch (error) { connection = { state: 'unavailable', diagnostic: error instanceof ExecutionError ? error.code : 'MAESTRI_CONNECTION_UNAVAILABLE' }; }
    }
    const result: ToolOptions = { tools, maestri_connection: connection, observed_at_ms: Date.now() };
    if (!Value.Check(ToolOptions, result)) fail(503, 'TOOL_OPTIONS_INVALID', 'Tool observations could not be projected.');
    return result;
  }
  async function validateProfileChanges(changes: ProfileChanges | undefined, profiles: readonly StoredExecutionProfile[]): Promise<void> {
    if (!changes?.length) return;
    const commandIds = changes.flatMap((command) => command.action === 'create' ? [] : [command.id]);
    if (new Set(commandIds).size !== commandIds.length) fail(400, 'PROFILE_DUPLICATED', 'A profile may only be edited once per command.');
    const candidates: Array<{ provider: string; model: string; effort: string | null; validateCombination: boolean }> = [];
    for (const command of changes) {
      if (command.action === 'delete') {
        if (!profiles.some((profile) => profile.id === command.id)) fail(404, 'PROFILE_NOT_FOUND', 'Profile not found.');
        continue;
      }
      if (command.action === 'create') {
        candidates.push({ ...command.profile, validateCombination: true });
        continue;
      }
      if (Object.keys(command.changes).length === 0) fail(400, 'PROFILE_PATCH_EMPTY', 'Profile updates require at least one changed field.');
      const current = profiles.find((profile) => profile.id === command.id);
      if (!current) fail(404, 'PROFILE_NOT_FOUND', 'Profile not found.');
      const combinationTouched = (['provider', 'model', 'effort'] as const).some((key) =>
        Object.prototype.hasOwnProperty.call(command.changes, key));
      if (combinationTouched) candidates.push({ ...current, ...command.changes, validateCombination: true });
    }
    if (candidates.length === 0) return;
    const catalog = await getExecutionOptions();
    if (catalog.state !== 'loaded') fail(503, 'OMP_CATALOG_UNAVAILABLE', 'The current OMP model catalog is unavailable.');
    for (const candidate of candidates) {
      if (!candidate.validateCombination) continue;
      const model = catalog.models.find((entry) => entry.provider === candidate.provider && entry.model === candidate.model);
      const effortValid = model && (model.efforts.length === 0
        ? candidate.effort === null
        : candidate.effort !== null && model.efforts.includes(candidate.effort));
      if (!model || !effortValid) fail(400, 'PROFILE_COMBINATION_INVALID', 'Choose an exact provider, model and applicable effort from the current OMP catalog.');
    }
  }
  function validateProfileSelections(configuration: ProjectConfiguration, profiles: readonly StoredExecutionProfile[], changes?: ProfileChanges): void {
    const types = new Map(profiles.map((profile) => [profile.id, profile.profile_type]));
    for (const change of changes ?? []) {
      if (change.action === 'update' && change.changes.profile_type !== undefined) types.set(change.id, change.changes.profile_type);
    }
    const sharedProfileId = configuration.implementer_profile_id !== null &&
      configuration.implementer_profile_id === configuration.reviewer_profile_id
      ? configuration.implementer_profile_id
      : null;
    for (const role of ['implementer', 'reviewer'] as const) {
      const profileId = configuration[`${role}_profile_id`];
      if (profileId === null) continue;
      const profileType = types.get(profileId);
      if (!profileType) {
        throw new OperationError(404, 'PROFILE_NOT_FOUND', 'O perfil de execução selecionado não está mais disponível.', {
          facts: { profile_id: profileId, expected_profile_type: role },
          affected_requirements: ['RF-77', 'RF-88'],
          recovery: 'Abra Configuração > Perfis, escolha um perfil ativo para este papel e salve novamente.',
        });
      }
      if (profileType !== role && profileId !== sharedProfileId) {
        throw new OperationError(409, 'PROFILE_TYPE_MISMATCH', 'O tipo do perfil selecionado não corresponde ao papel exigido.', {
          facts: { profile_id: profileId, expected_profile_type: role, actual_profile_type: profileType },
          affected_requirements: ['RF-77', 'RF-88'],
          recovery: 'Escolha um perfil do papel exigido e salve a configuração do projeto novamente.',
        });
      }
    }
  }
  return {
    listProjects: (query: CatalogQuery) => storage.listProjects(query),
    getProject: (id: string) => storage.getProject(id),
    getSettings: settingsView,
    async validateProjectsRoot(): Promise<void> {
      const current = storage.getGlobalConfiguration().view.settings.projects_root;
      if (current === null) fail(409, 'PROJECTS_ROOT_REQUIRED', 'A pasta dos projetos não está configurada.');
      let canonical: string;
      try { canonical = await canonicalProjectsRoot(directoryBase, current); }
      catch {
        throw new OperationError(409, 'PROJECTS_ROOT_UNAVAILABLE', 'A pasta dos projetos não está acessível para leitura e gravação.');
      }
      if (canonical !== current) fail(409, 'PROJECTS_ROOT_CHANGED', 'A pasta dos projetos mudou desde a confirmação.');
    },
    getGitHubOptions,
    getExecutionOptions,
    getToolOptions,
    selectSetting,
    getConfiguration: configurationView,
    async transitionStorage(projectId: string, body: StorageTransitionCommandValue, context: CommandContext) {
      if (!Value.Check(StorageTransitionCommand, body)) fail(400, 'STORAGE_TRANSITION_INVALID', 'A autorização de transição é inválida.');
      const prior = storage.getStorageTransition(context.operationId);
      let input;
      if (prior) {
        input = { operationId: context.operationId, projectId, expectedRevision: context.expectedRevision, command: body,
          destinationRelative: prior.destination_relative, sourceIdentity: prior.source_identity };
      } else {
        const current = await configurationView(projectId);
        const plan = current.view.storage.transition_plan;
        if (!plan || !plan.capability.available) throw new OperationError(409, 'STORAGE_TRANSITION_UNAVAILABLE',
          'O plano de transição não está disponível para confirmação.', { recovery: plan?.capability.recovery ?? 'Consulte novamente a configuração do projeto.' });
        if (body.location_key !== plan.location_key || body.source_location_id !== plan.source_location_id || body.plan_hash !== plan.plan_hash) {
          throw new OperationError(409, 'STORAGE_TRANSITION_PLAN_CHANGED', 'O plano exibido não é mais o plano vigente.', {
            affected_requirements: ['RF-67','RF-68'], recovery: 'Consulte novamente a configuração do projeto antes de confirmar.' });
        }
        const location = current.view.storage.locations.find(item => item.id === plan.source_location_id);
        if (!location) throw new OperationError(409, 'STORAGE_TRANSITION_SOURCE_CHANGED', 'A origem não está mais registrada como localização corrente.');
        if (!workspaces.inspectProjectStorageTransition || !workspaces.moveProjectStorageTransition) throw new OperationError(503, 'STORAGE_TRANSITION_UNAVAILABLE', 'A capacidade local de transição não está disponível.');
        const observed = await workspaces.inspectProjectStorageTransition(projectId, location.path, location.layout_version);
        const project = storage.getProject(projectId).view.project;
        if (observed.destination_relative !== plan.destination_relative || hash([project.id, project.revision,
            location.path, JSON.stringify(observed.source.object_identity), observed.destination_relative, location.location_key]) !== plan.plan_hash) {
          throw new OperationError(409, 'STORAGE_TRANSITION_PLAN_CHANGED', 'A origem, revisão ou destino mudou durante a confirmação.');
        }
        input = { operationId: context.operationId, projectId, expectedRevision: context.expectedRevision, command: body,
          destinationRelative: observed.destination_relative, sourceIdentity: observed.source.object_identity };
      }
      let operation = storage.acceptStorageTransition(input);
      let transition = storage.getStorageTransition(context.operationId);
      if (!transition) throw new Error('PROJECT_STORAGE_TRANSITION_DATA_INVALID');
      if (transition.state === 'verified') return operation;
      transition = storage.claimStorageTransition(context.operationId);
      if (transition.state === 'verified') return storage.getOperation(context.operationId) ?? operation;
      const generation = transition.generation;
      try {
        storage.assertStorageTransitionQuiescent(projectId);
        if (!workspaces.moveProjectStorageTransition) throw new Error('STORAGE_TRANSITION_UNAVAILABLE');
        const stepOrder = ['planned','quiescence_checked','moving','verifying','publishing_location'] as const;
        let stepIndex = stepOrder.indexOf(transition.step);
        if (stepIndex < 1) { storage.advanceStorageTransition(context.operationId, generation, 'quiescence_checked', 'running', null); stepIndex = 1; }
        if (stepIndex < 2) { storage.advanceStorageTransition(context.operationId, generation, 'moving', 'running', null); stepIndex = 2; }
        const destination = await workspaces.moveProjectStorageTransition({ project_id: projectId,
          source_relative: transition.source_relative, destination_relative: transition.destination_relative, source_identity: transition.source_identity });
        if (transition.destination_identity && JSON.stringify(transition.destination_identity) !== JSON.stringify(destination.object_identity)) {
          throw new OperationError(409, 'STORAGE_TRANSITION_DESTINATION_CHANGED', 'A identidade do destino mudou durante a retomada.');
        }
        if (stepIndex < 3) { storage.advanceStorageTransition(context.operationId, generation, 'verifying', 'running', null, destination.object_identity); stepIndex = 3; }
        if (stepIndex < 4) storage.advanceStorageTransition(context.operationId, generation, 'publishing_location', 'running', null, destination.object_identity);
        storage.completeStorageTransition(context.operationId, generation, destination.object_identity);
      } catch (error) {
        const reason = error instanceof Error && /^[A-Z0-9_]{1,128}$/.test(error.message) ? error.message : 'STORAGE_TRANSITION_INTERRUPTED';
        const current = storage.getStorageTransition(context.operationId);
        if (current && current.state !== 'verified') {
          try { storage.advanceStorageTransition(context.operationId, generation, current.step, 'uncertain', reason); }
          catch (fenceError) {
            if (!(fenceError instanceof OperationError && fenceError.code === 'STORAGE_TRANSITION_GENERATION_STALE')) throw fenceError;
          }
        }
      }
      operation = storage.getOperation(context.operationId) ?? operation;
      return operation;
    },
    getQueue: queue.read,
    observeQueue: queue.observe,
    revalidateQueueForDispatch: queue.revalidateForDispatch,
    listBranches: (source: import('#contracts').OriginSource) => workspaces.listBranches?.(source) ?? Promise.resolve({branches:[],state:'unavailable' as const,message:'A consulta de branches não está disponível neste host.'}),
    saveQueue: queue.save,
    async registerProject(body: ProjectRegistration, context: CommandContext) {
      if (!Value.Check(ProjectRegistration, body)) fail(400, 'REGISTRATION_INVALID', 'Project registration is invalid.');
      rejectGitHubSource(body.source);
      const command: ConfigurationCommand = { ...context, kind: 'project.register', body };
      let operation = storage.recoverConfigurationCommand(command);
      if (!operation) {
        const origin = await inspect(body.source, body.base_branch);
        operation = storage.registerProject({ ...context, body, source: origin.source, originNotes: origin.notes });
      }
      receipt(operation);
      return { ...storage.getProject(operation.resource.id), operationId: operation.operation_id };
    },
    async saveSettings(body: SettingsUpdate, context: CommandContext) {
      if (!Value.Check(SettingsUpdate, body)) fail(400, 'SETTINGS_INVALID', 'Settings changes are invalid.');
      const accountBinding = body.account_binding;
      const onboardingChanges: OnboardingChanges | undefined = body.onboarding_changes;
      const command: ConfigurationCommand = accountBinding
        ? { ...context, kind: accountBinding.action === 'bind' ? 'settings.account.bind' : 'settings.account.switch', body }
        : onboardingChanges
          ? { ...context, kind: 'settings.onboarding.update', body }
          : { ...context, kind: 'settings.update', body };
      const recovered = storage.recoverConfigurationCommand(command);
      if (recovered) {
        const warnings = accountBinding?.action === 'switch' && storage.hasUncertainAccountCleanup(recovered.operation_id)
          ? [{ code: 'PRIOR_ACCOUNT_CLEANUP_UNCERTAIN', message: 'Recursos de tentativas encerradas da conta anterior ainda têm parada ou limpeza incerta e permanecem no contexto de origem.' }]
          : undefined;
        return settingsResponse(recovered, warnings);
      }
      precondition(storage.getGlobalConfiguration().etag, context.expectedRevision);
      if (onboardingChanges) {
        if (Object.keys(body.changes).length > 0 || body.profile_changes !== undefined || body.gh_executable_path !== undefined || accountBinding !== undefined || body.tool_preferences !== undefined) {
          fail(400, 'SETTINGS_COMMAND_INVALID', 'Onboarding changes must be the only settings command.');
        }
        const current = storage.getGlobalConfiguration();
        precondition(current.etag, context.expectedRevision);
        let onboardingValidation: { accountId: string; projectsRoot: string } | undefined;
        if (onboardingChanges.complete === true && current.view.onboarding.completed_at_ms === null) {
          const { settings, profile_counts: counts, onboarding } = current.view;
          if (counts.implementer === 0 || counts.reviewer === 0) {
            throw new OperationError(409, 'ONBOARDING_PROFILES_REQUIRED', 'Crie pelo menos um perfil Implementador e um perfil Revisor antes de concluir.', {
              facts: { implementer_profiles: counts.implementer, reviewer_profiles: counts.reviewer },
              affected_requirements: ['RF-23', 'RF-24'],
              recovery: 'Abra Configuração > Perfis, crie os dois tipos e tente novamente.',
            });
          }
          if (settings.account_id === null) {
            throw new OperationError(409, 'ONBOARDING_ACCOUNT_REQUIRED', 'Vincule e valide uma conta GitHub antes de concluir.', {
              affected_requirements: ['RF-23'], recovery: 'Abra Configuração > GitHub, vincule a conta elegível e tente novamente.',
            });
          }
          if (settings.projects_root === null || onboarding.first_incomplete_step === 'projects_root') {
            throw new OperationError(409, 'ONBOARDING_PROJECTS_ROOT_REQUIRED', 'Confirme uma pasta dos projetos com acesso e gravação antes de concluir.', {
              affected_requirements: ['RF-23'], recovery: 'Abra Configuração, escolha novamente a pasta dos projetos e salve a confirmação.',
            });
          }
          if (!githubSetup) throw new OperationError(503, 'ACCOUNT_REVALIDATION_UNAVAILABLE', 'A conta GitHub vinculada não pôde ser revalidada no host autorizado.');
          const options = await getGitHubOptions();
          const account = options.accounts.find(candidate => candidate.id === settings.account_id && candidate.active && candidate.valid && candidate.eligible);
          if (options.executable.state !== 'observed' || options.diagnostics.some(item =>
            ['GITHUB_CONTEXT_UNAVAILABLE', 'GITHUB_AUTH_STATUS_UNAVAILABLE', 'GITHUB_AUTH_RESPONSE_INVALID', 'AUTHENTICATION_INVALID',
              'CONTEXT_UNAVAILABLE', 'CLI_UNAVAILABLE', 'QUERY_FAILED', 'RESPONSE_INVALID', 'RATE_LIMITED', 'GITHUB_IDENTITY_UNAVAILABLE'].includes(item.code))) {
            throw new OperationError(503, 'ACCOUNT_REVALIDATION_UNAVAILABLE', 'A conta GitHub vinculada não pôde ser revalidada no host autorizado.');
          }
          if (!account || options.observed_account?.id !== settings.account_id) {
            throw new OperationError(409, 'ONBOARDING_ACCOUNT_MISMATCH', 'A conta observada não corresponde à conta vinculada.', {
              affected_requirements: ['RF-23'], recovery: 'Confira a conta ativa no GitHub CLI e vincule a conta observada pela fábrica.',
            });
          }
          let verifiedRoot: string;
          try { verifiedRoot = await canonicalProjectsRoot(directoryBase, settings.projects_root); }
          catch {
            throw new OperationError(409, 'ONBOARDING_PROJECTS_ROOT_INVALID', 'A pasta dos projetos não está mais acessível para leitura e gravação.', {
              affected_requirements: ['RF-23'], recovery: 'Abra Configuração, escolha uma pasta acessível e confirme novamente.',
            });
          }
          if (verifiedRoot !== settings.projects_root) {
            throw new OperationError(409, 'ONBOARDING_PROJECTS_ROOT_CHANGED', 'A pasta dos projetos mudou desde a última confirmação.', {
              affected_requirements: ['RF-23'], recovery: 'Confirme novamente a pasta atual antes de concluir.',
            });
          }
          const latest = storage.getGlobalConfiguration();
          precondition(latest.etag, context.expectedRevision);
          if (latest.view.settings.account_id !== settings.account_id || latest.view.settings.projects_root !== settings.projects_root ||
            latest.view.onboarding.completed_at_ms !== null || latest.view.profile_counts.implementer === 0 || latest.view.profile_counts.reviewer === 0) {
            throw new OperationError(412, 'ONBOARDING_CONTEXT_CHANGED', 'A configuração inicial mudou durante a validação. Releia as definições e tente novamente.');
          }
          onboardingValidation = { accountId: settings.account_id, projectsRoot: verifiedRoot };
        }
        return settingsResponse(storage.saveSettings({ ...context, body, changes: {}, ...(onboardingValidation ? { onboardingValidation } : {}) }));
      }
      if (accountBinding) {
        if (Object.keys(body.changes).length > 0 || body.profile_changes !== undefined || body.gh_executable_path !== undefined || body.onboarding_changes !== undefined || body.tool_preferences !== undefined) {
          fail(400, 'SETTINGS_COMMAND_INVALID', 'Account binding must be the only settings command.');
        }
        if (!githubSetup) throw new OperationError(503, 'GITHUB_CONTEXT_UNAVAILABLE', 'The authorized GitHub host context is unavailable.');
        const options = await getGitHubOptions();
        if (options.executable.state !== 'observed' || options.diagnostics.some(item =>
          ['GITHUB_CONTEXT_UNAVAILABLE', 'GITHUB_AUTH_STATUS_UNAVAILABLE', 'GITHUB_AUTH_RESPONSE_INVALID', 'AUTHENTICATION_INVALID',
            'CONTEXT_UNAVAILABLE', 'CLI_UNAVAILABLE', 'QUERY_FAILED', 'RESPONSE_INVALID', 'RATE_LIMITED', 'GITHUB_IDENTITY_UNAVAILABLE'].includes(item.code))) {
          throw new OperationError(503, 'ACCOUNT_REVALIDATION_UNAVAILABLE', 'The active GitHub account could not be revalidated.');
        }
        const observed = options.observed_account;
        const eligible = options.accounts.find(account => account.id === accountBinding.account_id && account.active && account.valid && account.eligible);
        if (!observed || observed.id !== accountBinding.account_id || !eligible) {
          throw new OperationError(409, 'ACCOUNT_NOT_ELIGIBLE', 'Select the currently active, valid GitHub account observed by the authorized CLI.');
        }
        const operation = storage.saveSettings({ ...context, body, changes: {}, account: observed });
        const warnings = accountBinding.action === 'switch' && storage.hasUncertainAccountCleanup(operation.operation_id)
          ? [{ code: 'PRIOR_ACCOUNT_CLEANUP_UNCERTAIN', message: 'Recursos de tentativas encerradas da conta anterior ainda têm parada ou limpeza incerta e permanecem no contexto de origem.' }]
          : undefined;
        return settingsResponse(operation, warnings);
      }
      if (body.gh_executable_path !== undefined) {
        if (Object.keys(body.changes).length > 0 || (body.profile_changes?.length ?? 0) > 0 || body.onboarding_changes !== undefined || body.tool_preferences !== undefined) {
          fail(400, 'SETTINGS_COMMAND_INVALID', 'Save the GitHub executable as a separate settings command.');
        }
        if (!githubSetup) throw new OperationError(503, 'GITHUB_CONTEXT_UNAVAILABLE', 'The authorized GitHub host context is unavailable.');
        const validated = await githubSetup.validateExecutable(body.gh_executable_path);
        if (validated.state !== 'observed') {
          const code = validated.diagnostics[0]?.code === 'GITHUB_CONTEXT_UNAVAILABLE' ? 503 : 400;
          throw new OperationError(code, 'GH_EXECUTABLE_INVALID', 'The selected GitHub CLI executable could not be validated.');
        }
        const operation = storage.saveSettings({ ...context, body, changes: {} });
        githubSetup.activateExecutable(validated);
        return settingsResponse(operation);
      }
      if (body.tool_preferences !== undefined) {
        if (Object.keys(body.changes).length > 0 || body.profile_changes !== undefined || body.onboarding_changes !== undefined || accountBinding !== undefined) {
          fail(400, 'SETTINGS_COMMAND_INVALID', 'Tool preferences must be saved as an isolated settings command.');
        }
        const currentPreferences = storage.getGlobalConfiguration().view.tool_preferences;
        const changedPaths: Partial<Record<ManagedTool, string | null>> = {};
        for (const tool of ['git', 'maestri', 'omp', 'powershell'] as const) {
          if (body.tool_preferences[tool].preferred_path !== currentPreferences[tool].preferred_path) {
            changedPaths[tool] = body.tool_preferences[tool].preferred_path;
          }
        }
        let preferences: SettingsUpdate['tool_preferences'];
        try {
          preferences = await toolDetector.stamp(currentPreferences, changedPaths);
        } catch {
          throw new OperationError(400, 'TOOL_PREFERENCE_INVALID', 'Uma ou mais ferramentas selecionadas não passaram pela validação local.');
        }
        const normalizedBody: SettingsUpdate = { ...body, tool_preferences: preferences };
        return settingsResponse(storage.saveSettings({ ...context, body: normalizedBody, changes: {} }));
      }
      const changes = await normalizedGlobals(body.changes);
      await validateProfileChanges(body.profile_changes, storage.getGlobalConfiguration().view.profiles);
      return settingsResponse(storage.saveSettings({ ...context, body, changes }));
    },
    async saveConfiguration(projectId: string, body: ConfigurationUpdate, context: CommandContext) {
      if (!Value.Check(ConfigurationUpdate, body)) fail(400, 'CONFIGURATION_INVALID', 'Configuration changes are invalid.');
      rejectGitHubSource(body.project_changes.source);
      const command: ConfigurationCommand = { ...context, kind: 'project.configuration.update', projectId, body };
      const recovered = storage.recoverConfigurationCommand(command);
      if (recovered) return await configurationResponse(projectId, recovered);
      const current = storage.getConfiguration(projectId);
      const deletion = current.view.prerequisites.find(item => item.code === 'PROJECT_DELETION_PENDING');
      if (deletion) throw new OperationError(409, deletion.code, deletion.message, { recovery: deletion.recovery });
      if (current.view.configuration_lock) throw new OperationError(409, 'PROJECT_CONFIGURATION_LOCKED', 'Este projeto tem uma tentativa ou publicação em andamento. Aguarde a conclusão ou cancele a tentativa e aguarde a confirmação da parada para alterar as configurações.');
      precondition(current.etag, context.expectedRevision);
      await validateProfileChanges(body.profile_changes, current.view.profiles);
      const previous = current.view.configuration;
      let configuration: ProjectConfiguration = { ...previous, ...body.project_changes,
        queue_order: { ...previous.queue_order, ...body.project_changes.queue_order } };
      // Remove revision metadata before schema validation and the immutable insert.
      const { id: _id, project_id: _project, revision: _revision, created_at_ms: _created, ...fields } = { ...previous, ...configuration };
      configuration = fields;
      validateProfileSelections(configuration, current.view.profiles, body.profile_changes);
      let originNotes: readonly string[] | undefined;
      if (body.project_changes.source !== undefined || body.project_changes.base_branch !== undefined) {
        const observed = await inspect(configuration.source, configuration.base_branch);
        const knownRepository = previous.source.repository_id;
        if (body.project_changes.source !== undefined && knownRepository && observed.source.repository_id !== knownRepository) {
          const reference = previous.source.repository_url ? githubReference(previous.source.repository_url) : null;
          fail(409, 'PROJECT_FOLDER_NOT_CLONE', `Não é clone de ${reference ? `${reference.owner}/${reference.name}` : 'este repositório'}.`);
        }
        configuration.source = observed.source; originNotes = observed.notes;
      }
      validateProjectConfiguration(configuration);
      await validateMapping(configuration);
      if (!previous.automation_enabled && configuration.automation_enabled) await requireAutomationReadiness(configuration);
      const globalChanges = await normalizedGlobals(body.global_changes ?? {});
      const operation = storage.saveConfiguration({ ...context, projectId, body, configuration, globalChanges, ...(originNotes ? { originNotes } : {}) });
      return await configurationResponse(projectId, operation);
    },
    async getConfigurationOptions(projectId: string, query: ConfigurationOptionsQuery): Promise<ConfigurationOptions> {
      if (!Value.Check(ConfigurationOptionsQuery, query)) fail(400, 'OPTIONS_QUERY_INVALID', 'Configuration options query is invalid.');
      const current = storage.getConfiguration(projectId);
      const mapping = current.view.configuration.github_project;
      const diagnostics: ConfigurationOptions['diagnostics'] = [];
      const identity = await github.getIdentity();
      diagnostics.push(...identity.diagnostics);
      const selectedProjectId = query.github_project_id ?? mapping?.id;
      const details = selectedProjectId ? await github.getProject(selectedProjectId) : null;
      if (details) diagnostics.push(...details.diagnostics);
      const ownerId = query.owner_id ?? details?.data?.project.owner.id ?? mapping?.owner_id ?? identity.data?.id;
      const owner = ownerId ? await github.getProjectOwner(ownerId) : null;
      if (owner) diagnostics.push(...owner.diagnostics);
      if (query.owner_kind && owner?.data && query.owner_kind !== owner.data.kind) fail(400, 'OWNER_KIND_INVALID', 'The selected owner kind does not match its identity.');
      const listing = owner?.state === 'complete' && owner.data ? await github.listProjects({ login: owner.data.login, kind: owner.data.kind }) : null;
      if (listing) diagnostics.push(...listing.diagnostics);
      if (details?.data && details.data.project.owner.id !== ownerId) fail(400, 'PROJECT_OWNER_MISMATCH', 'The requested Project belongs to a different owner.');
      const projects = [...(listing?.data ?? [])].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      const scope = hash([projectId, current.etag, ownerId ?? null, selectedProjectId ?? null, query.status_field_id ?? null, projects]);
      let offset = 0;
      if (query.cursor) {
        let c: unknown;
        try { c = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')) as unknown; } catch { fail(400, 'CURSOR_INVALID', 'Options cursor is invalid.'); }
        if (!c || typeof c !== 'object' || !('scope' in c) || c.scope !== scope || !('offset' in c) || typeof c.offset !== 'number' || !Number.isSafeInteger(c.offset) || c.offset < 0 || c.offset >= projects.length) fail(409, 'OPTIONS_CHANGED', 'Configuration options changed. Reload the first page.');
        offset = c.offset;
      }
      const limit = Number(query.limit ?? '25'); const hasMore = offset + limit < projects.length;
      const complete = identity.state === 'complete' && owner?.state === 'complete' && listing?.state === 'complete' && (!details || details.state === 'complete');
      const statusFields = details?.data?.singleSelectFields ?? [];
      return { projects: { items: projects.slice(offset, offset + limit), has_more: hasMore, next_cursor: hasMore ? Buffer.from(JSON.stringify({ scope, offset: offset + limit })).toString('base64url') : null, event_cursor: current.view.event_cursor },
        status_fields: statusFields, status_options: statusFields.find((field) => field.id === (query.status_field_id ?? mapping?.status_field_id))?.options ?? [],
        profiles: current.view.profiles, completeness: complete ? 'complete' : listing?.data ? 'partial' : 'unavailable', diagnostics,
        retry_at_ms: [identity.retryAtMs, owner?.retryAtMs, listing?.retryAtMs, details?.retryAtMs].reduce<number | null>((max, n) => n === null || n === undefined ? max : Math.max(max ?? 0, n), null) };
    },
  };
}
export type Projects = ReturnType<typeof createProjects>;
