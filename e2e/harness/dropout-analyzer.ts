// B04-real: Dropout analyzer — detect silence spans during scripted speech and compute T_gap distribution.
// A dropout = span with no voiced energy at far end while the script says that peer was speaking,
// corroborated by missing STT words — never an inter-utterance pause (D27).

import type { ConversationScript } from './conversation-scheduler.js';

export interface SilenceSpan {
  startMs: number;
  endMs: number;
  durationMs: number;
  description?: string;
}

export interface STTData {
  words: string[];
  text: string;
}

export interface DropoutDetectionResult {
  dropouts: SilenceSpan[];
  distribution: {
    min: number;
    max: number;
    mean: number;
    median: number;
    p95: number;
    p99: number;
  };
  histogram: Map<string, number>;
  statistics: {
    totalObserved: number;
    totalDurationMs: number;
    callDurationMs: number;
  };
}

/**
 * Check if expected words from an utterance are present in STT data.
 * Returns true if the utterance shows missing words (dropout), false if words are present.
 */
function hasExpectedWordsInSTT(utteranceText: string, sttData: STTData): boolean {
  // Extract expected words from utterance text (case-insensitive, alphanumeric only)
  const expectedWords = utteranceText
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 0);

  if (expectedWords.length === 0) return true; // Empty utterance is not a dropout

  // Count how many expected words appear in the STT data
  const recognizedSet = new Set(sttData.words);
  const matchedWords = expectedWords.filter((w) => recognizedSet.has(w)).length;

  // Dropout indicator: less than 50% of expected words were recognized
  return matchedWords < expectedWords.length * 0.5;
}

/**
 * Pure detector: given a script and detected silence spans, find dropouts.
 * A dropout is a silence that overlaps with a scripted speaker's turn (not the receiver),
 * corroborated by missing STT words — never an inter-utterance pause (D27).
 * Receiver-specific because only the far-end speaker's silence at the receiver counts.
 */
export function detectDropouts(
  script: ConversationScript,
  silenceSpans: SilenceSpan[],
  receiverSpeakerId: 'bot-140' | 'bot-123',
  sttData?: STTData,
): SilenceSpan[] {
  // The far-end speaker is the one NOT receiving
  const farEndSpeaker = receiverSpeakerId === 'bot-140' ? 'bot-123' : 'bot-140';

  const farEndUtterances = script.utterances.filter((u) => u.speaker === farEndSpeaker);

  const dropouts: SilenceSpan[] = [];

  for (const silence of silenceSpans) {
    // Check if this silence overlaps with any far-end speaker turn
    for (const utterance of farEndUtterances) {
      const utteranceStart = utterance.timeMs;
      const utteranceEnd = utterance.timeMs + utterance.durationMs;

      // Overlap check: silence overlaps with utterance window
      if (silence.startMs < utteranceEnd && silence.endMs > utteranceStart) {
        // Guard: do not treat a silence that starts AFTER the utterance ended as a dropout
        // (that is an inter-utterance pause, not a dropout during speech)
        if (silence.startMs < utteranceEnd) {
          // Corroborate with STT: if STT data exists, only mark as dropout if words are missing
          const isDropout = !sttData || hasExpectedWordsInSTT(utterance.text, sttData);

          if (isDropout) {
            dropouts.push({
              startMs: Math.max(silence.startMs, utteranceStart),
              endMs: Math.min(silence.endMs, utteranceEnd),
              durationMs: Math.min(silence.endMs, utteranceEnd) - Math.max(silence.startMs, utteranceStart),
              description: `Dropout during "${utterance.text}" at ${utteranceStart}ms`,
            });
          }
        }
      }
    }
  }

  return dropouts;
}

/**
 * Compute distribution statistics from dropout durations.
 */
export function computeDistribution(
  dropoutDurations: number[],
): DropoutDetectionResult['distribution'] & { histogram: Map<string, number> } {
  if (dropoutDurations.length === 0) {
    return {
      min: 0,
      max: 0,
      mean: 0,
      median: 0,
      p95: 0,
      p99: 0,
      histogram: new Map(),
    };
  }

  const sorted = [...dropoutDurations].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  const median = sorted[Math.floor(sorted.length / 2)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];

  // Build histogram (50ms bins)
  const histogram = new Map<string, number>();
  for (const duration of dropoutDurations) {
    const binMs = Math.floor(duration / 50) * 50;
    const binLabel = `${binMs}-${binMs + 50}ms`;
    histogram.set(binLabel, (histogram.get(binLabel) || 0) + 1);
  }

  return { min, max, mean, median, p95, p99, histogram };
}

/**
 * Analyze a single call's dropout pattern: given script, detected silences, STT data, and receiver,
 * compute dropouts and statistics. D27 binding: silence + missing words = dropout.
 */
export function analyzeCall(
  script: ConversationScript,
  silenceSpans: SilenceSpan[],
  receiverSpeakerId: 'bot-140' | 'bot-123',
  callDurationMs: number,
  sttData?: STTData,
): DropoutDetectionResult {
  const dropouts = detectDropouts(script, silenceSpans, receiverSpeakerId, sttData);
  const durations = dropouts.map((d) => d.durationMs);
  const dist = computeDistribution(durations);

  const totalDropoutMs = durations.reduce((a, b) => a + b, 0);

  return {
    dropouts,
    distribution: {
      min: dist.min,
      max: dist.max,
      mean: dist.mean,
      median: dist.median,
      p95: dist.p95,
      p99: dist.p99,
    },
    histogram: dist.histogram,
    statistics: {
      totalObserved: dropouts.length,
      totalDurationMs: totalDropoutMs,
      callDurationMs,
    },
  };
}

/**
 * Merge two call analyses into combined statistics for T_gap derivation.
 */
export function mergeTwoCallAnalyses(
  analysis1: DropoutDetectionResult,
  analysis2: DropoutDetectionResult,
): {
  combined: DropoutDetectionResult;
  derivedTGap: number;
  rationale: string;
} {
  const allDropoutDurations = [
    ...analysis1.dropouts.map((d) => d.durationMs),
    ...analysis2.dropouts.map((d) => d.durationMs),
  ];

  const dist = computeDistribution(allDropoutDurations);
  const totalCallDurationMs = analysis1.statistics.callDurationMs + analysis2.statistics.callDurationMs;

  const combined: DropoutDetectionResult = {
    dropouts: [...analysis1.dropouts, ...analysis2.dropouts],
    distribution: {
      min: dist.min,
      max: dist.max,
      mean: dist.mean,
      median: dist.median,
      p95: dist.p95,
      p99: dist.p99,
    },
    histogram: dist.histogram,
    statistics: {
      totalObserved: analysis1.statistics.totalObserved + analysis2.statistics.totalObserved,
      totalDurationMs: analysis1.statistics.totalDurationMs + analysis2.statistics.totalDurationMs,
      callDurationMs: totalCallDurationMs,
    },
  };

  // Derive T_gap: p95 + 25% safety margin, or max if no data
  let derivedTGap = 500; // fallback provisional
  let rationale = 'fallback (no dropout data)';

  if (allDropoutDurations.length > 0) {
    const p95 = dist.p95;
    const safetyMargin = Math.ceil(p95 * 0.25);
    derivedTGap = Math.ceil(p95 + safetyMargin);
    rationale = `p95=${p95}ms + 25% margin (${safetyMargin}ms) = ${derivedTGap}ms`;
  }

  return { combined, derivedTGap, rationale };
}
