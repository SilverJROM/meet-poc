import assert from 'node:assert/strict';
import {
  deriveOutboundAudioFields,
  MIC_SILENCE_LEVEL_THRESHOLD,
  audioCaptureConstraints,
  unappliedAudioProcessing,
} from './mic-energy.js';

// SC-1 / TT-A — active mic with audible signal
{
  const result = deriveOutboundAudioFields({
    audioSource: { audioLevel: 0.42, totalAudioEnergy: 12.7 },
    hasLiveAudioTrack: true,
    micEnabled: true,
  });
  assert.strictEqual(result.outboundAudioLevel, 0.42, 'level passed through raw');
  assert.strictEqual(result.outboundAudioEnergy, 12.7, 'energy passed through raw');
  assert.strictEqual(result.micSilent, false, 'audible signal is not silent');
}

// SC-2 / TT-C — track disabled (muted via track.enabled = false)
{
  const result = deriveOutboundAudioFields({
    audioSource: { audioLevel: 0.0, totalAudioEnergy: 0.0 },
    hasLiveAudioTrack: true,
    micEnabled: false,
  });
  assert.strictEqual(result.micSilent, true, 'muted track is silent from track state');
  assert.ok(result.outboundAudioLevel !== null, 'level not nulled when source present');
  assert.ok((result.outboundAudioLevel as number) <= 0.01, 'level at/below threshold');
  assert.strictEqual(result.outboundAudioLevel, 0, 'raw level 0 preserved');
}

// SC-3 / TT-B — enabled but near-zero energy (silent mic at source)
{
  const result = deriveOutboundAudioFields({
    audioSource: { audioLevel: 0.005, totalAudioEnergy: 0.0002 },
    hasLiveAudioTrack: true,
    micEnabled: true,
  });
  assert.strictEqual(result.micSilent, true, 'audioLevel below 0.01 threshold -> silent');
  assert.strictEqual(result.outboundAudioLevel, 0.005, 'raw level stored regardless of silence');
  assert.strictEqual(result.outboundAudioEnergy, 0.0002, 'raw energy stored');
}

// SC-4 / TT-E — no live audio track: all null, no throw
{
  const input = { audioSource: null, hasLiveAudioTrack: false, micEnabled: false };
  assert.doesNotThrow(() => deriveOutboundAudioFields(input), 'must not throw on null source');
  const result = deriveOutboundAudioFields(input);
  assert.strictEqual(result.outboundAudioLevel, null);
  assert.strictEqual(result.outboundAudioEnergy, null);
  assert.strictEqual(result.micSilent, null);
}

// TT-D — live + enabled but no media-source audio stat: graceful absence (all null)
{
  const result = deriveOutboundAudioFields({
    audioSource: null,
    hasLiveAudioTrack: true,
    micEnabled: true,
  });
  assert.strictEqual(result.outboundAudioLevel, null, 'no source -> null level');
  assert.strictEqual(result.outboundAudioEnergy, null, 'no source -> null energy');
  assert.strictEqual(result.micSilent, null, 'graceful absence is not a silence claim');
}

// SC-5 — micSilent derives from instantaneous audioLevel, NOT cumulative totalAudioEnergy
{
  const resultA = deriveOutboundAudioFields({
    audioSource: { audioLevel: 0.5, totalAudioEnergy: 0 },
    hasLiveAudioTrack: true,
    micEnabled: true,
  });
  const resultB = deriveOutboundAudioFields({
    audioSource: { audioLevel: 0.005, totalAudioEnergy: 9999 },
    hasLiveAudioTrack: true,
    micEnabled: true,
  });
  assert.strictEqual(resultA.micSilent, false, 'level 0.5 above threshold, energy 0 irrelevant');
  assert.strictEqual(resultB.micSilent, true, 'level 0.005 below threshold, cumulative energy irrelevant');
}

