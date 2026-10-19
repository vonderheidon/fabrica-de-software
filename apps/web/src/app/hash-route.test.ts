import { expect, it } from 'vitest';
import { buildHash, parseHash } from './hash-route.js';

it('preserves the clicked GitHub issue in a reloadable preparation route', () => {
  const route = parseHash('#principal/dashboard?dialog=preparation&projectId=project-1&issueId=I_issue_2');
  expect(route.error).toBeNull();
  expect(route.params.get('issueId')).toBe('I_issue_2');
  expect(parseHash(buildHash(route.tab, route.params)).params.get('issueId')).toBe('I_issue_2');
  expect(parseHash('#principal/dashboard?issueId=').error).not.toBeNull();
});

it('recognizes the resumable initial setup inside the shared dialog route', () => {
  const route = parseHash('#principal/dashboard?dialog=initial-setup');
  expect(route.error).toBeNull();
  expect(route.params.get('dialog')).toBe('initial-setup');
  expect(buildHash(route.tab, route.params)).toBe('#principal/dashboard?dialog=initial-setup');
});

it('keeps the selected project and profile while opening the shared profile dialog', () => {
  const route = parseHash('#principal/configuracao?dialog=profile&projectId=project-1&profileId=profile-1');
  expect(route.error).toBeNull();
  expect(route.params.get('dialog')).toBe('profile');
  expect(route.params.get('projectId')).toBe('project-1');
  expect(route.params.get('profileId')).toBe('profile-1');
  expect(buildHash(route.tab, route.params)).toBe('#principal/configuracao?projectId=project-1&profileId=profile-1&dialog=profile');
});

it('recognizes the global profiles workspace route', () => {
  const route = parseHash('#principal/perfis');
  expect(route.error).toBeNull();
  expect(route.tab).toBe('perfis');
  expect(buildHash(route.tab)).toBe('#principal/perfis');
});
