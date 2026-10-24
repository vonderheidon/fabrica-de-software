import { createHash } from 'node:crypto';
import { isAbsolute, win32 } from 'node:path';
import type { PublicationTargetIntent } from '#contracts';

export function publicationTargetPath(target: PublicationTargetIntent): string {
  return target.selection.kind === 'existing_clone' ? target.selection.path : target.selection.destination;
}

export function isLocalAbsoluteTargetPath(path: string): boolean {
  if (path.length > 32_768 || /[\x00-\x1f\x7f]/.test(path) || path.split(/[\\/]+/).some(part => part === '.' || part === '..')) return false;
  if (process.platform === 'win32') {
    if (!/^[a-z]:[\\/]/i.test(path) || !win32.isAbsolute(path)) return false;
    const parts = path.slice(3).split(/[\\/]+/).filter(Boolean);
    return parts.every(part => !/[<>:"|?*]/.test(part) && !/[. ]$/.test(part) &&
      !/^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part));
  }
  return isAbsolute(path) && !path.startsWith('//');
}

export function publicationTargetHash(target: PublicationTargetIntent | null): string | null {
  if (target === null) return null;
  const selection = target.selection.kind === 'existing_clone'
    ? { kind: 'existing_clone', path: target.selection.path }
    : { kind: 'clone', destination: target.selection.destination };
  return createHash('sha256').update(JSON.stringify({
    format_version: 1, repository_id: target.repository_id, selection,
  })).digest('hex');
}