// Partial stats — source present but audioLevel null: micSilent null, pass-through nulls
{
  const result = deriveOutboundAudioFields({
    audioSource: { audioLevel: null, totalAudioEnergy: null },
    hasLiveAudioTrack: true,
    micEnabled: true,
  });
  assert.strictEqual(result.outboundAudioLevel, null);
  assert.strictEqual(result.outboundAudioEnergy, null);
  assert.strictEqual(result.micSilent, null, 'null audioLevel -> cannot decide silence');
}

// Threshold constant sanity
{
  assert.strictEqual(MIC_SILENCE_LEVEL_THRESHOLD, 0.01, 'threshold is 0.01');
}

// B2 RF1-S1 — audioCaptureConstraints requests EC+NS+AGC gracefully (no {exact})
{
  const c = audioCaptureConstraints(true) as MediaTrackConstraints;
  assert.deepStrictEqual(c.echoCancellation, { ideal: true }, 'EC is {ideal:true}');
  assert.deepStrictEqual(c.noiseSuppression, { ideal: true }, 'NS is {ideal:true}');
  assert.deepStrictEqual(c.autoGainControl, { ideal: true }, 'AGC is {ideal:true}');
  assert.strictEqual('exact' in (c.echoCancellation as object), false, 'EC has no exact');
  assert.strictEqual('exact' in (c.noiseSuppression as object), false, 'NS has no exact');
  assert.strictEqual('exact' in (c.autoGainControl as object), false, 'AGC has no exact');
  assert.strictEqual('deviceId' in c, false, 'no deviceId when none given');

  const withDev = audioCaptureConstraints(true, 'dev-123') as MediaTrackConstraints;
  assert.deepStrictEqual(withDev.deviceId, { exact: 'dev-123' }, 'deviceId {exact}');
  assert.deepStrictEqual(withDev.echoCancellation, { ideal: true }, 'EC still {ideal} with device');
  assert.deepStrictEqual(withDev.noiseSuppression, { ideal: true }, 'NS still {ideal} with device');
  assert.deepStrictEqual(withDev.autoGainControl, { ideal: true }, 'AGC still {ideal} with device');

  assert.strictEqual(audioCaptureConstraints(false), false, 'audio:false ⇒ false');
  assert.strictEqual('deviceId' in (audioCaptureConstraints(true, undefined) as object), false, 'undefined device ⇒ no deviceId');
  assert.strictEqual('deviceId' in (audioCaptureConstraints(true, '') as object), false, 'empty device ⇒ no deviceId');
}

// B2 RF1-S2 — unappliedAudioProcessing truth table
{
  assert.deepStrictEqual(
    unappliedAudioProcessing({ echoCancellation: true, noiseSuppression: true, autoGainControl: true }),
    [],
    'all true ⇒ []',
  );
  assert.deepStrictEqual(unappliedAudioProcessing({ echoCancellation: false }), ['echoCancellation'], 'EC false');
  assert.deepStrictEqual(unappliedAudioProcessing({ noiseSuppression: false }), ['noiseSuppression'], 'NS false');
  assert.deepStrictEqual(unappliedAudioProcessing({ autoGainControl: false }), ['autoGainControl'], 'AGC false');
  assert.deepStrictEqual(unappliedAudioProcessing({}), [], 'all absent ⇒ []');
  assert.deepStrictEqual(
    unappliedAudioProcessing({ echoCancellation: false, noiseSuppression: false, autoGainControl: false }),
    ['echoCancellation', 'noiseSuppression', 'autoGainControl'],
    'all false ⇒ all 3 in deterministic order',
  );
  // undefined value NOT flagged (browsers omit unsupported keys)
  assert.deepStrictEqual(unappliedAudioProcessing({ echoCancellation: undefined }), [], 'undefined ⇒ not flagged');
  // strict === false only: 0 / '' (non-boolean falsy) NOT flagged
  assert.deepStrictEqual(unappliedAudioProcessing({ echoCancellation: 0 as any }), [], '0 ⇒ not flagged (not strict false)');
}

console.log('mic-energy: all assertions passed');
