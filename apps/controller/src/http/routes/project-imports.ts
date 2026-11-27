import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  EmptyQuery, ErrorResponse, OperationAccepted, ProjectFolderInspection, ProjectFolderInspectionRequest, ProjectImportParams, ProjectImportRequest,
  ProjectImportView, ProjectParams,
} from '#contracts';
import type { ProjectImports } from '../../modules/projects/index.js';
import type { Storage } from '../../modules/storage/index.js';
import { commandHeaders, sendOperationAccepted } from '../security/index.js';

/** Registration by GitHub URL (clone into the Pasta do projeto) and the read-only folder inspection of Configurar projeto. */
export function installProjectImportRoutes(instance: FastifyInstance, imports: ProjectImports, storage: Storage): void {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  const errors = { '4xx': ErrorResponse, '5xx': ErrorResponse };
  app.post('/api/v1/projects/imports', { schema: { querystring: EmptyQuery, body: ProjectImportRequest, response: { 202: OperationAccepted, ...errors } } }, async (request, reply) => {
    const operation = await imports.start(request.body, commandHeaders(request).operationId);
    return sendOperationAccepted(reply, request.id, storage, operation.operation_id);
  });
  app.get('/api/v1/projects/imports/:importId', { schema: { params: ProjectImportParams, querystring: EmptyQuery, response: { 200: ProjectImportView, ...errors } } }, async (request, reply) => {
    const view = imports.get(request.params.importId);
    return reply.header('ETag', `"project-import:${view.id}:${view.revision}"`).send(view);
  });
  app.post('/api/v1/projects/:projectId/folder-inspection', { schema: { params: ProjectParams, querystring: EmptyQuery, body: ProjectFolderInspectionRequest,
    response: { 200: ProjectFolderInspection, ...errors } } }, async request => imports.inspectFolder(request.params.projectId, request.body));
}
