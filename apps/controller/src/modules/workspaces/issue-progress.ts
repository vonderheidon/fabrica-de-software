import { randomUUID } from 'node:crypto';
import { lstat, open, realpath, rename, unlink } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';

const maxProgressBytes = 64 * 1024;
const markerPrefix = '<!-- nova-fabrica-issue-progress:v1 ';
const milestoneLabels = {
  workspace_ready: 'Workspace da issue preparado',
  workspace_failed: 'Preparação do workspace interrompida',
  implementer_result: 'Resultado do Implementador registrado',
  validation_blocked: 'Validação bloqueada',
  delivery_captured: 'Versão de trabalho capturada',
  capture_failed: 'Captura da versão falhou',
  review_started: 'Revisão independente iniciada',
  review_result: 'Resultado da revisão registrado',
  correction_started: 'Correção iniciada',
  human_decision: 'Decisão humana registrada',
  question_answered: 'Pergunta respondida; conteúdo omitido',
  dispatch_failed: 'Inicialização da tentativa falhou',
  attempt_cancelled: 'Tentativa cancelada no controlador',
} as const;

export type IssueProgressMilestone = keyof typeof milestoneLabels;

export interface IssueProgressIdentity {
  projectId: string;
  repositoryId: string;
  issueId: string;
}

export interface IssueProgressRound {
  round: number;
  deliveryId: string;
  producerPassageId: string;
  producerReceiptId: string | null;
  reviewId: string | null;
  reviewState: 'pending' | 'approved' | 'rejected' | null;
  reviewIndependence: 'pending' | 'valid' | 'invalid' | null;
  contentIdentity: string | null;
  commitSha: string | null;
  checkCount: number | null;
  criteria: { passed: number; failed: number; notVerified: number } | null;
  blockingFindings: number | null;
}

export interface IssueProgressPredecessor {
  attemptId: string;
  predecessorAttemptId: string | null;
  result: string | null;
  phase: string;
  suspension: string | null;
  deliveryId: string | null;
  contentIdentity: string | null;
  reviewState: 'pending' | 'approved' | 'rejected' | null;
  blockingFindings: number;
}

export interface IssueProgressDecision {
  id: string;
  operationId: string;
  action: 'guidance' | 'change_profile' | 'end';
  createdAtMs: number;
}

export interface IssueProgressDocument {
  identity: IssueProgressIdentity;
  issueNumber: number;
  issueTitle: string;
  updatedAtMs: number;
  milestone: IssueProgressMilestone;
  attempt: {
    id: string;
    passageId: string;
    predecessorAttemptId: string | null;
    round: number;
    phase: string;
    result: string | null;
    suspension: string | null;
  };
  workspace: {
    initialState: 'base_checkout' | 'inherited_attempt' | 'pending_inherited_attempt';
    sourceAttemptId: string | null;
    initialContentIdentity: string | null;
    comparisonBaseSha: string | null;
  };
  rounds: IssueProgressRound[];
  blockingFindings: number;
  predecessor: IssueProgressPredecessor | null;
  decisions: IssueProgressDecision[];
}

export class IssueProgressError extends Error {
  constructor(readonly code: string) { super(code); }
}

