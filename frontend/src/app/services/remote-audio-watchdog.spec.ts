import assert from 'node:assert/strict';
import {
  decideVoiceRecovery,
  VOICE_RECOVERY_MAX_ATTEMPTS_PER_WINDOW,
  type VoiceRecoverySample,
} from './remote-audio.service.js';

function samples(values: Array<[number, number]>): VoiceRecoverySample[] {
  return values.map(([bytes, emitted]) => ({ bytes, emitted }));
}

// R2-U1 — receiving bytes while emitted stays flat escalates from resume.
{
  const action = decideVoiceRecovery({
    samples: samples([
      [1_000, 0],
      [2_000, 0],
      [3_000, 0],
      [4_000, 0],
    ]),
    attemptsThisWindow: 0,
    mutedAll: false,
  });
  assert.strictEqual(action, 'resume', 'receiving-but-emitted-flat first remediation ⇒ resume');
}

// R2-U2 — the ladder escalates one step per capped attempt window.
{
  const fixture = samples([
    [1_000, 9],
    [2_000, 9],
    [3_000, 9],
    [4_000, 9],
  ]);
  assert.strictEqual(decideVoiceRecovery({ samples: fixture, attemptsThisWindow: 1, mutedAll: false }), 'kickstart');
  assert.strictEqual(decideVoiceRecovery({ samples: fixture, attemptsThisWindow: 2, mutedAll: false }), 'replay');
  assert.strictEqual(decideVoiceRecovery({ samples: fixture, attemptsThisWindow: 3, mutedAll: false }), 'rebuild');
}

// R2-U3 — genuinely silent speaker: bytes are not climbing, so never recover.
{
  const action = decideVoiceRecovery({
    samples: samples([
      [5_000, 10],
      [5_000, 10],
      [5_000, 10],
      [5_000, 10],
    ]),
    attemptsThisWindow: 0,
    mutedAll: false,
  });
  assert.strictEqual(action, 'none', 'bytes-flat legitimate silence ⇒ none');
}

// R2-U4 — mute-all is intentionally silent and must never trigger the ladder.
{
  const action = decideVoiceRecovery({
    samples: samples([
      [1_000, 0],
      [2_000, 0],
      [3_000, 0],
      [4_000, 0],
    ]),
    attemptsThisWindow: 0,
    mutedAll: true,
  });
  assert.strictEqual(action, 'none', 'mutedAll true ⇒ none');
}

// R2-U5 — emitted climbing means the outcome is healthy; no remediation/thrash.
{
  const action = decideVoiceRecovery({
    samples: samples([
      [1_000, 10],
      [2_000, 11],
      [3_000, 12],
      [4_000, 13],
    ]),
    attemptsThisWindow: 2,
    mutedAll: false,
  });
  assert.strictEqual(action, 'none', 'emitted climbing ⇒ none/reset owned by room adapter');
}

// R2-U6 — attempt cap is respected even if the silent-but-receiving signature remains.
{
  const action = decideVoiceRecovery({
    samples: samples([
      [1_000, 0],
      [2_000, 0],
      [3_000, 0],
      [4_000, 0],
    ]),
    attemptsThisWindow: VOICE_RECOVERY_MAX_ATTEMPTS_PER_WINDOW,
    mutedAll: false,
  });
  assert.strictEqual(action, 'none', 'attempt cap reached ⇒ none');
}

// R2-U7 — fewer than the rolling window size is inconclusive and silent.
{
  const action = decideVoiceRecovery({
    samples: samples([
      [1_000, 0],
      [2_000, 0],
      [3_000, 0],
    ]),
    attemptsThisWindow: 0,
    mutedAll: false,
  });
  assert.strictEqual(action, 'none', 'short window ⇒ none');
}

console.log('remote-audio-watchdog: all assertions passed');
