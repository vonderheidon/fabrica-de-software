import { Value } from '@sinclair/typebox/value';
import { ContextDiagnostic, type DiagnosticCheck, type DiagnosticRequest } from '#contracts';
import { OperationError, type Storage, type DiagnosticCommand } from '../storage/index.js';
import type { GitHub } from '../github/index.js';
import type { Execution } from '../execution/index.js';

export interface DiagnosticDependencies {
  storage: Storage;
  github: Pick<GitHub, 'getIdentity'>;
  execution?: Pick<Execution, 'preflight'>;
  logFailure: (code: string) => void;
}
/** Explicit non-paid observations. No dispatch, mutator, resource creator or generic command port. */
export function createDiagnostics({ storage, github, execution, logFailure }: DiagnosticDependencies) {
  const pending = new Set<Promise<void>>(); let closed = false;
  const make = (check: DiagnosticCheck, code: string, cause: string, recovery: string, facts: ContextDiagnostic['facts'], state: ContextDiagnostic['state']): ContextDiagnostic => ({
    check, code, cause, recovery, facts, state, observedAtMs: Date.now(),
    affectedRequirements: check === 'maestri_context' ? ['RF-88', 'INT-01', 'INT-02'] : ['RF-88'],
  });
  async function run(command: DiagnosticCommand) {
    const { checks, ...context } = command.body;
    const results: ContextDiagnostic[] = [];
    for (const check of checks) {
      try {
        const c = storage.getDiagnosticContext(context);
        if (check === 'configuration') {
          const blockers = storage.getContextDiagnostics(context).diagnostics.filter(d => d.check === 'configuration' && d.state !== 'passed' && d.code !== 'EXECUTION_REVALIDATION_REQUIRED');
          results.push(blockers[0] ? { ...blockers[0], observedAtMs: Date.now() } : make(check, 'CONFIGURATION_RECORDED', 'Configuração persistida e vínculos locais consultados.', 'Revalide a autoridade e o executor no início da tentativa.', c.facts, 'passed'));
        } else if (check === 'github_identity') {
          const identity = await github.getIdentity();
          const complete = identity.state === 'complete' && identity.data !== null;
          const matches = complete && identity.data!.id === c.settings.account_id;
          const rawCode = complete ? (matches ? 'GITHUB_IDENTITY_CONFIRMED' : 'ACCOUNT_MISMATCH') : identity.diagnostics[0]?.code ?? 'CONTEXT_UNAVAILABLE';
          results.push(make(check, rawCode, complete ? (matches ? 'Conta observada corresponde à configuração.' : 'Conta observada diverge da conta configurada.') : 'Não foi possível confirmar a identidade no contexto autorizado.',
            'Confira o contexto GitHub e a conta no host autorizado. Não refaça login pelo controlador.',
            { ...c.facts, observedAccountId: complete ? identity.data!.id : null, retryAtMs: identity.retryAtMs }, matches ? 'passed' : complete ? 'blocked' : 'unavailable'));
        } else if (check === 'maestri_context') {
          const result = execution ? await execution.preflight() : null;
          results.push(make(check, result?.ready ? 'MAESTRI_CONTEXT_CONFIRMED' : result?.code ?? 'CONTEXT_UNAVAILABLE',
            result?.ready ? 'Consulta nativa não paga confirmou o contexto Maestri/OMP neste instante; não comprova execução de provider ou MCP.' : 'Contexto nativo Maestri/OMP ausente, incompatível ou indisponível.',
            'Use o terminal âncora e os perfis exatos no host executor. Não modifique ACLs ou credenciais.', c.facts, result?.ready ? 'passed' : 'unavailable'));
        } else {
          storage.checkHealth();
          if (context.scope === 'attempt') {
            const resources = storage.getResources(context.id);
            const uncertainCount = resources.entries.filter(r => r.stopState === 'uncertain' || r.launchState === 'partial').length;
            const missingOwnership = resources.entries.some(r => !r.owned);
            const trackingLost = c.tracking === 'lost';
            const code = trackingLost ? 'TRACKING_LOST' : uncertainCount ? 'RESOURCE_STATE_UNCERTAIN' : missingOwnership ? 'RESOURCE_OWNERSHIP_UNCONFIRMED' : resources.entries.length ? 'RESOURCES_RECORDED' : 'RESOURCES_NOT_OBSERVED';
            results.push(make(check, code,
              'Registros atuais de recursos consultados; esta verificação não comprova parada física ou acesso ao conteúdo.',
              'Consulte os recursos da tentativa e a confirmação de parada no host executor.',
              { ...c.facts, resourceCount: resources.entries.length, uncertainCount }, trackingLost || uncertainCount ? 'blocked' : missingOwnership || !resources.entries.length ? 'unavailable' : 'passed'));
          } else {
            const creation = storage.getCreation(context.scope === 'creation' ? context.id : '');
            const uncertainCount = creation.effects.filter(e => e.state === 'unknown' || e.state === 'running').length;
            results.push(make(check, uncertainCount ? 'CREATION_EFFECT_UNKNOWN' : 'CREATION_RESOURCES_RECORDED',
              'Etapas e efeitos da criação consultados; arquivos e recursos externos não foram criados ou modificados.',
              'Consulte o detalhe da criação; reconcilie efeitos incertos pela ação correspondente.',
              { ...c.facts, resourceCount: creation.confirmedEffects.length, uncertainCount }, uncertainCount ? 'blocked' : 'passed'));
          }
        }
      } catch {
        logFailure('DIAGNOSTIC_CHECK_UNAVAILABLE');
        results.push(make(check, 'DIAGNOSTIC_CHECK_UNAVAILABLE', 'A consulta não terminou com uma observação válida.',
          'Confira o contexto e solicite outra verificação. Nenhum efeito será repetido automaticamente.', {}, 'unavailable'));
      }
    }
    if (results.some(d => !Value.Check(ContextDiagnostic, d))) throw new OperationError(503, 'DIAGNOSTIC_RESULT_INVALID', 'Diagnostic result is invalid.');
    storage.finishDiagnostic(command, results);
  }
  return {
    get: storage.getContextDiagnostics,
    async verify(body: DiagnosticRequest, operationId: string) {
      const command = { operationId, body };
      const previous = storage.recoverDiagnostic(command); if (previous) return previous;
      if (closed || pending.size >= 8) throw new OperationError(503, 'DIAGNOSTIC_CAPACITY', 'Diagnostic capacity is unavailable.');
      const accepted = storage.acceptDiagnostic(command);
      if (accepted.created) {
        // Yield before any observation: the durable intention is queryable when IO begins.
        const task = new Promise<void>(resolve => setImmediate(resolve)).then(() => run(command)).catch(() => {
          logFailure('DIAGNOSTIC_PERSISTENCE_FAILED');
        }).finally(() => pending.delete(task));
        pending.add(task);
      }
      return accepted.operation;
    },
    async drain() { while (pending.size) await Promise.all([...pending]); },
    async close() { closed = true; await Promise.all([...pending]); storage.interruptDiagnostics(); },
  };
}
export type Diagnostics = ReturnType<typeof createDiagnostics>;