const inline = (value: string) => String.fromCharCode(96) + value + String.fromCharCode(96);
const escapeText = (value: string) => value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  .slice(0, 256).replace(/(?:\b(?:bearer|token|secret|password|credential|api[_-]?key)\s*[:=]\s*\S+|\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})\b)/gi, '[redigido]')
  .replace(/[\\\u0060*_{}\[\]()#+.!|>]/g, '\\$&');
const listValue = (value: string | null) => value === null ? 'Ainda não registrado' : inline(value);

function nextStep(document: IssueProgressDocument): string {
  const { result, suspension, phase } = document.attempt;
  if (suspension) return 'Confira o impedimento registrado e compare este resumo com o workspace e o estado do controlador antes de decidir como continuar.';
  if (result === 'delivered') return 'Confira a versão aprovada e os efeitos de entrega registrados antes de encerrar o trabalho da issue.';
  if (result === 'rejected') return 'Confira os achados e as evidências da revisão antes de preparar uma nova correção.';
  if (result === 'failed' || result === 'cancelled' || result === 'interrupted') {
    return 'Confira o estado real dos arquivos e dos processos antes de decidir se uma nova tentativa deve continuar o trabalho.';
  }
  if (phase === 'preparing') return 'Conclua a preparação e confira se o snapshot inicial corresponde ao conteúdo atual do workspace.';
  if (phase === 'implementing') return 'Continue a implementação no workspace compartilhado e registre os checks e evidências na entrega.';
  if (phase === 'verifying') return 'Confira os checks registrados para a versão desta rodada.';
  if (phase === 'reviewing') return 'Conclua a revisão independente da versão capturada nesta rodada.';
  if (phase === 'publishing') return 'Confira e reconcilie os efeitos de publicação ainda pendentes.';
  return 'Consulte o estado atual no controlador e confira este resumo contra os arquivos antes de agir.';
}

export function renderIssueProgress(document: IssueProgressDocument): string {
  if (!Number.isSafeInteger(document.issueNumber) || document.issueNumber < 1 ||
      !Number.isSafeInteger(document.updatedAtMs) || document.updatedAtMs < 0 ||
      !milestoneLabels[document.milestone] || document.rounds.length > 6 || document.decisions.length > 20) {
    throw new IssueProgressError('ISSUE_PROGRESS_DATA_INVALID');
  }
  const identity = JSON.stringify({ ...document.identity, issueNumber: document.issueNumber });
  const title = escapeText(document.issueTitle) || 'Título indisponível';
  const rounds = document.rounds.map(round => {
    const validation = round.criteria === null ? 'Aguardando resultado de validação.'
      : 'Critérios reportados: ' + round.criteria.passed + ' aprovados, ' + round.criteria.failed +
        ' reprovados e ' + round.criteria.notVerified + ' não verificados; checks reportados: ' + (round.checkCount ?? 0) + '.';
    const review = round.reviewId === null ? 'Ainda não revisada.'
      : 'Revisão ' + inline(round.reviewId) + ': ' + (round.reviewState ?? 'pendente') +
        '; independência ' + (round.reviewIndependence ?? 'pendente') + '.';
    const implementation = round.producerReceiptId === null ? 'Resultado do Implementador ainda não registrado.'
      : 'Resultado ' + inline(round.producerReceiptId) + ' associado à passagem ' + inline(round.producerPassageId) + '.';
    const version = round.commitSha === null ? 'Versão capturada: ainda não disponível.'
      : 'Versão capturada: commit ' + inline(round.commitSha) + ', conteúdo ' + inline(round.contentIdentity ?? 'indisponível') + '.';
    const findings = round.blockingFindings === null ? '' : ' Achados bloqueantes em aberto: ' + round.blockingFindings + '.';
    return '### Rodada ' + round.round + '\n- Implementado: ' + implementation + '\n- Validado: ' + validation +
      ' Evidência no controlador: entrega ' + inline(round.deliveryId) + '.' + findings + '\n- Revisado: ' + review + ' ' + version;
  });
  const decisions = document.decisions.length
    ? document.decisions.map(item => '- ' + item.action + ': operação ' + inline(item.operationId) +
      ', decisão ' + inline(item.id) + ' (' + new Date(item.createdAtMs).toISOString() + ').')
    : ['- Nenhuma decisão humana registrada nesta tentativa.'];
  const predecessor = document.predecessor
    ? ['- Tentativa anterior: ' + inline(document.predecessor.attemptId) + '; predecessora dela: ' + listValue(document.predecessor.predecessorAttemptId) + '.',
      '- Estado registrado: fase ' + document.predecessor.phase + ', resultado ' + listValue(document.predecessor.result) +
        ', impedimento ' + listValue(document.predecessor.suspension) + '.',
      '- Última entrega: ' + listValue(document.predecessor.deliveryId) + '; versão ' + listValue(document.predecessor.contentIdentity) +
        '; revisão ' + (document.predecessor.reviewState ?? 'não registrada') + '; achados bloqueantes em aberto: ' + document.predecessor.blockingFindings + '.']
    : ['- Não há tentativa predecessora registrada para esta execução.'];
  const body = [
    '# Progresso da issue #' + document.issueNumber,
    '',
    markerPrefix + identity + ' -->',
    '',
    '**Objetivo:** ' + title,
    '**Atualizado:** ' + new Date(document.updatedAtMs).toISOString(),
    '**Marco:** ' + milestoneLabels[document.milestone] + '.',
    '',
    '## Tentativa atual',
    '- Projeto: ' + inline(document.identity.projectId) + '; repositório: ' + inline(document.identity.repositoryId) + '; issue: ' + inline(document.identity.issueId) + '.',
    '- Tentativa: ' + inline(document.attempt.id) + '; passagem: ' + inline(document.attempt.passageId) + '; rodada: ' + document.attempt.round + '.',
    '- Predecessora: ' + listValue(document.attempt.predecessorAttemptId) + '.',
    '- Estado: fase ' + document.attempt.phase + '; resultado ' + listValue(document.attempt.result) + '; impedimento ' + listValue(document.attempt.suspension) + '.',
    '- Snapshot inicial: ' + document.workspace.initialState + '; origem ' + listValue(document.workspace.sourceAttemptId) +
      '; conteúdo ' + listValue(document.workspace.initialContentIdentity) + '; base de comparação ' + listValue(document.workspace.comparisonBaseSha) + '.',
    '',
    '## Implementação, validação e revisão',
    ...(rounds.length ? rounds : ['Nenhuma entrega foi registrada nesta tentativa.']),
    '',
    '- Achados bloqueantes em aberto nesta tentativa: ' + document.blockingFindings + '.',
    '',
    '## Decisões',
    ...decisions,
    '',
    '## Histórico anterior',
    ...predecessor,
    '',
    '## Próximo passo',
    nextStep(document),
    '',
    'Confirme este resumo contra os arquivos do workspace e os resultados atuais no controlador antes de retomar. Este arquivo não comprova validação, revisão ou publicação por si só.',
    '',
  ].join('\n');
  if (Buffer.byteLength(body, 'utf8') > maxProgressBytes) throw new IssueProgressError('ISSUE_PROGRESS_TOO_LARGE');
  return body;
}

interface FileIdentity {
  projectId: string;
  repositoryId: string;
  issueId: string;
  issueNumber: number;
}

interface ExistingProgressFile {
  identity: FileIdentity;
  dev: number;
  ino: number;
  size: number;
  mtimeMs: number;
  ctimeMs: number;
}

function sameIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return left.projectId === right.projectId && left.repositoryId === right.repositoryId &&
    left.issueId === right.issueId && left.issueNumber === right.issueNumber;
}

async function existingProgressFile(path: string): Promise<ExistingProgressFile | null> {
  let stat;
  try { stat = await lstat(path); }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxProgressBytes) {
    throw new IssueProgressError('ISSUE_PROGRESS_FILE_INVALID');
  }
  const handle = await open(path, 'r');
  let contents: string;
  try {
    const opened = await handle.stat();
    if (opened.dev !== stat.dev || opened.ino !== stat.ino || opened.size !== stat.size) {
      throw new IssueProgressError('ISSUE_PROGRESS_CONCURRENT_CHANGE');
    }
    contents = await handle.readFile('utf8');
  } finally { await handle.close(); }
  const after = await lstat(path);
  if (stat.dev !== after.dev || stat.ino !== after.ino || stat.size !== after.size ||
      stat.mtimeMs !== after.mtimeMs || stat.ctimeMs !== after.ctimeMs || after.isSymbolicLink()) {
    throw new IssueProgressError('ISSUE_PROGRESS_CONCURRENT_CHANGE');
  }
  const markerLine = contents.split(/\r?\n/, 3)[2];
  if (!markerLine || !markerLine.endsWith(' -->')) throw new IssueProgressError('ISSUE_PROGRESS_FILE_UNOWNED');
  let identity: FileIdentity;
  try { identity = JSON.parse(markerLine.slice(markerPrefix.length, -4)) as FileIdentity; }
  catch { throw new IssueProgressError('ISSUE_PROGRESS_FILE_INVALID'); }
  if (!identity || typeof identity.projectId !== 'string' || typeof identity.repositoryId !== 'string' ||
      typeof identity.issueId !== 'string' || !Number.isSafeInteger(identity.issueNumber)) {
    throw new IssueProgressError('ISSUE_PROGRESS_FILE_INVALID');
  }
  return { identity, dev: stat.dev, ino: stat.ino, size: stat.size, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs };
}

