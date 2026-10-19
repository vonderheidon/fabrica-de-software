import type { EventConnectionState } from './controller-events.js';

const labels: Record<EventConnectionState, string> = {
  connecting: 'Conectando atualizações',
  connected: 'Atualizações conectadas',
  reconnecting: 'Reconectando atualizações',
  unavailable: 'Falha nas atualizações',
};

export function eventConnectionLabel(state: EventConnectionState): string {
  return labels[state];
}

export function EventConnectionStatus({ state }: { state: EventConnectionState }) {
  return <span
    className={`pill event-connection-status event-connection-status-${state}`}
    role="status"
    aria-live="polite"
    aria-atomic="true"
    aria-label={eventConnectionLabel(state)}
  >
    <span className="event-connection-indicator" aria-hidden="true" />
    {eventConnectionLabel(state)}
  </span>;
}
