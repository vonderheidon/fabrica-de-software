import type { Static } from '@sinclair/typebox';
import type { HttpPassageSummary } from '#contracts';
import { OperatorState } from '../../app/OperatorSupport.js';

export type PassageFactsProps = { passage: Static<typeof HttpPassageSummary> };

export function PassageFacts({ passage }: PassageFactsProps) {
  const lost = passage.tracking === 'lost' || passage.session_state === 'interrupted' || passage.session_state === 'uncertain';
  const session = !passage.attempt_session_id ? 'Indisponível no histórico legado'
    : lost ? 'Continuidade interrompida'
      : passage.session_source_id ? 'Mesma sessão do papel, continuada da rodada anterior'
        : passage.session_state === 'reserved' ? 'Nova sessão reservada para este papel' : 'Sessão própria deste papel na tentativa';
  const occupancy = passage.occupancy_state === 'occupied' ? 'Ocupado pela passagem'
    : passage.occupancy_state === 'released' ? 'Ocupação desta passagem liberada'
      : passage.occupancy_state === 'uncertain' ? 'Ocupação incerta'
        : 'Sem observação de ocupação registrada';
  return <>
    <dl className="preparation-facts">
      <div><dt>Papel e passagem</dt><dd>{passage.role === 'implementer' ? 'Implementador' : 'Revisor'} · rodada {passage.round}</dd></div>
      <div><dt>Sessão contínua</dt><dd>{session}</dd></div>
      <div><dt>Terminal</dt><dd>{passage.terminal_name ? 'Terminal próprio vinculado à passagem' : 'Indisponível no histórico legado'}</dd></div>
      <div><dt>Disponibilidade atual do terminal</dt><dd>{({ available: 'Ocioso e disponível para reutilização', occupied: 'Ativo', uncertain: 'Incerta, exige nova conferência', retired: 'Fora de uso', planned: 'Inicialização prevista' } as Record<string, string>)[passage.terminal_state ?? ''] ?? 'Sem observação atual disponível'}</dd></div>
      <div><dt>Ocupação</dt><dd>{occupancy}</dd></div>
      <div><dt>Acompanhamento</dt><dd><OperatorState value={passage.tracking} /></dd></div>
      <div><dt>Estado da passagem</dt><dd><OperatorState value={passage.state} /></dd></div>
    </dl>
    {lost && <p role="status">Coordenação automática interrompida. O trabalho permanece preservado. Consulte os recursos e confirme a situação no Maestri antes de decidir o próximo passo; esta perda não comprova parada física nem recuperação de autoridade.</p>}
  </>;
}
