import { randomUUID } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { connect } from 'node:net';
import { ExecutionError } from '../../errors.js';
import { connectWire, executionLimits, type Wire } from './wire.js';

// Structural view of the supported OMP extension API. OMP supplies these
// objects; importing another OMP distribution would create a second runtime.
interface Context {
  isIdle?(): boolean;
  hasPendingMessages?(): boolean;
  mode: string; hasUI: boolean; cwd: string; model?: { provider: string; id: string };
  sessionManager: { getSessionId(): string };
  ui: { notify(message: string, level: 'error' | 'info'): void };
}
interface ToolResult { content: { type: 'text'; text: string }[]; details: Record<string, unknown>; isError?: boolean }
interface SchemaBuilder {
  String(options: Record<string, unknown>): unknown;
  Integer(options: Record<string, unknown>): unknown;
  Boolean(options: Record<string, unknown>): unknown;
  Null(): unknown;
  Literal(value: unknown): unknown;
  Union(schemas: unknown[]): unknown;
  Array(schema: unknown, options: Record<string, unknown>): unknown;
  Object(properties: Record<string, unknown>, options: Record<string, unknown>): unknown;
}
interface ExtensionApi {
  typebox: { Type: SchemaBuilder };
  on(event: string, handler: (event: unknown, context: Context) => void | Promise<void>): void;
  registerTool(definition: { name: string; label: string; description: string; parameters: unknown;
    execute(id: string, payload: unknown, signal: AbortSignal, update: unknown, context: Context): Promise<ToolResult> }): void;
  getThinkingLevel(): string | undefined;
  sendUserMessage(message: string, options?: { deliverAs: 'followUp' }): void;
}
interface Launch {
  protocolVersion: 1; host: '127.0.0.1'; port: number; token: string; cwd: string; ompVersion: string;
  role: { reference: { sha256: string }; resultSchema: Record<string, unknown>; questionSchema: Record<string, unknown> };
  task: string; guidance: string; gitNexusRequired: boolean;
}
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ExecutionError('FRAME_INVALID');
  return value as Record<string, unknown>;
};
/** Rebuild distributed JSON schemas with the TypeBox implementation supplied by OMP. */
function hydrate(builder: SchemaBuilder, value: unknown): unknown {
  const schema = object(value);
  if ('const' in schema) return builder.Literal(schema.const);
  if (Array.isArray(schema.anyOf)) return builder.Union(schema.anyOf.map(v => hydrate(builder, v)));
  const { type, properties, items, ...options } = schema;
  if (type === 'string') return builder.String(options);
  if (type === 'integer') return builder.Integer(options);
  if (type === 'boolean') return builder.Boolean(options);
  if (type === 'null') return builder.Null();
  if (type === 'array') return builder.Array(hydrate(builder, items), options);
  if (type === 'object') return builder.Object(Object.fromEntries(Object.entries(object(properties)).map(([k, v]) => [k, hydrate(builder, v)])), options);
  throw new ExecutionError('RESOURCE_INVALID');
}
function loadLaunch(): Launch {
  try {
    const filename = process.env.FACTORY_PASSAGE_BOOTSTRAP;
    if (!filename) throw new ExecutionError('RESOURCE_INVALID');
    if (statSync(filename).size > 4_194_304) throw new ExecutionError('FRAME_OVERSIZE');
    const bytes = readFileSync(filename);
    if (bytes.length > 4_194_304) throw new ExecutionError('FRAME_OVERSIZE');
    const raw = object(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
    if (raw.protocolVersion !== 1 || raw.host !== '127.0.0.1' || !Number.isInteger(raw.port) || Number(raw.port) < 1 || Number(raw.port) > 65535 ||
      typeof raw.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(raw.token) || typeof raw.cwd !== 'string' ||
      typeof raw.task !== 'string' || typeof raw.guidance !== 'string' || typeof raw.ompVersion !== 'string' ||
      raw.ompVersion.length < 1 || raw.ompVersion.length > 128) throw new ExecutionError('RESOURCE_INVALID');
    const role = object(raw.role); const reference = object(role.reference);
    if (Object.keys(role).sort().join(',') !== 'questionSchema,reference,resultSchema' ||
      typeof reference.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(reference.sha256) ||
      !role.resultSchema || typeof role.resultSchema !== 'object' || !role.questionSchema || typeof role.questionSchema !== 'object') throw new ExecutionError('RESOURCE_INVALID');
    return raw as unknown as Launch;
  } catch { throw new ExecutionError('RESOURCE_INVALID'); }
}

export default function executionExtension(api: ExtensionApi): void {
  const launch = loadLaunch();
  const pending = new Map<string, { resolve: (reply: Record<string, unknown>) => void; reject: () => void }>();
  const answers = new Map<string, { questionId: string; answer: string; scopeDigest: unknown }>();
  const continuations = new Set<string>();
  const activeTools = new Map<string, string>();
  let wire: Wire | undefined;
  let trackedSession: string | undefined;
  let started = false;
  let alive = false;
  let awaitingTaskAuthorization = false;
  let taskAuthorized = false;
  let idleCheck = false;
  let context: Context | undefined;
  let lossNotified = false;
  const lose = () => {
    alive = false;
    awaitingTaskAuthorization = false;
    for (const call of pending.values()) call.reject();
    pending.clear();
    if (lossNotified) return;
    lossNotified = true;
    context?.ui.notify('Acompanhamento da fábrica interrompido. Trabalho preservado; use nova tentativa para retomar a coordenação.', 'error');
  };
  const sameSession = (ctx: Context) => ctx.sessionManager.getSessionId() === trackedSession && ctx.cwd === launch.cwd;
  const currentEffort = () => api.getThinkingLevel() ?? null;
  const sameProfile = (ctx: Context) => ctx.model?.provider === initialProfile?.provider && ctx.model?.id === initialProfile?.model && currentEffort() === initialProfile?.effort;
  let initialProfile: { provider: string; model: string; effort: string | null } | undefined;
  const request = async (tool: string, payload: unknown, ctx: Context): Promise<ToolResult> => {
    if (!alive || !taskAuthorized || !sameSession(ctx) || !sameProfile(ctx) || !wire) throw new ExecutionError('TRACKING_LOST');
    if (pending.size >= executionLimits.pendingCalls) throw new ExecutionError('CHANNEL_TIMEOUT');
    const id = randomUUID();
    const reply = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new ExecutionError('CHANNEL_TIMEOUT')); }, executionLimits.requestMs);
      pending.set(id, { resolve: (value) => { clearTimeout(timer); resolve(value); }, reject: () => { clearTimeout(timer); reject(new ExecutionError('CHANNEL_EOF')); } });
      void wire?.send({ type: 'call', id, tool, payload }).catch(() => { pending.get(id)?.reject(); pending.delete(id); });
    });
    if (reply.ok !== true) {
      const validationIssues = Array.isArray(reply.validationIssues) ? reply.validationIssues.slice(0, 8).flatMap(value => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
        const issue = value as Record<string, unknown>;
        if (typeof issue.path !== 'string' || typeof issue.rule !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(issue.rule)) return [];
        return [{ path: issue.path.replace(/[\u0000-\u001f\u007f]/g, '?').slice(0, 256), rule: issue.rule }];
      }) : [];
      const diagnostic = validationIssues.length
        ? ` Diagnóstico: ${validationIssues.map(issue => `${issue.path} (${issue.rule})`).join('; ')}.` : '';
      return { content: [{ type: 'text', text: `Payload recusado pelo controlador.${diagnostic} Corrija os argumentos e tente novamente; a sessão continua operacional.` }],
        details: { accepted: false, code: typeof reply.code === 'string' ? reply.code : 'RESULT_INVALID', ...(validationIssues.length ? { validationIssues } : {}) }, isError: true };
    }
    return { content: [{ type: 'text', text: 'Recebido e persistido pela fábrica.' }], details: { accepted: true, ...(typeof reply.receiptId === 'string' ? { receiptId: reply.receiptId } : {}), ...(typeof reply.questionId === 'string' ? { questionId: reply.questionId } : {}) } };
  };
  for (const [name, schema] of [['execution_complete', launch.role.resultSchema], ['execution_question', launch.role.questionSchema]] as const) {
    api.registerTool({ name, label: name, description: name === 'execution_complete' ? 'Deliver the official result for this passage using the versioned role contract.' : 'Record a human decision with context and alternatives. The TUI remains available.',
      parameters: hydrate(api.typebox.Type, schema),
      execute: async (id, payload, _signal, _update, ctx) => {
        if (name === 'execution_complete' && [...activeTools.keys()].some(key => key !== id)) {
          return { content: [{ type: 'text', text: 'Aguarde o término das ferramentas e dos processos próprios antes de entregar o resultado oficial.' }],
            details: { accepted: false, code: 'OWNED_TOOLS_RUNNING' }, isError: true };
        }
        return request(name, payload, ctx);
      },
    });
  }
  // Supported OMP events observe all native/MCP/custom tools without changing their behavior.
  api.on('tool_execution_start', (event) => {
    const e = object(event);
    if (typeof e.toolCallId === 'string' && typeof e.toolName === 'string') activeTools.set(e.toolCallId, e.toolName);
  });
  api.on('tool_execution_end', (event) => {
    const e = object(event); if (typeof e.toolCallId === 'string') activeTools.delete(e.toolCallId);
  });
  api.on('session_start', async (_event, ctx) => {
    if (started || ctx.mode !== 'tui' || !ctx.hasUI || !process.stdin.isTTY || !process.stdout.isTTY || !ctx.model) {
      ctx.ui.notify('A fábrica exige uma TUI OMP nativa com sessão nova.', 'error'); return;
    }
    started = true; context = ctx; trackedSession = ctx.sessionManager.getSessionId();
    initialProfile = { provider: ctx.model.provider, model: ctx.model.id, effort: currentEffort() };
    const socket = connect({ host: launch.host, port: launch.port });
    wire = connectWire(socket, async (value) => {
      const frame = object(value);
      if (frame.type === 'run' && Object.keys(frame).length === 1) {
        if (alive || !sameSession(ctx) || !sameProfile(ctx)) throw new ExecutionError('TRACKING_LOST');
        alive = true;
        awaitingTaskAuthorization = true;
        await wire?.send({ type: 'task-submitted' });
      } else if (frame.type === 'task-authorized' && Object.keys(frame).length === 1) {
        if (!alive || !awaitingTaskAuthorization || taskAuthorized || !sameSession(ctx) || !sameProfile(ctx)) throw new ExecutionError('TRACKING_LOST');
        awaitingTaskAuthorization = false;
        taskAuthorized = true;
        const gitNexus = launch.gitNexusRequired ? `\nGitNexus is required. Analyze and query exactly this clone root: ${launch.cwd}. Confirm that the returned root matches.` : '';
        // This is the sole task submission. No CLI prompt, stdin piping or second hidden agent.
        api.sendUserMessage(`Instruções comportamentais efetivas do perfil capturado:\n${launch.guidance}\n\nContexto da tarefa e contrato técnico capturados:\n${gitNexus}\n\n${launch.task}`);
      } else if (frame.type === 'continuation-check' && typeof frame.passageId === 'string' && /^[a-f0-9-]{36}$/.test(frame.passageId)) {
        if (!ctx.isIdle || !ctx.hasPendingMessages || idleCheck || !alive || !sameSession(ctx) || !sameProfile(ctx)) throw new ExecutionError('TRACKING_LOST');
        idleCheck = true;
        const isIdle = ctx.isIdle; const hasPendingMessages = ctx.hasPendingMessages;
        // Do not block frame dispatch: replies already in flight must drain pending calls.
        void (async () => {
          while (!isIdle.call(ctx) || hasPendingMessages.call(ctx) || activeTools.size || pending.size) {
            if (!alive || !sameSession(ctx) || !sameProfile(ctx)) throw new ExecutionError('TRACKING_LOST');
            await new Promise<void>(resolve => setTimeout(resolve, 25));
          }
          if (!alive || !sameSession(ctx) || !sameProfile(ctx)) throw new ExecutionError('TRACKING_LOST');
          await wire?.send({ type: 'continuation-idle', passageId: frame.passageId });
        })().catch(() => { wire?.close('TRACKING_LOST'); lose(); }).finally(() => { idleCheck = false; });
      } else if (frame.type === 'continuation' && typeof frame.passageId === 'string' && /^[a-f0-9-]{36}$/.test(frame.passageId) && typeof frame.task === 'string' && frame.task.length <= 1_000_000) {
        if (!alive || !sameSession(ctx) || !sameProfile(ctx) || continuations.has(frame.passageId) || continuations.size >= 5) throw new ExecutionError('TRACKING_LOST');
        continuations.add(frame.passageId);
        api.sendUserMessage(frame.task, { deliverAs: 'followUp' });
        await wire?.send({ type: 'continuation-receipt', passageId: frame.passageId });
      } else if (frame.type === 'reply' && typeof frame.id === 'string') {
        const call = pending.get(frame.id);
        if (!call) throw new ExecutionError('FRAME_INVALID');
        pending.delete(frame.id); call.resolve(frame);
      } else if (frame.type === 'answer' && typeof frame.operationId === 'string' && typeof frame.questionId === 'string' && typeof frame.answer === 'string' && frame.answer.length <= 8192) {
        if (!alive || !sameSession(ctx) || !sameProfile(ctx)) throw new ExecutionError('TRACKING_LOST');
        if (frame.scopeDigest !== undefined && (typeof frame.scopeDigest !== 'string' || !/^[a-f0-9]{64}$/.test(frame.scopeDigest))) throw new ExecutionError('FRAME_INVALID');
        if (!answers.has(frame.operationId)) {
          if (answers.size >= 128) throw new ExecutionError('FRAME_OVERSIZE');
          const scope = frame.scopeDigest ? `\nFormal scope decision: keep exactly the captured criterion IDs and texts (digest ${frame.scopeDigest}). The human text is guidance within that scope. Adopting new criteria requires updating GitHub and another attempt.` : '';
          api.sendUserMessage(`Resposta da decisão ${frame.questionId}:\n${frame.answer}${scope}`, { deliverAs: 'followUp' });
          answers.set(frame.operationId, { questionId: frame.questionId, answer: frame.answer, scopeDigest: frame.scopeDigest });
        }
        const delivered = answers.get(frame.operationId);
        if (delivered?.questionId !== frame.questionId || delivered.answer !== frame.answer || delivered.scopeDigest !== frame.scopeDigest) throw new ExecutionError('ANSWER_CONFLICT');
        await wire?.send({ type: 'answer-receipt', operationId: frame.operationId });
      } else throw new ExecutionError('FRAME_INVALID');
    }, lose);
    const timer = setTimeout(() => wire?.close('HANDSHAKE_TIMEOUT'), executionLimits.handshakeMs);
    socket.once('connect', () => {
      clearTimeout(timer);
      void wire?.send({ type: 'hello', protocolVersion: 1, token: launch.token, sessionId: trackedSession,
        terminalId: process.env.MAESTRI_TERMINAL_ID ?? '', workspaceId: process.env.MAESTRI_WORKSPACE_ID ?? '',
        cwd: ctx.cwd, ...initialProfile, tui: true, roleDigest: launch.role.reference.sha256, ompVersion: launch.ompVersion,
      }).catch(() => wire?.close());
    });
    socket.once('close', () => clearTimeout(timer));
  });
  for (const event of ['session_switch', 'session_branch', 'session_tree', 'session_shutdown']) api.on(event, async () => {
    alive = false;
    try { await wire?.send({ type: 'tracking-lost' }); } finally { wire?.close(); }
  });
  // Observe a material change at the supported boundary; never prevent native commands.
  api.on('before_agent_start', async (_event, ctx) => {
    if (alive && (!sameSession(ctx) || !sameProfile(ctx))) {
      alive = false;
      try { await wire?.send({ type: 'tracking-lost' }); } finally { wire?.close(); }
    }
  });
}
