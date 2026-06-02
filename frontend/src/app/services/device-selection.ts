// Pure decision: which audioInput deviceId should the picker show & persist?
//
// This module is deliberately framework-free: no Angular, no DOM, no
// MediaStreamTrack instance. It consumes a flat snapshot (the user's current
// choice, the live track's reported id, the enumerated device ids, and the
// persisted id) and returns the single deviceId that `selectedAudioId` should
// be set to — so the mic-persistence decision is unit-provable.
//
// WHY this exists (B2 / R2): the pre-B2 `syncSelectedAudioIdToTrack` adopted the
// track's reported deviceId UNCONDITIONALLY. A live capture track frequently
// reports a GENERIC id — '' (when getSettings has no deviceId) or 'default' /
// 'communications' — even though the user picked a concrete enumerated mic.
// `set('')` discarded the choice and `storeDevice('')` REMOVED the persisted
// key; `refreshDevices` then re-derived via `preferredDeviceId` and snapped the
// picker to 'default'/first-device. That is the reported "mic selection not
// persisting" snap-back. The rule below NEVER downgrades a still-present concrete
// choice to a generic/empty id, while still honouring a genuine switch to a
// different real device and the legitimate "device unplugged → fall back" path.

/**
 * Generic (non-concrete) audio device ids a capture track may report. These do
 * NOT identify a specific enumerated mic, so they must not clobber a still-present
 * concrete user choice.
 */
export function isGenericAudioDeviceId(id: string): boolean {
  return id === '' || id === 'default' || id === 'communications';
}

export interface ResolveSelectedAudioIdInput {
  /** What the user last selected (current selectedAudioId before this sync). */
  chosenId: string;
  /** mediaTrackDeviceId of the live capture track ('' / 'default' / a real hash). */
  trackReportedId: string;
  /** Device ids currently enumerated in audioInputs(). */
  enumeratedIds: string[];
  /** readStoredDevice(DEVICE_STORAGE.audioInput) ('' if none). */
  storedId: string;
}

/**
 * Locked rule (B2 scenarios P1-P7) — first matching branch wins:
 *  1. Adopt track id   — trackReportedId is concrete (!generic) AND enumerated ⇒ trackReportedId
 *                        (capture genuinely switched to a different real mic).
 *  2. Keep chosen      — else chosenId still enumerated ⇒ chosenId
 *                        (THE FIX: a generic/'' track report must NOT discard a present choice).
 *  3. Restore stored   — else storedId still enumerated ⇒ storedId (reload restore).
 *  4. Track fallback    — else trackReportedId enumerated (e.g. 'default') ⇒ trackReportedId
 *                        (legit fallback when the chosen device is genuinely gone).
 *  5. Last resort      — else 'default' if enumerated, else enumeratedIds[0], else ''.
 */
export function resolveSelectedAudioId(input: ResolveSelectedAudioIdInput): string {
  const { chosenId, trackReportedId, enumeratedIds, storedId } = input;

  // 1. Genuine switch/recovery to a different concrete, enumerated device.
  if (!isGenericAudioDeviceId(trackReportedId) && enumeratedIds.includes(trackReportedId)) {
    return trackReportedId;
  }

  // 2. THE FIX — never downgrade a still-present concrete choice to ''/generic.
  if (chosenId && enumeratedIds.includes(chosenId)) {
    return chosenId;
  }

  // 3. Reload restore from the persisted concrete id.
  if (storedId && enumeratedIds.includes(storedId)) {
    return storedId;
  }

  // 4. Legit 'default'-style fallback when the chosen device is gone.
  if (trackReportedId && enumeratedIds.includes(trackReportedId)) {
    return trackReportedId;
  }

  // 5. Last resort — mirror preferredDeviceId's tail.
  if (enumeratedIds.includes('default')) {
    return 'default';
  }
  return enumeratedIds[0] ?? '';
}
