import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { ClaimNotification, NotificationClaim, RecordNotificationReceipt, NotificationReceipt, EmptyQuery, ErrorResponse } from '#contracts';
import type { Storage } from '../../modules/storage/index.js';
import { notificationETag } from '../../modules/storage/index.js';
import { commandHeaders } from '../security/index.js';

export function installNotificationRoutes(instance: FastifyInstance, storage: Storage): void {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  const errors = { '4xx': ErrorResponse, '5xx': ErrorResponse };
  app.post('/api/v1/notifications/claims', { schema: { querystring: EmptyQuery, body: ClaimNotification, response: { 200: NotificationClaim, ...errors } } }, async (request, reply) => {
    const claim = storage.claimNotification({ ...commandHeaders(request), body: request.body });
    return reply.header('ETag', notificationETag(claim.dispatch_id, claim.revision)).send(claim);
  });
  app.post('/api/v1/notifications/receipts', { schema: { querystring: EmptyQuery, body: RecordNotificationReceipt, response: { 200: NotificationReceipt, ...errors } } }, async (request, reply) => {
    const receipt = storage.recordNotificationReceipt({ ...commandHeaders(request), body: request.body });
    return reply.header('ETag', notificationETag(receipt.dispatch_id, receipt.revision)).send(receipt);
  });
}
