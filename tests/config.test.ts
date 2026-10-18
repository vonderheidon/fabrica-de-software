import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigurationError, loadConfiguration } from '../apps/controller/src/config.js';

describe('startup configuration', () => {
  it('resolves portable defaults against the installation root', () => {
    const root = resolve('.tmp/installation');
    expect(loadConfiguration({}, root)).toEqual({ host: '127.0.0.1', port: 4310, browserOrigin: 'http://127.0.0.1:4310', dataDirectory: resolve(root, 'var/factory'), logLevel: 'info' });
    expect(loadConfiguration({ FACTORY_BIND_HOST: '::1', FACTORY_PORT: '4311' }, root).browserOrigin).toBe('http://[::1]:4311');
  });
  it.each(['', '  ', '\u0000', '../outside', 'C:/outside'])('ignores the retired data directory override %s', value => {
    const root = resolve('.tmp/installation');
    expect(loadConfiguration({ FACTORY_DATA_DIR: value }, root).dataDirectory).toBe(resolve(root, 'var/factory'));
  });
  it.each([
    { FACTORY_BIND_HOST: '0.0.0.0' }, { FACTORY_BIND_HOST: 'example.com' },
    { FACTORY_PORT: '0' }, { FACTORY_PORT: '65536' }, { FACTORY_PORT: '123abc' },
    { FACTORY_LOG_LEVEL: 'arbitrary' }, { NODE_ENV: 'arbitrary' },
    { FACTORY_BROWSER_ORIGIN: 'http://attacker.example' }, { FACTORY_BROWSER_ORIGIN: 'http://127.0.0.1:4310/' },
  ])('rejects invalid startup values without revealing them', (environment) => {
    expect(() => loadConfiguration(environment, resolve('.'))).toThrow(ConfigurationError);
  });
});
