// Pure decision: what should an in-call mic/camera toggle DO, given the current
// local stream + track state? And — when getUserMedia rejects with a hard-block —
// what non-blocking hint (if any) should the UI surface?
//
// This module is deliberately framework-free: no Angular, no DOM, no
// MediaStreamTrack instance. It consumes a flat snapshot and returns a plain
// discriminated action / hint string — so the "never stiff" contract is
// unit-provable.
//
// WHY this exists (B1 / RC): the pre-B1 `toggleMic` (`if (!track) return false`)
// and `toggleCamera` (`if (!stream) return false`) NO-OPPED when the device was
// off/absent at join — the control looked live but the action dead-ended. The
// rule below maps ABSENCE (no stream OR no track of kind) ALWAYS to `'acquire'`
// (re-ask permission + getUserMedia), never to a dead-end: there is deliberately
// NO 'noop'/'blocked'/'denied' member in the action union.

export type MediaToggleAction = 'acquire' | 'enable' | 'disable';

/**
 * Decide whether an in-call toggle should acquire a fresh track, or just flip the
 * existing track's `enabled` flag. Absence ALWAYS maps to `'acquire'` (never a
 * dead-end). The stream is the source of truth: a missing stream means we cannot
 * be holding a coherent track, so the incoherent `streamExists:false` +
 * `trackExists:true` input still resolves to `'acquire'` (defensive, never throws).
 */
export function resolveMediaToggleAction(input: {
  streamExists: boolean;
  trackExists: boolean;
  trackEnabled: boolean;
}): MediaToggleAction {
  if (!input.streamExists || !input.trackExists) return 'acquire';
  return input.trackEnabled ? 'disable' : 'enable';
}

/**
 * Map a getUserMedia rejection to a brief, non-blocking unblock hint — but ONLY
 * for the genuine hard-block case (`NotAllowedError`, or Chrome's legacy
 * `PermissionDeniedError` alias). Any other / null / undefined error returns
 * `null` so the generic status path handles it. The hint names the device and
 * points at the address-bar / site-settings unblock affordance, and deliberately
 * avoids permanence words ("disabled"/"forever") — the control stays live and the
 * next click re-attempts.
 */
export function permissionBlockHint(kind: 'audio' | 'video', err: unknown): string | null {
  const name = (err as { name?: string } | null | undefined)?.name;
  if (name !== 'NotAllowedError' && name !== 'PermissionDeniedError') return null;
  const device = kind === 'audio' ? 'microphone' : 'camera';
  return `Your browser is currently blocking ${device} access. Allow it from the address bar (or site settings), then click again to turn it on.`;
}
