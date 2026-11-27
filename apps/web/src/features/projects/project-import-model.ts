import type { ProjectImportRequest } from '#contracts';

/** Folder name suggested from the repository URL; empty when the URL has no recognizable repository name. */
export function suggestedFolderName(repositoryUrl: string): string {
  const trimmed = repositoryUrl.trim().replace(/[/\\]+$/, '');
  const name = /[/:]([^/:\\]+?)(?:\.git)?$/.exec(trimmed)?.[1] ?? '';
  const safe = [...name].map((character) => character.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(character) ? '-' : character).join('');
  return safe.replace(/[. ]+$/, '');
}

export function destinationPreview(projectsRoot: string, folderName: string): string {
  const separator = projectsRoot.includes('\\') ? '\\' : '/';
  const root = projectsRoot.replace(/[/\\]+$/, '');
  return `${root}${separator}${folderName}`;
}

/** Durable record of an import registration, kept in this browser session so a reload resumes the same operation. */
export type ProjectImportSession = { commandId: string; importId: string | null; body: ProjectImportRequest };

const sessionKey = 'factory.project-import.v1';

export function readProjectImportSession(): ProjectImportSession | null {
  try {
    const raw = window.sessionStorage.getItem(sessionKey);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const record = value as Record<string, unknown>;
    const body = record.body;
    if (typeof record.commandId !== 'string' || (record.importId !== null && typeof record.importId !== 'string') || typeof body !== 'object' || body === null) return null;
    const request = body as Record<string, unknown>;
    if (typeof request.name !== 'string' || typeof request.repository_url !== 'string' || typeof request.folder_name !== 'string') return null;
    if (request.base_branch !== undefined && typeof request.base_branch !== 'string') return null;
    return { commandId: record.commandId, importId: record.importId, body: { name: request.name, repository_url: request.repository_url, folder_name: request.folder_name, ...(typeof request.base_branch === 'string' ? { base_branch: request.base_branch } : {}) } };
  } catch {
    return null;
  }
}

export function writeProjectImportSession(session: ProjectImportSession): void {
  try { window.sessionStorage.setItem(sessionKey, JSON.stringify(session)); } catch { /* The in-memory state still tracks the operation. */ }
}

export function clearProjectImportSession(): void {
  try { window.sessionStorage.removeItem(sessionKey); } catch { /* Nothing to clear. */ }
}