function sameFile(left: ExistingProgressFile | null, right: ExistingProgressFile | null): boolean {
  return left === null ? right === null : right !== null && left.dev === right.dev && left.ino === right.ino &&
    left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
}

export async function writeIssueProgressFile(path: string, document: IssueProgressDocument): Promise<void> {
  const target = resolve(path);
  const directory = dirname(target);
  if (target !== path || basename(target) !== 'progress.md') throw new IssueProgressError('ISSUE_PROGRESS_PATH_INVALID');
  const parent = await lstat(directory);
  if (!parent.isDirectory() || parent.isSymbolicLink() || await realpath(directory) !== directory) {
    throw new IssueProgressError('ISSUE_PROGRESS_PATH_INVALID');
  }
  const expectedIdentity: FileIdentity = { ...document.identity, issueNumber: document.issueNumber };
  const previous = await existingProgressFile(target);
  if (previous && !sameIdentity(previous.identity, expectedIdentity)) {
    throw new IssueProgressError('ISSUE_PROGRESS_IDENTITY_MISMATCH');
  }
  const content = renderIssueProgress(document);
  const temporary = resolve(directory, '.progress-' + randomUUID() + '.tmp');
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(content, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    if (await realpath(directory) !== directory || !sameFile(previous, await existingProgressFile(target))) {
      throw new IssueProgressError('ISSUE_PROGRESS_CONCURRENT_CHANGE');
    }
    await rename(temporary, target);
  } catch (error) {
    if (error instanceof IssueProgressError) throw error;
    throw new IssueProgressError('ISSUE_PROGRESS_WRITE_FAILED');
  } finally {
    await handle?.close().catch(() => undefined);
    await unlink(temporary).catch(error => {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    });
  }
}
