import { request } from 'node:http';
import type { ExecutionHost } from './index.js';
import { inheritedAnchor } from './adapters/maestri-omp/native.js';

type Reference = { workspaceId: string; terminalName: string; terminalId?: string };

/** Read the native host, never the validation Wire credentials or terminal screen. */
export async function observeTerminalAvailability(host: ExecutionHost, reference: Reference): Promise<'stopped' | 'running' | 'missing' | 'uncertain'> {
  try {
    const anchor = inheritedAnchor(host);
    if (anchor.workspaceId !== reference.workspaceId.toLowerCase() || !reference.terminalId ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reference.terminalId) ||
        !/^factory-[0-9a-f-]{36}$/i.test(reference.terminalName)) return 'uncertain';
    const body = await new Promise<string>((resolve, reject) => {
      const call = request({ socketPath: host.inheritedEnvironment.MAESTRI_PIPE, path: '/list', agent: false,
        headers: { 'X-Terminal-ID': anchor.terminalId, 'X-Workspace-ID': anchor.workspaceId } }, response => {
        if (response.statusCode !== 200) { response.resume(); reject(new Error('OBSERVATION_UNAVAILABLE')); return; }
        let bytes = 0; const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > 262144) call.destroy(new Error('OBSERVATION_TOO_LARGE'));
          else chunks.push(chunk);
        });
        response.on('error', reject);
        response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      });
      const timer = setTimeout(() => call.destroy(new Error('OBSERVATION_TIMEOUT')), 5000);
      call.on('close', () => clearTimeout(timer));
      call.on('error', reject); call.end();
    });
    const value: unknown = JSON.parse(body);
    if (!value || typeof value !== 'object' || !('terminals' in value) || !Array.isArray(value.terminals)) return 'uncertain';
    if (value.terminals.some((item: unknown) => !item || typeof item !== 'object' ||
        !('id' in item) || typeof item.id !== 'string' || !('name' in item) || typeof item.name !== 'string' ||
        !('running' in item) || typeof item.running !== 'boolean')) return 'uncertain';
    const named = value.terminals.filter((item: unknown) => item !== null && typeof item === 'object' &&
      'name' in item && item.name === reference.terminalName);
    const matches: unknown[] = value.terminals.filter((item: unknown) => item !== null && typeof item === 'object' &&
      'id' in item && typeof item.id === 'string' && item.id.toLowerCase() === reference.terminalId!.toLowerCase());
    // /list contains only peers connected to the anchor, so omission proves no absence.
    if (matches.length === 0 && named.length === 0) return 'uncertain';
    if (matches.length !== 1 || named.length !== 1) return 'uncertain';
    const terminal = matches[0] as Record<string, unknown>;
    if (terminal.name !== reference.terminalName || (terminal.environmentKind !== undefined && terminal.environmentKind !== 'local') ||
        (terminal.connection !== undefined && terminal.connection !== null)) return 'uncertain';
    return terminal.running === false ? 'stopped' : terminal.running === true ? 'running' : 'uncertain';
  } catch { return 'uncertain'; }
}

export async function observeStoppedTerminal(host: ExecutionHost, reference: Reference): Promise<boolean> {
  return await observeTerminalAvailability(host, reference) === 'stopped';
}
