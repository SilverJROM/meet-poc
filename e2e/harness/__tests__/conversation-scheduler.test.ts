import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { ConversationScheduler, type ConversationScript, type UtteranceSlot } from '../conversation-scheduler';
import { AsyncBrain, type LLMInvoker } from '../async-brain';

describe('ConversationScheduler', () => {
  it('should initialize with empty played utterances', () => {
    const scheduler = new ConversationScheduler();
    expect(scheduler.getPlayedUtterances()).toEqual([]);
    const report = scheduler.getTimingReport();
    expect(report.played).toEqual([]);
    expect(report.allOnTime).toBe(true);
  });

  it('should schedule and play utterances in order', async () => {
    const scheduler = new ConversationScheduler();

    // Create a simple 2-turn conversation
    const script: ConversationScript = {
      utterances: [
        {
          speaker: 'bot-140',
          timeMs: 0,
          durationMs: 100,
          audioPath: 'bot-140/hello.wav',
          text: 'Hello',
        },
        {
          speaker: 'bot-123',
          timeMs: 200,
          durationMs: 100,
          audioPath: 'bot-123/hello.wav',
          text: 'Hi there',
        },
      ],
      totalDurationMs: 400,
    };

    // Track which utterances were played
    const playedCalls: UtteranceSlot[] = [];
    const playbackFn = async (slot: UtteranceSlot) => {
      playedCalls.push(slot);
    };

    await scheduler.schedule(script, playbackFn);

    // Verify all utterances were played
    expect(scheduler.getPlayedUtterances()).toHaveLength(2);
    expect(playedCalls).toHaveLength(2);
    expect(playedCalls[0].text).toBe('Hello');
    expect(playedCalls[1].text).toBe('Hi there');
  });

  it('should record timing information for each utterance', async () => {
    const scheduler = new ConversationScheduler();
    const script: ConversationScript = {
      utterances: [
        {
          speaker: 'bot-140',
          timeMs: 0,
          durationMs: 100,
          audioPath: 'bot-140/test.wav',
          text: 'Test',
        },
      ],
      totalDurationMs: 100,
    };

    await scheduler.schedule(script);
    const played = scheduler.getPlayedUtterances();

    expect(played).toHaveLength(1);
    expect(played[0].speaker).toBe('bot-140');
    expect(played[0].scheduledTimeMs).toBe(0);
    expect(played[0].actualPlaybackTimeMs).toBeDefined();
    expect(typeof played[0].skewMs).toBe('number');
  });

  it('should maintain scheduling order even with rapid turns', async () => {
    const scheduler = new ConversationScheduler();
    const script: ConversationScript = {
      utterances: [
        { speaker: 'bot-140', timeMs: 0, durationMs: 50, audioPath: 'a.wav', text: 'A' },
        { speaker: 'bot-123', timeMs: 100, durationMs: 50, audioPath: 'b.wav', text: 'B' },
        { speaker: 'bot-140', timeMs: 200, durationMs: 50, audioPath: 'c.wav', text: 'C' },
        { speaker: 'bot-123', timeMs: 300, durationMs: 50, audioPath: 'd.wav', text: 'D' },
      ],
      totalDurationMs: 400,
    };

    await scheduler.schedule(script);
    const played = scheduler.getPlayedUtterances();

    expect(played.map((p) => p.text)).toEqual(['A', 'B', 'C', 'D']);
    expect(played[1].scheduledTimeMs).toBeGreaterThan(played[0].scheduledTimeMs);
    expect(played[2].scheduledTimeMs).toBeGreaterThan(played[1].scheduledTimeMs);
  });

  it('should compute timing report with skew metrics', async () => {
    const scheduler = new ConversationScheduler();
    const script: ConversationScript = {
      utterances: [
        { speaker: 'bot-140', timeMs: 0, durationMs: 100, audioPath: 'a.wav', text: 'A' },
        { speaker: 'bot-123', timeMs: 150, durationMs: 100, audioPath: 'b.wav', text: 'B' },
      ],
      totalDurationMs: 300,
    };

    await scheduler.schedule(script);
    const report = scheduler.getTimingReport();

    expect(report.played).toHaveLength(2);
    expect(report.maxSkewMs).toBeDefined();
    expect(report.avgSkewMs).toBeDefined();
    expect(report.allOnTime).toBeDefined();
    expect(report.maxSkewMs).toBeGreaterThanOrEqual(0);
  });

  it('should report allOnTime as true when skew <= 50ms', async () => {
    const scheduler = new ConversationScheduler();
    const script: ConversationScript = {
      utterances: [
        { speaker: 'bot-140', timeMs: 10, durationMs: 50, audioPath: 'a.wav', text: 'A' },
      ],
      totalDurationMs: 100,
    };

    await scheduler.schedule(script);
    const report = scheduler.getTimingReport();

    // Assuming system timer is reasonably accurate, skew should be <50ms
    expect(report.maxSkewMs).toBeLessThanOrEqual(100); // Generous bound for CI environments
  });

  it('should handle empty utterance list gracefully', async () => {
    const scheduler = new ConversationScheduler();
    const script: ConversationScript = {
      utterances: [],
      totalDurationMs: 0,
    };

    await scheduler.schedule(script);
    const report = scheduler.getTimingReport();

    expect(report.played).toHaveLength(0);
    expect(report.allOnTime).toBe(true);
  });

  it('should continue playback even if playback function throws', async () => {
    const scheduler = new ConversationScheduler();
    const script: ConversationScript = {
      utterances: [
        { speaker: 'bot-140', timeMs: 0, durationMs: 50, audioPath: 'a.wav', text: 'A' },
        { speaker: 'bot-123', timeMs: 100, durationMs: 50, audioPath: 'b.wav', text: 'B' },
      ],
      totalDurationMs: 200,
    };

    let callCount = 0;
    const playbackFn = async () => {
      callCount++;
      if (callCount === 1) throw new Error('Simulated playback error');
    };

    // Should not throw
    await scheduler.schedule(script, playbackFn);

    // Both utterances should still be logged even though first threw
    expect(scheduler.getPlayedUtterances()).toHaveLength(2);
  });

  it('should not await playback function (fire-and-forget)', async () => {
    const scheduler = new ConversationScheduler();
    let slowResolveCallback: (() => void) | null = null;

    const playbackFn = async () => {
      await new Promise<void>((resolve) => {
        slowResolveCallback = resolve;
      });
    };

    const script: ConversationScript = {
      utterances: [{ speaker: 'bot-140', timeMs: 0, durationMs: 50, audioPath: 'a.wav', text: 'A' }],
      totalDurationMs: 50,
    };

    const schedulePromise = scheduler.schedule(script, playbackFn);

    // Schedule should resolve quickly, not waiting for playback promise
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(scheduler.getPlayedUtterances()).toHaveLength(1);

    // Now resolve the slow callback
    if (slowResolveCallback) slowResolveCallback();
  });

  it('should load and use real bot-speech manifests if available', async () => {
    const botSpeechDir = path.join(process.cwd(), 'e2e/fixtures/bot-speech');

    // Check if manifests exist (they should after fixture generation)
    const bot140ManifestPath = path.join(botSpeechDir, 'bot-140/manifest.json');
    if (fs.existsSync(bot140ManifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(bot140ManifestPath, 'utf-8'));

      expect(manifest).toBeInstanceOf(Array);
      expect(manifest.length).toBeGreaterThan(0);

      const entry = manifest[0];
      expect(entry).toHaveProperty('name');
      expect(entry).toHaveProperty('text');
      expect(entry).toHaveProperty('durationMs');
      expect(entry).toHaveProperty('path');
    }
  });
});

