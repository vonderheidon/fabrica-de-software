import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import cookie from '@fastify/cookie';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { EmptyBody, EmptyQuery, ErrorResponse, OperationId, SessionResponse } from '#contracts';
import { Value } from '@sinclair/typebox/value';
import type { ControllerConfiguration } from '../../config.js';
import { HttpError } from '../errors.js';
import type { Storage } from '../../modules/storage/index.js';

declare module 'fastify' {
  interface FastifyContextConfig {
    publicAsset?: boolean;
  }
}

export const httpLimits = Object.freeze({
  bodyBytes: 16_384, headerBytes: 8192, headerCount: 64, connections: 128,
  connectionTimeoutMs: 10_000, requestTimeoutMs: 15_000, headersTimeoutMs: 10_000,
  handlerTimeoutMs: 15_000,
  keepAliveTimeoutMs: 5000, requestsPerSocket: 100, sessions: 128,
  bootstrapPerMinute: 60, requestsPerMinute: 600, sqliteWaitMs: 5000,
  streams: 8, streamsPerSession: 2, streamLifetimeMs: 60_000, streamPollMs: 1000, streamBufferBytes: 16_384,
});

function equalSecret(provided: unknown, expected: string): boolean {
  return typeof provided === 'string' && /^[A-Za-z0-9_-]{43}$/.test(provided)
    && timingSafeEqual(Buffer.from(provided, 'ascii'), Buffer.from(expected, 'ascii'));
}

export function installSecurity(app: FastifyInstance, configuration: ControllerConfiguration, installationId: string) {
  const sessions = new Map<string, string>();
  const streams = new Map<AbortController, string>();
  const instanceId = randomUUID();
  const name = `factory_${createHash('sha256').update(installationId).digest('hex').slice(0,16)}_${configuration.port}`;
  let windowStart = Date.now();
  let bootstrapCount = 0;
  let requestCount = 0;
  app.register(cookie);
  const revokeSession = (id: string) => {
    sessions.delete(id);
    for (const [controller, sessionId] of streams) if (sessionId === id) controller.abort();
  };
  app.addHook('preClose', async () => {
    for (const controller of streams.keys()) controller.abort();
    sessions.clear();
  });
  const sessionFor = (request: FastifyRequest) => {
    const id = request.cookies[name];
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(id)) return undefined;
    // Compare both secrets using fixed-length timingSafeEqual, never accept unknown cookies.
    for (const [knownId, csrf] of sessions) {
      if (equalSecret(id, knownId)) return csrf;
    }
    return undefined;
  };
  app.addHook('onRequest', async (request, reply) => {
    const publicAsset = (request.method === 'GET' || request.method === 'HEAD') && request.routeOptions.config.publicAsset === true;
    reply.header('Cache-Control', 'no-store').header('X-Content-Type-Options', 'nosniff');
    if (request.raw.rawHeaders.length / 2 > httpLimits.headerCount) throw new HttpError(431, 'HEADERS_TOO_LARGE', 'Too many headers.');
    if (request.headers.host !== new URL(configuration.browserOrigin).host) {
      throw new HttpError(403, 'HOST_NOT_ALLOWED', 'Host is not allowed.');
    }
    const origin = request.headers.origin;
    if (origin !== undefined && origin !== configuration.browserOrigin) {
      throw new HttpError(403, 'ORIGIN_NOT_ALLOWED', 'Origin is not allowed.');
    }
    const fetchSite = request.headers['sec-fetch-site'];
    // Address-bar navigation has no initiating origin; only public files allow it.
    if (fetchSite !== undefined && fetchSite !== 'same-origin' && !(publicAsset && fetchSite === 'none')) {
      throw new HttpError(403, 'FETCH_SITE_NOT_ALLOWED', 'Fetch context is not allowed.');
    }
    if (Date.now() - windowStart >= 60_000) { windowStart = Date.now(); bootstrapCount = 0; requestCount = 0; }
    if (++requestCount > httpLimits.requestsPerMinute) {
      reply.header('Retry-After', '60');
      throw new HttpError(429, 'RATE_LIMITED', 'Request limit reached.');
    }
    const route = request.routeOptions.url;
    const bootstrap = request.method === 'POST' && route === '/api/v1/session';
    const health = (request.method === 'GET' || request.method === 'HEAD') && route === '/api/v1/health';
    if (bootstrap || !['GET', 'HEAD'].includes(request.method)) {
      if (origin !== configuration.browserOrigin) throw new HttpError(403, 'ORIGIN_NOT_ALLOWED', 'Origin is required.');
      if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers['content-type'] ?? '')) {
        throw new HttpError(415, 'JSON_REQUIRED', 'Content-Type must be application/json.');
      }
    }
    if (bootstrap) {
      if (request.headers['x-factory-client'] !== 'web') throw new HttpError(400, 'CLIENT_HEADER_REQUIRED', 'Client header is invalid.');
      if (++bootstrapCount > httpLimits.bootstrapPerMinute) {
        reply.header('Retry-After', '60');
        throw new HttpError(429, 'BOOTSTRAP_RATE_LIMITED', 'Bootstrap limit reached.');
      }
    } else if (!health && !publicAsset) {
      const csrf = sessionFor(request);
      if (!csrf) throw new HttpError(401, 'SESSION_REQUIRED', 'A local session is required.');
      if (!['GET', 'HEAD'].includes(request.method) && !equalSecret(request.headers['x-csrf-token'], csrf)) {
        throw new HttpError(403, 'CSRF_INVALID', 'CSRF token is invalid.');
      }
    }
  });
  app.post('/api/v1/session', {
    schema: { body: EmptyBody, querystring: EmptyQuery, response: { 200: SessionResponse, 400: ErrorResponse, 403: ErrorResponse, 429: ErrorResponse, 503: ErrorResponse } },
  }, async (request, reply) => {
    let csrfToken = sessionFor(request);
    if (!csrfToken) {
      if (sessions.size >= httpLimits.sessions) throw new HttpError(503, 'SESSION_LIMIT_REACHED', 'Session capacity reached.');
      const id = randomBytes(32).toString('base64url');
      csrfToken = randomBytes(32).toString('base64url');
      sessions.set(id, csrfToken);
      reply.setCookie(name, id, { httpOnly: true, sameSite: 'strict', path: '/api/v1', secure: false });
    }
    return { csrfToken, instanceId };
  });
  return {
    revokeSession,
    trackStream(request: FastifyRequest, controller: AbortController) {
      const id = request.cookies[name];
      if (!id || !sessionFor(request)) throw new HttpError(401, 'SESSION_REQUIRED', 'A local session is required.');
      if (streams.size >= httpLimits.streams || [...streams.values()].filter((value) => value === id).length >= httpLimits.streamsPerSession) {
        throw new HttpError(429, 'STREAM_LIMIT_REACHED', 'Stream capacity reached.');
      }
      streams.set(controller, id);
      return () => { streams.delete(controller); };
    },
  };
}

