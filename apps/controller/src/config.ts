import { resolve } from 'node:path';
import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

const Environment = Type.Object({
  NODE_ENV: Type.Union([Type.Literal('production'), Type.Literal('development'), Type.Literal('test')]),
  FACTORY_BIND_HOST: Type.Union([Type.Literal('127.0.0.1'), Type.Literal('::1')]),
  FACTORY_PORT: Type.String({ pattern: '^[1-9][0-9]{0,4}$' }),
  FACTORY_LOG_LEVEL: Type.Union(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'].map((level) => Type.Literal(level))),
}, { additionalProperties: false });
type Environment = Static<typeof Environment>;

export class ConfigurationError extends Error {
  readonly code = 'CONFIGURATION_INVALID';
  constructor() { super('Invalid controller configuration'); }
}

export interface ControllerConfiguration {
  readonly host: '127.0.0.1' | '::1';
  readonly port: number;
  readonly browserOrigin: string;
  readonly dataDirectory: string;
  readonly logLevel: string;
}

export function loadConfiguration(
  environment: Readonly<Record<string, string | undefined>>,
  installationRoot: string,
): ControllerConfiguration {
  const raw = {
    NODE_ENV: environment.NODE_ENV ?? 'production',
    FACTORY_BIND_HOST: environment.FACTORY_BIND_HOST ?? '127.0.0.1',
    FACTORY_PORT: environment.FACTORY_PORT ?? '4310',
    FACTORY_LOG_LEVEL: environment.FACTORY_LOG_LEVEL ?? 'info',
  };
  if (!Value.Check(Environment, raw)) throw new ConfigurationError();
  const port = Number(raw.FACTORY_PORT);
  if (port > 65_535) throw new ConfigurationError();
  const host = raw.FACTORY_BIND_HOST === '::1' ? '[::1]' : raw.FACTORY_BIND_HOST;
  const origin = `http://${host}:${port}`;
  if (environment.FACTORY_BROWSER_ORIGIN !== undefined && environment.FACTORY_BROWSER_ORIGIN !== origin) {
    throw new ConfigurationError();
  }
  return Object.freeze({
    host: raw.FACTORY_BIND_HOST,
    port,
    browserOrigin: origin,
    dataDirectory: resolve(installationRoot, 'var/factory'),
    logLevel: raw.FACTORY_LOG_LEVEL,
  });
}
