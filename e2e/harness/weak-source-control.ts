/**
 * Weak-source device control for B06 — faithful PipeWire attenuation
 *
 * This module documents and implements PipeWire-level source attenuation
 * on the dev_machine (.123) to simulate a soft-talker scenario.
 *
 * PRODUCTION CONTRACT:
 * When .123 (dev_machine) is reachable, this module will:
 * 1. SSH into .123 and run pactl commands to attenuate the microphone source
 * 2. Verify attenuation is applied before Chrome initializes getUserMedia
 * 3. Log the PipeWire source volume level for later comparison against measured loudness
 *
 * CURRENT STATE (scaffold):
 * .123 is not reachable in this session; unit-level tests verify the measurement
 * and logging infrastructure. The real integration awaits .123 availability.
 */

/**
 * Attenuation command for PipeWire (via pactl on .123)
 *
 * Contract:
 * - `pactl set-source-volume <source_name> <volume_percent>`
 * - e.g., `pactl set-source-volume alsa_input.usb.0-1.analog.stereo 60%`
 * - After this, Chrome's getUserMedia sees the attenuated input
 * - AGC is left ON (Chrome's default) so we observe real compensation behavior
 */
export interface WeakSourceConfig {
  /** SSH host for dev_machine (e.g., "192.168.1.123" or hostname) */
  host?: string;
  /** PipeWire source name (e.g., "alsa_input.usb.0-1.analog.stereo") */
  sourceId?: string;
  /** Volume percentage to set (0-100). E.g., 60 = 60% of normal. */
  volumePercent: number;
  /** Description for logging (e.g., "soft-talker scenario") */
  description: string;
}

/**
 * Logging record for one weak-source call
 */
export interface WeakSourceSession {
  /** Timestamp when attenuation was applied (UTC) */
  appliedAt: string;
  /** Volume percentage configured */
  configuredVolume: number;
  /** Description of the scenario */
  scenario: string;
  /** Measured loudness from receive-side recording (populated after call) */
  measuredLoudness?: {
    rms: number;
    lufs: number;
  };
  /** Reference loudness (normal-level baseline for comparison) */
  referenceLoudness?: {
    rms: number;
    lufs: number;
  };
  /** Computed loudness ratio: measured / reference */
  loudnessRatio?: number;
  /** AGC compensation factor (measured / configured) — indicates how much AGC boosted */
  agcCompensationFactor?: number;
  /** Notes on AGC behavior or measurement confidence */
  notes?: string;
}

/**
 * Weak-source control API
 *
 * LIVE IMPLEMENTATION (.123 reachable):
 * - applyAttenuation() would SSH to .123 and run pactl
 * - logSession() would write to a persistent log for the call
 *
 * SCAFFOLD (.123 not reachable):
 * - applyAttenuation() is a stub that documents what would happen
 * - logSession() writes to memory for unit test verification
 */
export class WeakSourceControl {
  private sessions: WeakSourceSession[] = [];
  private reachable = false;

  /**
   * Apply PipeWire attenuation on dev_machine
   *
   * SCAFFOLD: always returns false (not reachable)
   * LIVE: would SSH to .123 and run pactl, return true on success
   */
  async applyAttenuation(config: WeakSourceConfig): Promise<boolean> {
    // Scaffold: document what the real implementation would do
    console.log(
      `[B06 SCAFFOLD] Would attenuate ${config.sourceId || 'default-source'} to ${config.volumePercent}% on ${config.host || 'dev_machine'}`
    );
    console.log(
      `[B06 SCAFFOLD] Real implementation: pactl set-source-volume ${config.sourceId} ${config.volumePercent}%`
    );

    // For testing, allow mock reachability via environment variable
    if (process.env.B06_MOCK_REACHABLE === 'true') {
      this.reachable = true;
      return true;
    }

    return false;
  }

  /**
   * Log a weak-source session with optional measured loudness
   */
  logSession(session: WeakSourceSession): void {
    this.sessions.push(session);
    console.log(`[B06 SESSION] ${session.scenario} at ${session.appliedAt}`);
    console.log(`  Configured volume: ${session.configuredVolume}%`);
    if (session.measuredLoudness) {
      console.log(
        `  Measured: RMS ${session.measuredLoudness.rms.toFixed(4)}, LUFS ${session.measuredLoudness.lufs.toFixed(2)}`
      );
    }
    if (session.agcCompensationFactor !== undefined) {
      console.log(
        `  AGC compensation factor: ${session.agcCompensationFactor.toFixed(3)} (${Math.round((session.agcCompensationFactor - 1) * 100)}% boost)`
      );
    }
    if (session.notes) {
      console.log(`  Notes: ${session.notes}`);
    }
  }

  /**
   * Get all logged sessions (for testing)
   */
  getSessions(): WeakSourceSession[] {
    return [...this.sessions];
  }

  /**
   * Check if dev_machine was reachable during this session
   */
  isReachable(): boolean {
    return this.reachable;
  }

  /**
   * Clear sessions (for test cleanup)
   */
  clearSessions(): void {
    this.sessions = [];
  }
}

/**
 * Documentation for manual setup (when .123 is reachable but SSH not configured)
 *
 * Steps to manually attenuate on dev_machine before B06 call:
 * 1. SSH into .123: `ssh silverjrom@192.168.254.123`
 * 2. List PipeWire sources: `pactl list sources | grep -E "Source #|Name:|Volume"`
 * 3. Set volume to 60%: `pactl set-source-volume <SOURCE_ID> 60%`
 *    e.g., `pactl set-source-volume alsa_input.pci-0000_2d_00.4.analog-stereo 60%`
 * 4. Verify: `pactl get-source-volume <SOURCE_ID>` should show 60%
 * 5. Leave this attenuation active during the B06 call
 * 6. After the call, restore: `pactl set-source-volume <SOURCE_ID> 100%`
 *
 * Expected behavior during the call:
 * - Chrome's autoGainControl (enabled by default) will detect the weak input
 * - AGC will amplify the signal during playback, aiming for ~-23 LUFS
 * - receive-side recording will show boosted loudness even though source was attenuated
 * - Comparison: (measured LUFS with AGC) vs (reference LUFS normal level) reveals AGC boost
 */
