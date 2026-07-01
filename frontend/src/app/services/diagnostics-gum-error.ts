import { isLastGumErrorCandidate } from './sfu-subscribe-failure-evidence.js';

export type DiagnosticsGumError = { name: string; message: string } | null;

export function diagnosticsGumError(error: unknown): DiagnosticsGumError {
  if (!isLastGumErrorCandidate(error)) return null;
  const value = error as { code?: unknown; name?: unknown; message?: unknown };
  const name = typeof value?.code === 'string'
    ? value.code
    : typeof value?.name === 'string' && value.name
      ? value.name
      : 'MediaError';
  const message = typeof value?.message === 'string' && value.message ? value.message : String(error || '');
  if (!message) return null;
  return { name, message };
}