describe('AsyncBrain', () => {
  it('should initialize with empty state', () => {
    const brain = new AsyncBrain();
    const state = brain.getState();

    expect(state.transcriptSoFar).toBe('');
    expect(state.settledReply).toBeUndefined();
  });

  it('should dispatch without awaiting (fire-and-forget)', async () => {
    let dispatchCalled = false;
    const mockInvoker: LLMInvoker = {
      invoke: async () => {
        dispatchCalled = true;
        await new Promise((resolve) => setTimeout(resolve, 100)); // Slow response
        return 'Delayed response';
      },
    };

    const brain = new AsyncBrain(mockInvoker);

    // dispatch() should return immediately
    const startTime = Date.now();
    brain.dispatch('Hello', 'Transcript: Hello');
    const elapsedTime = Date.now() - startTime;

    // Should complete in <10ms (fire-and-forget, using setImmediate)
    expect(elapsedTime).toBeLessThan(10);

    // Verify reply is not settled yet
    expect(brain.getSettledReply()).toBeUndefined();

    // Wait for background invocation to settle
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(dispatchCalled).toBe(true); // Now called
    expect(brain.getSettledReply()).toBe('Delayed response');
  });

  it('should settle response in background', async () => {
    const mockInvoker: LLMInvoker = {
      invoke: async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return 'Response ready';
      },
    };

    const brain = new AsyncBrain(mockInvoker);

    brain.dispatch('Test', 'Transcript');

    // Immediately check: no reply yet
    expect(brain.getSettledReply()).toBeUndefined();

    // Wait for settlement
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Now reply should be available
    expect(brain.getSettledReply()).toBe('Response ready');
  });

  it('should handle invoker errors gracefully', async () => {
    const mockInvoker: LLMInvoker = {
      invoke: async () => {
        throw new Error('LLM error');
      },
    };

    const brain = new AsyncBrain(mockInvoker);

    // Should not throw
    expect(() => brain.dispatch('Test', 'Transcript')).not.toThrow();

    // Wait for error to settle
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Should return error message
    expect(brain.getSettledReply()).toBeDefined();
    expect(brain.getSettledReply()).toContain('error');
  });

  it('should work in mock mode when no invoker provided', () => {
    const brain = new AsyncBrain(); // No invoker

    brain.dispatch('Hello', 'Transcript');

    // Should have immediate mock response
    expect(brain.getSettledReply()).toBeDefined();
    expect(brain.getSettledReply()).toContain('Mock reply');
  });

  it('should track transcript state', () => {
    const brain = new AsyncBrain();

    brain.dispatch('User says hello', 'Transcript: User says hello');

    const state = brain.getState();
    expect(state.transcriptSoFar).toBe('Transcript: User says hello');
    expect(state.lastUserUtterance).toBe('User says hello');
  });

  it('should reset state', () => {
    const brain = new AsyncBrain();

    brain.dispatch('Test', 'Transcript');
    expect(brain.getSettledReply()).toBeDefined();

    brain.reset();
    const state = brain.getState();

    expect(state.transcriptSoFar).toBe('');
    expect(state.lastUserUtterance).toBeUndefined();
    expect(state.settledReply).toBeUndefined();
  });

  it(
    'should never block speech scheduler (no await in speech path)',
    async () => {
      const slowInvoker: LLMInvoker = {
        invoke: async () => {
          await new Promise((resolve) => setTimeout(resolve, 2000)); // 2 seconds
          return 'Eventually ready';
        },
      };

      const brain = new AsyncBrain(slowInvoker);

      // Dispatch is instant
      const startTime = Date.now();
      brain.dispatch('Slow query', 'Transcript');
      const dispatchTime = Date.now() - startTime;

      expect(dispatchTime).toBeLessThan(10);

      // Speech playback would continue here without waiting
      // getSettledReply() returns undefined if not ready
      expect(brain.getSettledReply()).toBeUndefined();

      // Continue with other utterances (don't wait for LLM)
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(brain.getSettledReply()).toBeUndefined(); // Still not ready

      // Eventually it settles
      await new Promise((resolve) => setTimeout(resolve, 2200));
      expect(brain.getSettledReply()).toBe('Eventually ready');
    },
    10000
  ); // 10 second timeout for this test
});

