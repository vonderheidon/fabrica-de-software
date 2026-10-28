import { describe, expect, it } from 'vitest';
import { diagnosticCopyFor, isKnownOperatorEvent, isPortugueseOperatorText, operatorErrorMessage, operatorEventLabel, operatorFactLabel, operatorState, operatorVisibleFactValue } from './operator-language.js';
import { fieldGuidanceFor } from '../features/projects/FieldHelp.js';

describe('operator language', () => {
  it('describes every persisted Kanban creation operation and transition', () => {
    const operations = {
      create_board: 'Criação do quadro Kanban', configure_status: 'Configuração das colunas do Kanban',
      link_repository: 'Vínculo do repositório ao Kanban', configure_view: 'Configuração da visualização Kanban',
      verify_board: 'Verificação do quadro Kanban',
    };
    const states = { accepted: 'solicitada', running: 'em andamento', sent: 'solicitação enviada ao GitHub', confirmed: 'confirmada', failed_known: 'falhou', unknown: 'resultado sem confirmação' };
    for (const [operation, label] of Object.entries(operations)) {
      for (const [state, description] of Object.entries(states)) {
        const event = `creation.board.${operation}.${state}`;
        expect(operatorEventLabel(event)).toBe(`${label}: ${description}`);
        expect(isKnownOperatorEvent(event)).toBe(true);
      }
    }
    expect(isKnownOperatorEvent('creation.board.future.confirmed')).toBe(false);
  });
  it('explains Git incompatibility and config failures without blaming the configured identity', () => {
    const unsupported = diagnosticCopyFor('GIT_VERSION_UNSUPPORTED', 'unavailable');
    expect(unsupported.cause).toContain('--no-lazy-fetch');
    expect(unsupported.nextAction).toContain('2.45.0');
    const config = diagnosticCopyFor('SCAFFOLD_GIT_CONFIG_FAILED_EXIT_129', 'failed');
    expect(config.cause).toContain('Código de saída do Git: 129');
    expect(config.nextAction).toContain('Não reconfigure nome e e-mail');
    expect(config.title).not.toBe(diagnosticCopyFor('SCAFFOLD_GIT_IDENTITY_REQUIRED', 'failed').title);
  });
  it('recognizes persisted creation events and explains missing project configuration', () => {
    for (const event of ['creation.accepted', 'creation.completed', 'creation.stopped', 'creation.directory.running', 'creation.files.confirmed', 'creation.git.unknown', 'creation.baseline.confirmed', 'creation.reconcile.accepted', 'creation.reconciled']) {
      expect(isKnownOperatorEvent(event), event).toBe(true);
      expect(operatorEventLabel(event)).not.toBe('Atualização registrada');
    }
    expect(isKnownOperatorEvent('creation.future.running')).toBe(false);
    expect(operatorState('completed').known).toBe(true);
    for (const code of ['PROJECT_REQUIRED', 'REMOTE_UNCONFIRMED', 'PROFILES_REQUIRED']) {
      const copy = diagnosticCopyFor(code, 'blocked', 'Internal message', 'Configure exact IDs');
      expect(copy.cause).not.toContain('Internal');
      expect(copy.nextAction).toContain('configuração');
      expect(copy.nextAction).not.toContain('Registros');
    }
    expect(fieldGuidanceFor('GitHub Project')).toContain('todos os modos');
  });
  it('explains an unlinked GitHub account in operator language with a next step', () => {
    expect(diagnosticCopyFor('ACCOUNT_UNOBSERVED', 'blocked', 'ACCOUNT_UNOBSERVED', 'Bind account')).toEqual({
      title: 'Vincule uma conta GitHub',
      cause: 'Nenhuma conta GitHub foi vinculada a esta instalação.',
      nextAction: 'Abra Configuração, verifique o status do GitHub e vincule uma conta ativa.',
    });
  });

  it('translates state labels and leaves unknown states with an explicit neutral fallback', () => {
    expect(operatorState('in_review')).toEqual({ label: 'Em revisão', known: true });
    expect(operatorState('future_executor_state')).toEqual({ label: 'Estado desconhecido', known: false });
    expect(operatorVisibleFactValue('state', 'future_executor_state')).toBe('Estado desconhecido');
  });

  it('uses Portuguese labels for required diagnostic facts in snake_case and camelCase', () => {
    expect(operatorFactLabel('expected_account_id')).toBe('Conta esperada');
    expect(operatorFactLabel('observedHost')).toBe('Host observado');
    expect(operatorFactLabel('profileCount')).toBe('Perfis disponíveis');
  });

  it('keeps existing Portuguese error text and replaces unlocalized text', () => {
    expect(operatorErrorMessage('BLOCKED', 'Revise a configuração.', 409)).toBe('Revise a configuração.');
    expect(operatorErrorMessage('BLOCKED', 'Internal operation error.', 500)).toContain('O controlador não conseguiu concluir a solicitação');
    expect(isPortugueseOperatorText('Vincule a conta em Configuração.')).toBe(true);
  });

  it('explains TTL separately from the two exact minute controls without restoring removed settings', () => {
    const ttl = fieldGuidanceFor('TTL da pergunta configurado');
    expect(ttl).toMatch(/pergunta|responder ao agente/);
    expect(ttl).toContain('prazo');
    expect(fieldGuidanceFor('TTL de pergunta configurado')).toContain('aguarda resposta antes de expirar');
    expect(fieldGuidanceFor('Intervalo de consulta')).toContain('minutos');
    expect(fieldGuidanceFor('Tempo ativo por passagem')).toContain('minutos');
    expect(fieldGuidanceFor('Ordem de prioridade')).toMatch(/crescente ou decrescente/i);
    for (const help of [ttl, fieldGuidanceFor('Raiz dos projetos'), fieldGuidanceFor('Executor')]) {
      expect(help).not.toMatch(/host manual|diretório de dados|workspace maestri id|teto de inferência/i);
    }
  });

  it('states that profile guidance is effective while technical contracts remain fixed', () => {
    const help = fieldGuidanceFor('Orientações opcionais');
    expect(help).toContain('comportamentais efetivas');
    expect(help).toContain('não altera papel, critérios, permissões');
    expect(help).toContain('schemas técnicos ou limites');
  });

  it('has field-specific guidance for every project and preparation control', () => {
    const labels = [
      'Nome do projeto', 'Tipo de origem', 'Pasta local existente', 'URL do repositório GitHub',
      'Branch-base', 'Raiz dos projetos', 'Intervalo de consulta', 'Tempo ativo por passagem',
      'TTL de pergunta configurado', 'TTL de pergunta valor', 'TTL de pergunta unidade',
      'Automação global habilitada', 'Tipo da origem', 'Localização da origem',
      'Perfil implementador', 'Perfil revisor', 'Limite de correções', 'Modo de entrega padrão',
      'Automação deste projeto habilitada', 'Ordem de prioridade', 'Campo de prioridade (ID)',
      'Usar posição do quadro', 'Orientações do projeto', 'GitHub Project', 'Campo Status',
      'Status Ready', 'Status Em andamento', 'Status Em revisão', 'Status Entregue', 'Orientações opcionais',
      'Modo de entrega', 'Orientação', 'Issue', 'Projeto', 'Executor', 'Provider', 'Modelo', 'Esforço',
    ];

    for (const label of labels) {
      const help = fieldGuidanceFor(label);
      expect(help.trim(), label).not.toBe('');
      expect(help, label).not.toBe(label);
    }
  });
});
