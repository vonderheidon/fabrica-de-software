import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { EventListQuery, EventPage, EventStreamQuery, ErrorResponse } from '#contracts';
import type { Storage } from '../../modules/storage/index.js';
import { httpLimits, type installSecurity } from '../security/index.js';
import { HttpError } from '../errors.js';

export function installEventRoutes(base: FastifyInstance, storage: Storage, security: ReturnType<typeof installSecurity>) {
  const app = base.withTypeProvider<TypeBoxTypeProvider>();
  app.get('/api/v1/events', { schema: { querystring: EventListQuery, response: { 200: EventPage, 400: ErrorResponse, 401: ErrorResponse, 409: ErrorResponse, 503: ErrorResponse } } }, async (request) => {
    const settings = storage.getSettings();
    const scope = createHash('sha256').update(JSON.stringify([settings.installationId, settings.accountId, request.query.operationId ?? null,
      request.query.projectId ?? null, request.query.attemptId ?? null, 'seq:asc:v2'])).digest('hex');
    let cursor = '0';
    let through: string | undefined;
    if (request.query.cursor) {
      const decoded = Buffer.from(request.query.cursor, 'base64url').toString('utf8');
      const parts = decoded.split(':');
      if (!/^(0|[1-9][0-9]{0,15})$/.test(parts[0] ?? '') || parts[1] !== scope || parts.length !== 3
        || !/^(0|[1-9][0-9]{0,15})$/.test(parts[2] ?? '')
        || Buffer.from(decoded).toString('base64url') !== request.query.cursor) {
        throw new HttpError(400, 'CURSOR_INVALID', 'Event cursor does not match the query scope.');
      }
      cursor = parts[0]!;
      through = parts[2]!;
    }
    const page = storage.getEvents({ ...request.query, cursor }, through);
    return { ...page, nextCursor: page.nextCursor ? Buffer.from(`${page.nextCursor}:${scope}:${page.eventCursor}`).toString('base64url') : null };
  });
  // Fastify's handler deadline includes streaming; allow the bounded SSE lifetime to finish first.
  app.get('/api/v1/events/stream', { handlerTimeout: httpLimits.streamLifetimeMs + httpLimits.handlerTimeoutMs, schema: { querystring: EventStreamQuery } }, async (request, reply) => {
    const header = request.headers['last-event-id'];
    const initialCursor = header ?? request.query.cursor ?? '0';
    let cursor = typeof initialCursor === 'string' ? initialCursor : '';
    const controller = new AbortController();
    const release = security.trackStream(request, controller);
    const deadline = globalThis.setTimeout(() => controller.abort(), httpLimits.streamLifetimeMs);
    const disconnect = () => controller.abort();
    reply.raw.once('close', disconnect);
    const cleanup = () => {
      clearTimeout(deadline);
      release();
      reply.raw.off('close', disconnect);
    };
    const body = Readable.from((async function* () {
      try {
        if (!/^(0|[1-9][0-9]{0,15})$/.test(cursor) || !Number.isSafeInteger(Number(cursor))) {
          yield 'event: resync\ndata: {"code":"EVENT_RESYNC_REQUIRED"}\n\n';
          return;
        }
        yield ': connected\n\n';
        while (!controller.signal.aborted) {
          const page = storage.getEvents({ ...request.query, cursor, limit: '100' });
          for (const event of page.items) {
            const data = JSON.stringify({ entity: { type: event.entityType, id: event.entityId }, revision: event.entityRevision, operationId: event.operationId, eventType: event.eventType,
              ...(event.projectId ? { projectId: event.projectId } : {}), ...(event.attemptId ? { attemptId: event.attemptId } : {}), facts: event.facts });
            yield `id: ${event.seq}\nevent: controller-event\ndata: ${data}\n\n`;
            cursor = event.seq;
          }
          if (page.hasMore) continue;
          cursor = page.eventCursor;
          yield ': heartbeat\n\n';
          await setTimeout(httpLimits.streamPollMs, undefined, { signal: controller.signal });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          request.log.warn({ code: 'EVENT_RESYNC_REQUIRED' }, 'Event stream closed');
          yield 'event: resync\ndata: {"code":"EVENT_RESYNC_REQUIRED"}\n\n';
        } else if (!(error instanceof Error && error.name === 'AbortError')) {
          request.log.warn({ code: 'EVENT_STREAM_CLOSED' }, 'Event stream stopped');
        }
      } finally {
        cleanup();
      }
    })(), { objectMode: false, highWaterMark: httpLimits.streamBufferBytes, signal: controller.signal });
    body.once('close', cleanup);
    return reply.type('text/event-stream').header('X-Accel-Buffering', 'no').send(body);
  });
}