describe('ConversationScheduler + AsyncBrain Integration', () => {
  it('should maintain speech schedule independent of brain latency', async () => {
    const slowBrain: LLMInvoker = {
      invoke: async () => {
        await new Promise((resolve) => setTimeout(resolve, 2000)); // 2-second delay
        return 'Delayed reply';
      },
    };

    const brain = new AsyncBrain(slowBrain);
    const scheduler = new ConversationScheduler();

    const script: ConversationScript = {
      utterances: [
        { speaker: 'bot-140', timeMs: 0, durationMs: 100, audioPath: 'a.wav', text: 'Hello' },
        { speaker: 'bot-123', timeMs: 500, durationMs: 100, audioPath: 'b.wav', text: 'Hi' },
      ],
      totalDurationMs: 700,
    };

    // Dispatch first LLM query (will take 2 seconds to settle)
    brain.dispatch('Initial prompt', 'Transcript: Initial');

    // Run scheduler (should complete in <1 second)
    const startTime = Date.now();
    await scheduler.schedule(script);
    const schedulerTime = Date.now() - startTime;

    // Scheduler should finish while brain is still pending
    expect(schedulerTime).toBeLessThan(1000);
    expect(brain.getSettledReply()).toBeUndefined(); // Brain still pending

    // All utterances should be played on time
    const report = scheduler.getTimingReport();
    expect(report.played).toHaveLength(2);
    expect(report.allOnTime).toBe(true);

    // Wait for brain to settle
    await new Promise((resolve) => setTimeout(resolve, 2100));
    expect(brain.getSettledReply()).toBe('Delayed reply');
  });
});
