import assert from 'node:assert/strict';
import {
  decideVoiceRecovery,
  sampleWindowHasVoiceEnergy,
  voiceRecoveryWindowExhaustedWhileStalled,
  VOICE_RECOVERY_MAX_ATTEMPTS_PER_WINDOW,
  type VoiceRecoverySample,
} from './remote-audio.service.js';

function samples(values: Array<[number, number]>, energy: 'active' | 'silent' = 'active'): VoiceRecoverySample[] {
  return values.map(([bytes, emitted], index) => ({
    bytes,
    emitted,
    audioLevel: energy === 'active' ? 0.02 : 0,
    totalAudioEnergy: energy === 'active' ? index * 0.1 : 0,
  }));
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
    ], 'silent'),
    attemptsThisWindow: 0,
    mutedAll: false,
  });
  assert.strictEqual(action, 'none', 'bytes-flat legitimate silence ⇒ none');
}

// PHASE-D — null energy is unmeasurable on Chrome 113+ inbound stats and must
// not suppress a bytes-climbing/emitted-flat stall.
{
  const fixture = samples([
    [1_000, 10],
    [2_000, 10],
    [3_000, 10],
    [4_000, 10],
  ]).map((sample) => ({ ...sample, audioLevel: null, totalAudioEnergy: null }));
  assert.strictEqual(sampleWindowHasVoiceEnergy(fixture), false, 'null-energy window has no direct voice-energy evidence');
  assert.strictEqual(decideVoiceRecovery({ samples: fixture, attemptsThisWindow: 0, mutedAll: false }), 'resume');
}

// PHASE-D — audioLevel=0 with null totalAudioEnergy is also unmeasurable for
// the stall decision; bytes up + emitted flat remains actionable.
{
  const fixture = samples([
    [1_000, 10],
    [2_000, 10],
    [3_000, 10],
    [4_000, 10],
  ]).map((sample) => ({ ...sample, audioLevel: 0, totalAudioEnergy: null }));
  assert.strictEqual(sampleWindowHasVoiceEnergy(fixture), false, 'zero-level/null-energy window has no direct voice-energy evidence');
  assert.strictEqual(decideVoiceRecovery({ samples: fixture, attemptsThisWindow: 0, mutedAll: false }), 'resume');
}

// CR-FIX-2 — measurable finite silence can still suppress a false recovery, but
// plain null/zero energy cannot override the bytes-climbing stall discriminator.
{
  const fixture: VoiceRecoverySample[] = [
    { bytes: 1_000, emitted: 10, audioLevel: 0.0001, totalAudioEnergy: 0.5 },
    { bytes: 2_000, emitted: 10, audioLevel: 0.0001, totalAudioEnergy: 0.5 },
    { bytes: 3_000, emitted: 10, audioLevel: 0.0001, totalAudioEnergy: 0.5 },
    { bytes: 4_000, emitted: 10, audioLevel: 0.0001, totalAudioEnergy: 0.5 },
  ];
  assert.strictEqual(sampleWindowHasVoiceEnergy(fixture), false, 'measured low-energy window has no voice energy');
  assert.strictEqual(decideVoiceRecovery({ samples: fixture, attemptsThisWindow: 0, mutedAll: false }), 'none');
}

// CR-FIX-4 — negative garbage stats cannot provide usable counters or fake voice energy.
{
  const negativeCounters = samples([
    [-1_000, 0],
    [2_000, 0],
    [3_000, 0],
    [4_000, 0],
  ]);
  assert.strictEqual(decideVoiceRecovery({ samples: negativeCounters, attemptsThisWindow: 0, mutedAll: false }), 'none');

  const negativeEnergy: VoiceRecoverySample[] = [
    { bytes: 1_000, emitted: 0, audioLevel: -0.2, totalAudioEnergy: -10 },
    { bytes: 2_000, emitted: 0, audioLevel: -0.1, totalAudioEnergy: -5 },
    { bytes: 3_000, emitted: 0, audioLevel: -0.1, totalAudioEnergy: -1 },
    { bytes: 4_000, emitted: 0, audioLevel: -0.1, totalAudioEnergy: -0.5 },
  ];
  assert.strictEqual(sampleWindowHasVoiceEnergy(negativeEnergy), false, 'negative audioLevel/energy is ignored as invalid');
  assert.strictEqual(decideVoiceRecovery({ samples: negativeEnergy, attemptsThisWindow: 0, mutedAll: false }), 'none');
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
  const fixture = samples([
    [1_000, 0],
    [2_000, 0],
    [3_000, 0],
    [4_000, 0],
  ]);
  const action = decideVoiceRecovery({
    samples: fixture,
    attemptsThisWindow: VOICE_RECOVERY_MAX_ATTEMPTS_PER_WINDOW,
    mutedAll: false,
  });
  assert.strictEqual(action, 'none', 'attempt cap reached ⇒ none');
  assert.strictEqual(
    voiceRecoveryWindowExhaustedWhileStalled({
      samples: fixture,
      attemptsThisWindow: VOICE_RECOVERY_MAX_ATTEMPTS_PER_WINDOW,
      mutedAll: false,
    }),
    true,
    'attempt cap with continuing bytes and voice energy keeps the voice-stall latch active',
  );
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
