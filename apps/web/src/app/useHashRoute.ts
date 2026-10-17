import { useSyncExternalStore } from 'react';
import { parseHash, type HashRoute } from './hash-route.js';

const subscribe = (callback: () => void): (() => void) => {
  window.addEventListener('hashchange', callback);
  window.addEventListener('popstate', callback);
  return () => {
    window.removeEventListener('hashchange', callback);
    window.removeEventListener('popstate', callback);
  };
};

const getSnapshot = (): string => window.location.hash;

export function useHashRoute(): HashRoute {
  const hash = useSyncExternalStore(subscribe, getSnapshot, () => '#principal/dashboard');
  return parseHash(hash);
}
