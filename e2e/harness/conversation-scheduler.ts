// Deterministic conversation scheduler: fixed-clock speech playback independent of LLM latency.
// Never waits for async brain; all speech triggers happen on wall-clock schedule.

export interface UtteranceSlot {
  speaker: 'bot-140' | 'bot-123';
  timeMs: number; // Absolute ms from conversation start
  durationMs: number; // Expected audio duration
  audioPath: string; // Path to pre-generated WAV file
  text: string; // Transcribed content for later verification
}

export interface ConversationScript {
  utterances: UtteranceSlot[];
  totalDurationMs: number;
}

export interface PlayedUtterance {
  speaker: 'bot-140' | 'bot-123';
  scheduledTimeMs: number;
  actualPlaybackTimeMs: number;
  audioPath: string;
  text: string;
  skewMs: number; // |actual - scheduled|
}

export interface TimingReport {
  totalScheduledMs: number;
  totalActualMs: number;
  maxSkewMs: number;
  avgSkewMs: number;
  played: PlayedUtterance[];
  allOnTime: boolean; // true if all skew <= 50ms
}

export class ConversationScheduler {
  private playedUtterances: PlayedUtterance[] = [];
  private startTimeMs = 0;

  /**
   * Run the conversation scheduler on the fixed clock.
   * All playback happens synchronously with scheduled times; does not await LLM.
   */
  async schedule(script: ConversationScript, playbackFn?: (slot: UtteranceSlot) => Promise<void>): Promise<void> {
    this.playedUtterances = [];
    this.startTimeMs = Date.now();

    // Default playback: no-op (test-only, real calls will inject WebRTC playback)
    const play = playbackFn || (async () => {});

    for (const slot of script.utterances) {
      // Calculate wall-clock time when this utterance should play
      const targetTimeMs = this.startTimeMs + slot.timeMs;

      // Wait until it's time to play (but never block on LLM)
      const now = Date.now();
      if (now < targetTimeMs) {
        await new Promise((resolve) => setTimeout(resolve, targetTimeMs - now));
      }

      // Record the actual playback time
      const actualPlaybackTimeMs = Date.now();
      const skewMs = Math.abs(actualPlaybackTimeMs - targetTimeMs);

      // Trigger playback (fire-and-forget; don't await)
      play(slot).catch(() => {
        // Silence errors; scheduler continues regardless
      });

      // Log the utterance
      this.playedUtterances.push({
        speaker: slot.speaker,
        scheduledTimeMs: slot.timeMs,
        actualPlaybackTimeMs: actualPlaybackTimeMs - this.startTimeMs,
        audioPath: slot.audioPath,
        text: slot.text,
        skewMs,
      });
    }
  }

  getPlayedUtterances(): PlayedUtterance[] {
    return [...this.playedUtterances];
  }

  getTimingReport(): TimingReport {
    if (this.playedUtterances.length === 0) {
      return {
        totalScheduledMs: 0,
        totalActualMs: 0,
        maxSkewMs: 0,
        avgSkewMs: 0,
        played: [],
        allOnTime: true,
      };
    }

    const skews = this.playedUtterances.map((u) => u.skewMs);
    const maxSkewMs = Math.max(...skews);
    const avgSkewMs = skews.reduce((a, b) => a + b, 0) / skews.length;
    const totalScheduledMs = this.playedUtterances[this.playedUtterances.length - 1].scheduledTimeMs +
      (this.playedUtterances[this.playedUtterances.length - 1].actualPlaybackTimeMs -
        this.playedUtterances[this.playedUtterances.length - 1].scheduledTimeMs);
    const totalActualMs =
      this.playedUtterances[this.playedUtterances.length - 1].actualPlaybackTimeMs;

    return {
      totalScheduledMs,
      totalActualMs,
      maxSkewMs,
      avgSkewMs,
      played: [...this.playedUtterances],
      allOnTime: maxSkewMs <= 50,
    };
  }
}
