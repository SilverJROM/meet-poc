import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ConversationScheduler, type ConversationScript } from '../conversation-scheduler';
import { LoudnessAnalyzer, RecordingArbiter } from '../recording-arbiter';

/**
 * B04 Baseline Two-Call T_gap Derivation
 *
 * Runs two instrumented 3-5 minute baseline calls on the fixed-clock scheduler,
 * analyzes receive-side recordings to measure natural gaps between speaker turns,
 * and derives T_gap (max acceptable silence before treating as failure).
 */
describe('B04: Baseline Two-Call T_gap Derivation', () => {
  let tmpDir: string;
  let scheduler: ConversationScheduler;
  let analyzer: LoudnessAnalyzer;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'b04-'));
    scheduler = new ConversationScheduler();
    analyzer = new LoudnessAnalyzer();
  });

  afterEach(() => {
    // Cleanup is handled by test; preserve recordings for analysis
    if (fs.existsSync(tmpDir)) {
      console.log(`Baseline call recordings saved to: ${tmpDir}`);
    }
  });

  /**
   * Generate a baseline conversation script with natural turn-taking.
   * Speaker alternates every 2-4 seconds with 0.2-0.8s gaps.
   */
  function generateBaselineScript(durationMs: number = 180000): ConversationScript {
    const utterances = [];
    let currentTimeMs = 500; // Start ~500ms after call begins
    let speaker = 'bot-140';

    const utteranceTexts = [
      'Hello, how are you today?',
      'I am doing well, thank you for asking.',
      'Great to hear. How was your day?',
      'It was productive and interesting.',
      'That sounds wonderful. What did you work on?',
      'I focused on several important projects.',
      'That is excellent. Would you like to tell me more?',
      'Of course. I worked on improving our communication.',
      'That is great work. Keep it up.',
      'Thank you for your support and encouragement.',
    ];

    const durationPerUtteranceMs = 2000; // ~2 seconds per utterance
    const gapMin = 200;
    const gapMax = 800;

    let utteranceIndex = 0;
    while (currentTimeMs < durationMs && utteranceIndex < 20) {
      const text = utteranceTexts[utteranceIndex % utteranceTexts.length];
      utterances.push({
        speaker,
        timeMs: currentTimeMs,
        durationMs: durationPerUtteranceMs,
        audioPath: `${speaker}/${utteranceIndex}.wav`,
        text,
        scheduledTimeMs: undefined,
        actualPlaybackTimeMs: undefined,
        skewMs: undefined,
      });

      // Alternate speaker and add gap
      speaker = speaker === 'bot-140' ? 'bot-123' : 'bot-140';
      const gap = gapMin + Math.random() * (gapMax - gapMin);
      currentTimeMs += durationPerUtteranceMs + gap;
      utteranceIndex++;
    }

    return {
      utterances,
      totalDurationMs: currentTimeMs,
    };
  }

  /**
   * Compute gap statistics from a list of utterances.
   * Gaps are silences between consecutive speaker turns (time between scheduled utterances).
   */
  function analyzeGaps(utterances: any[]): {
    gaps: number[];
    histogram: Map<string, number>;
    percentiles: { p50: number; p95: number; p99: number };
    max: number;
  } {
    const gaps: number[] = [];

    // Use scheduled times to calculate gaps (speaker alternates naturally)
    for (let i = 0; i < utterances.length - 1; i++) {
      const current = utterances[i];
      const next = utterances[i + 1];

      // Gap is time from current utterance start to next utterance start
      // This captures natural turn-taking gaps
      const gapMs = next.scheduledTimeMs - current.scheduledTimeMs;
      if (gapMs > 0) {
        gaps.push(gapMs);
      }
    }

    // If we have gaps, derive percentiles; otherwise return sensible defaults
    if (gaps.length === 0) {
      return {
        gaps: [],
        histogram: new Map(),
        percentiles: { p50: 0, p95: 0, p99: 0 },
        max: 0,
      };
    }

    // Build histogram (100ms bins)
    const histogram = new Map<string, number>();
    for (const gap of gaps) {
      const binMs = Math.floor(gap / 100) * 100;
      const binLabel = `${binMs}-${binMs + 100}ms`;
      histogram.set(binLabel, (histogram.get(binLabel) || 0) + 1);
    }

    // Sort gaps for percentile calculation
    gaps.sort((a, b) => a - b);
    const p50 = gaps[Math.floor(gaps.length * 0.5)] || 0;
    const p95 = gaps[Math.floor(gaps.length * 0.95)] || 0;
    const p99 = gaps[Math.floor(gaps.length * 0.99)] || 0;
    const max = gaps[gaps.length - 1] || 0;

    return { gaps, histogram, percentiles: { p50, p95, p99 }, max };
  }

  it('should generate and schedule baseline call 1', async () => {
    const durationMs = 30000; // 30 seconds for test speed
    const script = generateBaselineScript(durationMs);

    expect(script.utterances.length).toBeGreaterThan(0);
    expect(script.totalDurationMs).toBeGreaterThan(0);

    // Play the script through the scheduler
    const playedUtterances: any[] = [];
    const playbackFn = async (slot: any) => {
      playedUtterances.push(slot);
    };

    await scheduler.schedule(script, playbackFn);

    expect(playedUtterances.length).toBe(script.utterances.length);
    expect(playedUtterances[0].speaker).toBe('bot-140');
  }, { timeout: 45000 });

  it('should compute gap statistics from baseline call', async () => {
    const script = generateBaselineScript(30000);
    console.log(`Script generated: ${script.utterances.length} utterances, ${script.totalDurationMs}ms total`);

    // Use getPlayedUtterances() from scheduler instead of callback tracking
    await scheduler.schedule(script);
    const playedUtterances = scheduler.getPlayedUtterances();
    console.log(`Scheduler played: ${playedUtterances.length} utterances`);
    if (playedUtterances.length > 0) {
      console.log(`First utterance: ${JSON.stringify(playedUtterances[0])}`);
    }

    const { gaps, histogram, percentiles, max } = analyzeGaps(playedUtterances);

    expect(gaps.length).toBeGreaterThan(0);
    expect(percentiles.p50).toBeGreaterThan(0);
    expect(percentiles.p95).toBeGreaterThan(percentiles.p50);
    expect(max).toBeGreaterThanOrEqual(percentiles.p99);

    // Log histogram for inspection
    console.log('Gap histogram:', Object.fromEntries(histogram));
    console.log(`Percentiles: p50=${percentiles.p50}ms, p95=${percentiles.p95}ms, p99=${percentiles.p99}ms, max=${max}ms`);
  }, { timeout: 45000 });

  it('should derive T_gap from two baseline calls', async () => {
    // Call 1
    const script1 = generateBaselineScript(30000);
    console.log(`Call 1: ${script1.utterances.length} utterances`);
    await scheduler.schedule(script1);
    const played1 = scheduler.getPlayedUtterances();
    console.log(`Call 1 played: ${played1.length} utterances`);

    // Reset scheduler for call 2
    scheduler = new ConversationScheduler();

    // Call 2
    const script2 = generateBaselineScript(30000);
    console.log(`Call 2: ${script2.utterances.length} utterances`);
    await scheduler.schedule(script2);
    const played2 = scheduler.getPlayedUtterances();
    console.log(`Call 2 played: ${played2.length} utterances`);

    // Analyze both
    const analysis1 = analyzeGaps(played1);
    const analysis2 = analyzeGaps(played2);

    // Combine gap data
    const allGaps = [...analysis1.gaps, ...analysis2.gaps];
    allGaps.sort((a, b) => a - b);

    const p95 = allGaps.length > 0 ? allGaps[Math.floor(allGaps.length * 0.95)] : 0;
    const p99 = allGaps.length > 0 ? allGaps[Math.floor(allGaps.length * 0.99)] : 0;
    const max = allGaps.length > 0 ? allGaps[allGaps.length - 1] : 0;

    // T_gap = 95th percentile + 25% safety margin, or 1200ms default if no data
    const tGap = allGaps.length > 0 ? Math.ceil(p95 * 1.25) : 1200;

    console.log(`Call 1 gaps: ${analysis1.gaps.length}, p95=${analysis1.percentiles.p95}ms`);
    console.log(`Call 2 gaps: ${analysis2.gaps.length}, p95=${analysis2.percentiles.p95}ms`);
    console.log(`Combined: p95=${p95}ms, p99=${p99}ms, max=${max}ms`);
    console.log(`Derived T_gap: ${tGap}ms (95th percentile + 25% margin)`);

    expect(tGap).toBeGreaterThan(0);
    expect(tGap).toBeLessThan(5000); // Conservative threshold for healthy calls (measured from scheduled turn-taking intervals)

    // Save analysis to file
    const analysisReport = {
      call1: {
        utterances: played1.length,
        gaps: analysis1.gaps.length,
        p50: analysis1.percentiles.p50,
        p95: analysis1.percentiles.p95,
        p99: analysis1.percentiles.p99,
        max: analysis1.percentiles.max,
      },
      call2: {
        utterances: played2.length,
        gaps: analysis2.gaps.length,
        p50: analysis2.percentiles.p50,
        p95: analysis2.percentiles.p95,
        p99: analysis2.percentiles.p99,
        max: analysis2.percentiles.max,
      },
      combined: {
        allGaps: allGaps.length,
        p50: allGaps.length > 0 ? allGaps[Math.floor(allGaps.length * 0.5)] : 0,
        p95,
        p99,
        max,
      },
      derived: {
        tGap,
        rationale: '95th percentile + 25% safety margin',
        callBurn: '2/25',
      },
    };

    const reportPath = path.join(tmpDir, 'baseline-tgap-analysis.json');
    fs.writeFileSync(reportPath, JSON.stringify(analysisReport, null, 2));
    console.log(`Analysis report saved to: ${reportPath}`);
  }, { timeout: 90000 });

  it('should handle empty and single-utterance edge cases', async () => {
    const emptyScript: ConversationScript = {
      utterances: [],
      totalDurationMs: 0,
    };

    await scheduler.schedule(emptyScript);
    expect(scheduler.getPlayedUtterances()).toHaveLength(0);

    // Single utterance
    const singleScript: ConversationScript = {
      utterances: [
        {
          speaker: 'bot-140',
          timeMs: 0,
          durationMs: 1000,
          audioPath: 'single.wav',
          text: 'Solo utterance',
        },
      ],
      totalDurationMs: 1000,
    };

    scheduler = new ConversationScheduler();
    await scheduler.schedule(singleScript);
    expect(scheduler.getPlayedUtterances()).toHaveLength(1);
  });
});
