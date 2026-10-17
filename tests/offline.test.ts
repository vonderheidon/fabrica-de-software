import { execFile } from 'node:child_process';
import { Socket } from 'node:net';
import { expect, it } from 'vitest';

it('blocks network and subprocess effects in the standard suite', () => {
  expect(() => fetch('https://example.invalid')).toThrow('Network access is forbidden');
  expect(() => new Socket().connect(443, 'example.invalid')).toThrow('Socket connections are forbidden');
  expect(() => execFile('gh', ['api', 'user'])).toThrow('Subprocesses are forbidden');
});
