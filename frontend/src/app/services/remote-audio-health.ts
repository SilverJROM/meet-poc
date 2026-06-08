// Pure classification of per-remote-publisher inbound AUDIO health (R7).
//
// This module is deliberately framework-free: no Angular, no DOM. It consumes
// the structural shape of an SFU inbound audio track (a subset of
// SfuInboundTrackStats in meeting-sessions.service.ts) and returns a coarse
// health verdict so a silent remote is visible at a glance instead of buried
// in JSON.
//
// D1 (locked): concealmentRatio is diagnostic. It must not turn positive
// jitter-buffer emission into a broken/silent verdict.

export type RemoteAudioHealth = 'ok' | 'silent' | 'unknown';

// concealment ratio at/above which a remote is flagged 'silent' (>= inclusive).
export const SILENT_REMOTE_CONCEALMENT_RATIO = 0.5;

// emitted+concealed floor below which the sample is too early/short to trust
// (~1s of audio @ 48kHz). Below this we return 'unknown', never 'silent'.
export const SILENT_REMOTE_MIN_EMITTED_SAMPLES = 48000;

// Minimal structural input — intentionally NOT importing SfuInboundTrackStats so
// this stays pure/testable. SfuInboundTrackStats is structurally assignable to
// this (kind/bytesReceived/packetsReceived/jitterBufferEmittedCount/
// concealedSamples are all present there with the same nullability).
export interface RemoteAudioInboundStats {
  kind: string;
  bytesReceived: number | null;
  packetsReceived: number | null;
  jitterBufferEmittedCount: number | null;
  concealedSamples: number | null;
}

// concealedSamples / (concealedSamples + jitterBufferEmittedCount).
// Returns null when either operand is null OR the denominator is 0 — no
// divide-by-zero, no NaN.
export function concealmentRatio(track: RemoteAudioInboundStats): number | null {
  const concealed = track.concealedSamples;
  const emitted = track.jitterBufferEmittedCount;
  if (concealed === null || emitted === null) return null;
  const denominator = concealed + emitted;
  if (denominator === 0) return null;
  return concealed / denominator;
}

export function classifyRemoteAudioHealth(
  track: RemoteAudioInboundStats,
  // D2 HARDENER-ONLY: sourceMicSilent MUST NOT change the returned verdict — it
  // never flips 'ok'->'silent'. Accepted only for signature compatibility and
  // consumed solely by remoteAudioBadgeLabel below.
  _sourceMicSilent?: boolean | null,
): RemoteAudioHealth {
  if (!track || track.kind !== 'audio') return 'unknown';
  const concealed = track.concealedSamples;
  const emitted = track.jitterBufferEmittedCount;
  if (concealed === null || emitted === null) return 'unknown';
  const emittedTotal = concealed + emitted;
  // Below the floor (this also covers the 0+0 divide-by-zero case ⇒ 'unknown').
  if (emittedTotal < SILENT_REMOTE_MIN_EMITTED_SAMPLES) return 'unknown';
  if (emitted > 0) return 'ok';
  const ratio = concealed / emittedTotal;
  return ratio >= SILENT_REMOTE_CONCEALMENT_RATIO ? 'silent' : 'ok';
}

export function remoteAudioBadgeLabel(
  health: RemoteAudioHealth,
  sourceMicSilent?: boolean | null,
): string {
  if (health !== 'silent') return '';
  return sourceMicSilent === true ? 'SILENT REMOTE · silent at source' : 'SILENT REMOTE';
}
