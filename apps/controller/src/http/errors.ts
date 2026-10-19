import type { FastifyError, FastifyInstance } from 'fastify';
import type { ErrorResponse } from '#contracts';
import { AttemptConflict, OperationError, StorageError } from '../modules/storage/index.js';

export class HttpError extends Error {
  constructor(readonly statusCode: number, readonly code: string, message: string) { super(message); }
}

function validationFieldErrors(error: FastifyError): NonNullable<ErrorResponse["field_errors"]> {
  if (!error.validation) return [];
  const fields = new Map<string, string>();
  for (const issue of error.validation) {
    const path = typeof issue.instancePath === 'string' ? issue.instancePath : '';
    const parameter = typeof issue.params === 'object' && issue.params !== null && 'missingProperty' in issue.params
      ? String(issue.params.missingProperty) : '';
    const field = [...path.split('/').filter(Boolean), parameter].filter(Boolean).join('.').replace(/^body\./, '');
    if (!field || !/^[A-Za-z0-9_.-]{1,256}$/.test(field)) continue;
    fields.set(field, 'Verifique este campo.');
  }
  return [...fields].map(([field, message]) => ({ field, message })).slice(0, 100);
}

function operationFieldErrors(error: FastifyError): NonNullable<ErrorResponse["field_errors"]> {
  if (!(error instanceof OperationError)) return [];
  const fieldByCode: Record<string, string> = {
    REGISTRATION_INVALID: 'name',
    ORIGIN_INVALID: 'source.location',
    BASE_BRANCH_INVALID: 'baseBranch',
  };
  const field = fieldByCode[error.code];
  return field ? [{ field, message: error.message }] : [];
}

export function installErrors(app: FastifyInstance): void {
  app.setErrorHandler<FastifyError>((error, request, reply) => {
    const status = error instanceof HttpError || error instanceof OperationError ? error.statusCode
      : error instanceof StorageError ? 503
      : error.code === 'FST_ERR_HANDLER_TIMEOUT' ? 503
      : error.statusCode && error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 500;
    const code = error instanceof HttpError || error instanceof OperationError ? error.code
      : error instanceof StorageError ? 'STORAGE_UNAVAILABLE'
      : error.code === 'FST_ERR_HANDLER_TIMEOUT' ? 'REQUEST_TIMEOUT'
      : status === 413 ? 'PAYLOAD_TOO_LARGE'
      : error.validation ? 'VALIDATION_FAILED' : status === 500 ? 'INTERNAL_ERROR' : 'REQUEST_REJECTED';
    // Never serialize error/cause, validation values, URL, headers or body.
    request.log[status >= 500 ? 'error' : 'warn']({ code, statusCode: status }, 'Request failed');
    const fieldErrors = validationFieldErrors(error);
    if (fieldErrors.length === 0) fieldErrors.push(...operationFieldErrors(error));
    return reply.code(status).send({
      code, message: error instanceof HttpError || error instanceof OperationError ? error.message
        : status >= 500 ? 'O controlador não conseguiu concluir a solicitação.' : 'O formato da solicitação é inválido.',
      request_id: request.id,
      ...(error instanceof AttemptConflict ? { resource: error.resource } : {}),
      ...(error instanceof OperationError && error.details?.facts ? { facts: error.details.facts } : {}),
      ...(error instanceof OperationError && error.details?.affected_requirements
        ? { affected_requirements: error.details.affected_requirements } : {}),
      ...(error instanceof OperationError && error.details?.recovery ? { recovery: error.details.recovery } : {}),
      ...(fieldErrors.length ? { field_errors: fieldErrors } : {}),
    } satisfies ErrorResponse);
  });
  app.setNotFoundHandler((request, reply) => reply.code(404).send({
    code: 'NOT_FOUND', message: 'O recurso solicitado não foi encontrado.', request_id: request.id,
  } satisfies ErrorResponse));
}
