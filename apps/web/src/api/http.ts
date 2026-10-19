import type { ErrorResponse, SessionResponse } from '#contracts';
import { assertConfigurationBody, configurationBodyLimitMessage } from './configuration-body.js';
import { operatorErrorMessage } from '../app/operator-language.js';

export class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly requestId: string | null, readonly fieldErrors: readonly { field: string; message: string }[], readonly resource: { type: string; id: string } | null, readonly operationId: string | null, readonly facts: Readonly<Record<string, string | number | boolean | null>> | null, readonly affectedRequirements: readonly string[] = [], readonly recovery: string | null = null) {
    super(message);
    this.name = 'HttpError';
  }
}

let csrfToken: string | null = null;
let bootstrapPromise: Promise<void> | null = null;
let instanceId: string | null = null;

export function getControllerInstanceId(): string | null { return instanceId; }

function notifySessionChange(): void {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new Event('factory-controller-resync'));
  }
}

async function createSession(): Promise<void> {
  if (bootstrapPromise) return bootstrapPromise;
  bootstrapPromise = (async () => {
    const response = await fetch('/api/v1/session', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-Factory-Client': 'web' },
      body: '{}',
    });
    if (!response.ok) throw await toHttpError(response);
    const session = (await response.json()) as SessionResponse;
    csrfToken = session.csrf_token;
    const changed = instanceId !== null && instanceId !== session.instance_id;
    instanceId = session.instance_id;
    if (changed) notifySessionChange();
  })().finally(() => { bootstrapPromise = null; });
  return bootstrapPromise;
}

async function toHttpError(response: Response): Promise<HttpError> {
  let body: ErrorResponse | null = null;
  try { body = (await response.json()) as ErrorResponse; } catch { /* Keep the transport error generic. */ }
  const code = body?.code ?? 'HTTP_ERROR';
  const message = operatorErrorMessage(code, body?.message ?? '', response.status);
  return new HttpError(response.status, code, message, body?.request_id ?? null, body?.field_errors ?? [], body?.resource ?? null, body?.operation_id ?? null, body?.facts ?? null, body?.affected_requirements ?? [], body?.recovery ?? null);
}

async function rejectExpiredMutation(response: Response): Promise<never> {
  const failure = await toHttpError(response);
  csrfToken = null;
  try { await createSession(); notifySessionChange(); }
  catch (error: unknown) { failure.cause = error; }
  // Renewal must not replace the command's correlation or replay its effects.
  throw failure;
}

export interface JsonResponse<T> { data: T; etag: string | null }

export async function requestJsonWithMetadata<T>(path: `/api/v1/${string}`, init: RequestInit = {}): Promise<JsonResponse<T>> {
  const method = (init.method ?? 'GET').toUpperCase();
  const isRead = method === 'GET' || method === 'HEAD';
  const configurationSave = method === 'PUT' && (path === '/api/v1/settings' || /^\/api\/v1\/projects\/[^/]+\/configuration$/.test(path));
  if (configurationSave && typeof init.body === 'string') assertConfigurationBody(init.body);
  if (csrfToken === null) await createSession();

  const send = (): Promise<Response> => {
    const headers = new Headers(init.headers);
    if (init.body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    if (csrfToken !== null) headers.set('X-CSRF-Token', csrfToken);
    return fetch(path, { ...init, headers, credentials: 'same-origin', cache: 'no-store' });
  };

  let response = await send();
  if (response.status === 401 && isRead) {
    csrfToken = null;
    await createSession();
    notifySessionChange();
    response = await send();
  } else if (response.status === 401) {
    return rejectExpiredMutation(response);
  }
  if (response.status === 403) throw await toHttpError(response);
  if (!response.ok) {
    const error = await toHttpError(response);
    if (configurationSave && response.status === 413) error.message = configurationBodyLimitMessage;
    throw error;
  }
  if (response.status === 204) return { data: undefined as T, etag: response.headers.get('ETag') };
  return { data: (await response.json()) as T, etag: response.headers.get('ETag') };
}

export async function requestJson<T>(path: `/api/v1/${string}`, init: RequestInit = {}): Promise<T> {
  return (await requestJsonWithMetadata<T>(path, init)).data;
}

export async function requestText(path: `/api/v1/${string}`, init: RequestInit = {}): Promise<string> {
  const method = (init.method ?? 'GET').toUpperCase();
  const isRead = method === 'GET' || method === 'HEAD';
  if (csrfToken === null) await createSession();
  const send = (): Promise<Response> => {
    const headers = new Headers(init.headers);
    if (csrfToken !== null) headers.set('X-CSRF-Token', csrfToken);
    return fetch(path, { ...init, headers, credentials: 'same-origin', cache: 'no-store' });
  };
  let response = await send();
  if (response.status === 401 && isRead) {
    csrfToken = null;
    await createSession();
    notifySessionChange();
    response = await send();
  } else if (response.status === 401) {
    return rejectExpiredMutation(response);
  }
  if (!response.ok) throw await toHttpError(response);
  return response.text();
}
