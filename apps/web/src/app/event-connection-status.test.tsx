import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { EventConnectionStatus, eventConnectionLabel } from './EventConnectionStatus.js';
import type { EventConnectionState } from './controller-events.js';

it('renders every connection state in Portuguese with an accessible live status name', () => {
  const states: EventConnectionState[] = ['connecting', 'connected', 'reconnecting', 'unavailable'];
  const labels = [
    'Conectando atualizações',
    'Atualizações conectadas',
    'Reconectando atualizações',
    'Falha nas atualizações',
  ];

  states.forEach((state, index) => {
    const label = labels[index];
    expect(eventConnectionLabel(state)).toBe(label);
    const markup = renderToStaticMarkup(<EventConnectionStatus state={state} />);
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain(`aria-label="${label}"`);
    expect(markup).toContain(`>${label}</span>`);
  });
});
