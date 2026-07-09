// B08S-2: Receive-side audio capture and transcript adapter
// Captures far-end audio from receiving browser via MediaRecorder or WebAudio,
// encodes to WAV, and generates transcript from ConversationScript.

import * as fs from 'fs';
import * as path from 'path';
import type { Page } from '@playwright/test';
import { WavEncoder } from './wav-encoder.js';
import type { ConversationScript } from './conversation-scheduler.js';

export interface ReceiveSideRecordingResult {
  wavPath: string; // Path to receive-side WAV file
  transcriptPath: string; // Path to transcript text file
  transcriptContent: string; // Full transcript text
  durationMs: number; // Recording duration
}

/**
 * Install receive-side audio capture hook on page BEFORE RTCPeerConnection is created.
 * Must be called before joinBrowser() to capture existing tracks created during join.
 * Uses addInitScript() so hook persists across page.goto() navigation.
 *
 * @param page Receiving browser page
 * @returns Handle for later stopAndEncodeCapture() call
 */
export async function installCaptureHook(page: Page): Promise<string> {
  const hookId = `hook-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  // Install wrapper via addInitScript so it persists across page.goto() navigation
  await page.addInitScript(
    (hId: string) => {
      const originalRtcPeerConnection = (window as any).RTCPeerConnection ||
        (window as any).webkitRTCPeerConnection;

      if (!originalRtcPeerConnection) {
        // No RTCPeerConnection support; fail closed
        (window as any).__captureHookState = { hookId: hId, active: false };
        return;
      }

      let audioContext: AudioContext | null = null;
      let scriptProcessor: ScriptProcessorNode | null = null;
      let recordingStartTime = 0;
      const audioSamples: Float32Array[] = [];
      let hasReceivedAudio = false;

      // Initialize audio context once for the entire session
      const initializeAudioContext = () => {
        if (audioContext) return;
        const AudioContextCtor = (window as any).AudioContext ||
          (window as any).webkitAudioContext;
        if (!AudioContextCtor) return;
        audioContext = new AudioContextCtor();
      };

      const processAudioTrack = (event: RTCTrackEvent) => {
        if (event.track.kind !== 'audio') return;
        hasReceivedAudio = true;

        // Update state object so stopAndEncodeCapture sees live values
        (window as any).__captureHookState.hasReceivedAudio = true;

        initializeAudioContext();
        if (!audioContext) return;

        // Update state object with initialized context
        (window as any).__captureHookState.audioContext = audioContext;

        // Create source from remote stream and capture raw samples
        const mediaStreamAudioSource = audioContext.createMediaStreamSource(
          event.streams[0],
        );

        // Use ScriptProcessorNode to capture raw PCM (4096 buffer)
        if (!scriptProcessor) {
          recordingStartTime = Date.now();
          scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);

          // Update state object with processor and start time
          (window as any).__captureHookState.scriptProcessor = scriptProcessor;
          (window as any).__captureHookState.recordingStartTime = recordingStartTime;

          scriptProcessor.onaudioprocess = (e: AudioProcessingEvent) => {
            const inputData = e.inputBuffer.getChannelData(0);
            // Copy sample data to avoid mutation
            audioSamples.push(new Float32Array(inputData));
          };

          mediaStreamAudioSource.connect(scriptProcessor);
          scriptProcessor.connect(audioContext.destination);
        }
      };

      // Wrap RTCPeerConnection to intercept track events on both future and existing PCs
      (window as any).RTCPeerConnection = function (...args: any[]) {
        const pc = new originalRtcPeerConnection(...args);

        pc.addEventListener('track', (event: RTCTrackEvent) => {
          processAudioTrack(event);
        });

        // Enumerate existing remote audio tracks that may have arrived before event listener attached
        pc.getReceivers().forEach((receiver: any) => {
          if (receiver.track && receiver.track.kind === 'audio') {
            const event = { track: receiver.track, streams: [new MediaStream([receiver.track])] };
            processAudioTrack(event as unknown as RTCTrackEvent);
          }
        });

        return pc;
      };

      // Store state for later retrieval
      (window as any).__captureHookState = {
        hookId: hId,
        active: true,
        audioSamples,
        audioContext,
        scriptProcessor,
        recordingStartTime,
        hasReceivedAudio,
      };
    },
    hookId,
  );

  return hookId;
}

/**
 * Stop recording and encode to WAV. Must be called after call ends.
 *
 * @param page Receiving browser page
 * @param outputDir Directory to write WAV file
 * @param hookId Handle returned from installCaptureHook()
 * @returns WAV path and duration
 */
export async function stopAndEncodeCapture(
  page: Page,
  outputDir: string,
  hookId: string,
): Promise<{ wavPath: string; durationMs: number }> {
  const recordingId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  const captureResult = await page.evaluate(
    async (hId: string) => {
      // Retrieve state from hook installation
      const state = (window as any).__captureHookState;
      if (!state || !state.active) {
        return { samples: null, sampleRate: 0, durationMs: 0 };
      }

      const { audioSamples, audioContext, scriptProcessor, recordingStartTime, hasReceivedAudio } =
        state;

      // Stop recording
      if (scriptProcessor) {
        scriptProcessor.disconnect();
      }

      if (!hasReceivedAudio || audioSamples.length === 0) {
        // No real audio was captured; fail closed
        return { samples: null, sampleRate: 0, durationMs: 0 };
      }

      // Combine all captured samples into one buffer
      const totalSamples = audioSamples.reduce((sum: number, arr: Float32Array) => sum + arr.length, 0);
      const combinedSamples = new Float32Array(totalSamples);
      let offset = 0;
      for (const samples of audioSamples) {
        combinedSamples.set(samples, offset);
        offset += samples.length;
      }

      const durationMs = Date.now() - recordingStartTime;
      const sampleRate = audioContext?.sampleRate || 48000;

      // Convert to array for serialization
      return {
        samples: Array.from(combinedSamples),
        sampleRate,
        durationMs,
      };
    },
    hookId,
  );

  // Fail closed: if no real audio captured, throw instead of writing synthetic WAV
  if (captureResult.samples === null || captureResult.samples.length === 0) {
    throw new Error(
      `stopAndEncodeCapture: No real remote audio captured (durationMs=${captureResult.durationMs}). ` +
        'Failing closed instead of writing synthetic WAV.',
    );
  }

  // Convert captured samples to WAV
  const samples = new Float32Array(captureResult.samples);
  const encoder = new WavEncoder({ sampleRate: captureResult.sampleRate, channels: 1 });
  const wavBuffer = encoder.encode(samples);

  const wavPath = path.join(outputDir, `b08s2-receive-${recordingId}.wav`);
  fs.writeFileSync(wavPath, wavBuffer);

  return { wavPath, durationMs: captureResult.durationMs };
}

/**
 * Capture receive-side audio from a Playwright page via MediaRecorder API.
 * DEPRECATED: Use installCaptureHook() + stopAndEncodeCapture() for proper timing.
 * Kept for backward compatibility with unit tests.
 *
 * @param page Receiving browser page
 * @param outputDir Directory to write WAV and transcript
 * @returns RecordingResult with paths and transcript content
 */
export async function captureReceiveSideAudio(
  page: Page,
  outputDir: string,
): Promise<{ wavPath: string; durationMs: number }> {
  // For backward compatibility: install, wait, and stop immediately
  const hookId = await installCaptureHook(page);
  // Use native setTimeout for wait instead of Playwright's waitForTimeout
  await new Promise((resolve) => setTimeout(resolve, 5000));
  return stopAndEncodeCapture(page, outputDir, hookId);
}

/**
 * Generate transcript from ConversationScript (script-sourced, labeled scriptExpected).
 * Represents the far-end speech as heard by the receiving browser.
 *
 * @param script ConversationScript with utterance text
 * @param receiverSpeakerId Speaker ID of the far end (from receiver's perspective)
 * @returns Concatenated transcript text
 */
export function generateScriptTranscript(
  script: ConversationScript,
  receiverSpeakerId: 'bot-140' | 'bot-123',
): string {
  const utterances = script.utterances.filter((u) => u.speaker === receiverSpeakerId);
  const lines = utterances.map((u) => {
    const timestamp = `[${(u.timeMs / 1000).toFixed(2)}s]`;
    return `${timestamp} ${u.text}`;
  });
  return lines.join('\n');
}

/**
 * Generate transcript text file and return paths.
 *
 * @param transcriptContent Full transcript text
 * @param outputDir Directory to write transcript
 * @returns transcriptPath, transcriptContent
 */
export function writeTranscriptFile(
  transcriptContent: string,
  outputDir: string,
  recordingId: string,
): { transcriptPath: string } {
  const transcriptPath = path.join(outputDir, `b08s2-transcript-${recordingId}.txt`);
  const header = '# Receive-side transcript (script-sourced, labeled scriptExpected)\n\n';
  fs.writeFileSync(transcriptPath, header + transcriptContent);
  return { transcriptPath };
}

export interface CaptureHandle {
  hookId: string;
  page: Page;
  outputDir: string;
}

/**
 * Phase 1: Install capture hook on receiver page BEFORE join.
 * Must be called before joinBrowser() on the receiver page.
 *
 * @param page Receiving browser page
 * @param outputDir Ledger base directory for output files
 * @returns Handle for stopReceiveSideRecording() call
 */
export async function startReceiveSideRecording(
  page: Page,
  outputDir: string,
): Promise<CaptureHandle> {
  const hookId = await installCaptureHook(page);
  return { hookId, page, outputDir };
}

/**
 * Phase 2: Stop recording and generate transcript.
 * Called after call ends and both browsers have published.
 *
 * @param handle Handle returned from startReceiveSideRecording()
 * @param script Optional ConversationScript for transcript generation
 * @param receiverSpeakerId Speaker ID of the far end
 * @returns ReceiveSideRecordingResult with WAV path, transcript, and content
 */
export async function stopReceiveSideRecording(
  handle: CaptureHandle,
  script?: ConversationScript,
  receiverSpeakerId: 'bot-140' | 'bot-123' = 'bot-140',
): Promise<ReceiveSideRecordingResult> {
  const recordingId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  // Capture audio
  const { wavPath, durationMs } = await stopAndEncodeCapture(
    handle.page,
    handle.outputDir,
    handle.hookId,
  );

  // Generate transcript
  let transcriptContent = '[No script provided]';
  let transcriptPath = path.join(handle.outputDir, `b08s2-transcript-${recordingId}.txt`);

  if (script) {
    transcriptContent = generateScriptTranscript(script, receiverSpeakerId);
    ({ transcriptPath } = writeTranscriptFile(transcriptContent, handle.outputDir, recordingId));
  } else {
    // Still write a stub transcript file
    const header = '# Receive-side transcript (no script provided)\n\n';
    fs.writeFileSync(transcriptPath, header + transcriptContent);
  }

  return {
    wavPath,
    transcriptPath,
    transcriptContent,
    durationMs,
  };
}

/**
 * Orchestrate full receive-side recording: audio capture + transcript generation.
 * Returns paths and content for integration with RecordingArbiter.
 * DEPRECATED: Use startReceiveSideRecording() + stopReceiveSideRecording() for proper timing.
 *
 * @param page Receiving browser page
 * @param outputDir Ledger base directory for output files
 * @param script Optional ConversationScript for transcript generation
 * @param receiverSpeakerId Speaker ID of the far end
 * @returns ReceiveSideRecordingResult with WAV path, transcript, and content
 */
export async function recordReceiveSideCall(
  page: Page,
  outputDir: string,
  script?: ConversationScript,
  receiverSpeakerId: 'bot-140' | 'bot-123' = 'bot-140',
): Promise<ReceiveSideRecordingResult> {
  const recordingId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  // Capture audio (deprecated single-phase path)
  const { wavPath, durationMs } = await captureReceiveSideAudio(page, outputDir);

  // Generate transcript
  let transcriptContent = '[No script provided]';
  let transcriptPath = path.join(outputDir, `b08s2-transcript-${recordingId}.txt`);

  if (script) {
    transcriptContent = generateScriptTranscript(script, receiverSpeakerId);
    ({ transcriptPath } = writeTranscriptFile(transcriptContent, outputDir, recordingId));
  } else {
    // Still write a stub transcript file
    const header = '# Receive-side transcript (no script provided)\n\n';
    fs.writeFileSync(transcriptPath, header + transcriptContent);
  }

  return {
    wavPath,
    transcriptPath,
    transcriptContent,
    durationMs,
  };
}
