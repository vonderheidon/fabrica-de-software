import { expect, it } from 'vitest';
import { buildHash, parseHash } from './hash-route.js';

it('keeps the selected project and profile while opening the shared profile dialog', () => {
  const route = parseHash('#principal/configuracao?dialog=profile&projectId=project-1&profileId=profile-1');
  expect(route.error).toBeNull();
  expect(route.params.get('dialog')).toBe('profile');
  expect(route.params.get('projectId')).toBe('project-1');
  expect(route.params.get('profileId')).toBe('profile-1');
  expect(buildHash(route.tab, route.params)).toBe('#principal/configuracao?projectId=project-1&profileId=profile-1&dialog=profile');
});