/** Called by domain routes after boundary validation; existing operations are recovered in storage before CAS. */
export function commandHeaders(request: FastifyRequest) {
  const operationId = request.headers['idempotency-key'];
  if (!Value.Check(OperationId, operationId)) throw new HttpError(400, 'IDEMPOTENCY_KEY_INVALID', 'Idempotency-Key must be a UUID.');
  const expectedRevision = request.headers['if-match'];
  if (expectedRevision !== undefined && typeof expectedRevision !== 'string') throw new HttpError(400, 'IF_MATCH_INVALID', 'If-Match is invalid.');
  return { operationId, expectedRevision };
}

export function sendOperationAccepted(reply: FastifyReply, requestId: string, storage: Storage, operationId: string) {
  const operation = storage.getOperation(operationId);
  const durableUncertainAnswer = operation && ['scaffold.create', 'scaffold.reconcile', 'question.answer', 'resource.remove', 'folder.open', 'interaction.open', 'publication.complete', 'publication.reconcile', 'attempt.revalidate'].includes(operation.kind) && operation.receipt !== undefined;
  if (!operation || (operation.state === 'unknown' && !durableUncertainAnswer)) throw new HttpError(503, 'OPERATION_NOT_DURABLE', 'Operation acceptance could not be confirmed.');
  const statusUrl = `/api/v1/operations/${operation.operationId}`;
  return reply.code(202).header('Location', statusUrl).send({
    operationId: operation.operationId, resource: operation.resource, statusUrl,
    ...(operation.receipt ? { receipt: operation.receipt } : {}), requestId,
  });
}
