import type { DeliveryMode } from '#contracts';

export const deliveryModeLabel: Record<DeliveryMode, string> = { icr:'ICR',commit:'ICR + commit',pr:'ICR + commit + PR' };
export const deliveryModeDescription: Record<DeliveryMode, string> = {
  icr:'Implementar, verificar e revisar; manter a versão aprovada no ambiente da tentativa.',
  commit:'Integrar a versão aprovada no destino local e criar commit em branch própria.',
  pr:'Integrar, criar commit, publicar a branch e abrir PR para a base conferida.',
};
