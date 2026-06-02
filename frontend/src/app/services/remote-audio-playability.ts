// Pure decision: is remote audio actually playable RIGHT NOW?
//
// This module is deliberately framework-free: no Angular, no DOM, no AudioContext
// instance. It consumes a flat snapshot of the mixer state and returns a single
// boolean so the "remote audio blocked" banner decision is unit-provable.
//
// WHY this exists (B1 / R1.2 / NS2): the pre-B1 playability check looked ONLY at
// `element.paused`. A SUSPENDED AudioContext keeps the output element un-paused
// (play() resolves) yet a MediaStreamAudioSourceNode pulls ZERO samples while the
// context is not 'running' — so the host heard silence with `remoteAudioBlocked`
// stuck false and no recovery banner. The locked rule below makes a non-'running'
// context (when mixer sources exist) honestly NOT playable.

export type RemoteAudioContextState = AudioContextState | 'none';

export interface RemoteAudioPlayabilityInput {
  /** Mixer is the sole playout path when true (per-tile <audio> are silenced). */
  mixerEnabled: boolean;
  /** Live AudioContext.state, or 'none' before the graph exists. */
  contextState: RemoteAudioContextState;
  /** Number of MediaStreamAudioSourceNodes currently feeding the mixer. */
  sourcesCount: number;
  /** Whether the mixer output <audio> element is attached. */
  outputAttached: boolean;
  /** Whether the mixer output <audio> element is paused. */
  outputPaused: boolean;
  /** Whether every per-tile data-remote-audio <audio> element is un-paused. */
  perPeerAllUnpaused: boolean;
}

/**
 * Locked rule (B1 scenarios U1-U10):
 *  - mixerEnabled && sourcesCount > 0  ⇒ playable requires
 *      contextState === 'running' && outputAttached && !outputPaused && perPeerAllUnpaused
 *  - mixerEnabled && sourcesCount === 0 ⇒ return perPeerAllUnpaused (context state irrelevant)
 *  - !mixerEnabled ⇒ return perPeerAllUnpaused (context/output fields ignored)
 *
 * `remoteAudioBlocked` banner condition is `!evaluateRemoteAudioPlayability(...)`.
 */
export function evaluateRemoteAudioPlayability(input: RemoteAudioPlayabilityInput): boolean {
  const { mixerEnabled, contextState, sourcesCount, outputAttached, outputPaused, perPeerAllUnpaused } = input;

  if (mixerEnabled && sourcesCount > 0) {
    return contextState === 'running' && outputAttached && !outputPaused && perPeerAllUnpaused;
  }

  // Mixer with no sources, OR mixer disabled: the running-context requirement does
  // not apply; honesty tracks the per-peer elements exactly.
  return perPeerAllUnpaused;
}
