// B08S-2: Receive-side audio capture hook and transcript adapter (design-locked)
// Captures far-end audio via addInitScript RTCPeerConnection shim before join.
// Encodes to WAV and generates transcript from ConversationScript.
// Fail-closed: no-capture → INVALID, no WAV. No synthetic success.

import * as fs from 'fs';
import * as path from 'path';
import type { Page } from '@playwright/test';
import { WavEncoder } from './wav-encoder.js';
import type { ConversationScript } from './conversation-scheduler.js';

export interface ReceiveSideRecordingResult {
  wavPath: string;
  transcriptPath: string;
  transcriptContent: string;
  durationMs: number;
}

// State object stored on window; must be live (mutable), not install-time snapshots
interface B08S2CaptureState {
  installed: boolean;
  pcCount: number;
  trackCount: number;
  callbackCount: number;
  sampleCount: number;
  navCount: number;
  firstTrackAtMs: number;
  audioContextState: string;
  audioSamplesBytes: Uint8Array[];
  sourceNodes: any[];
  scriptProcessor: any;
  mixerGain?: any;
}

type CaptureClassification =
  | { kind: 'VALID'; durationMs: number; rms: number }
  | { kind: 'SILENCE'; durationMs: number; rms: number }
  | { kind: 'INVALID_HOOK_MISSING' }
  | { kind: 'INVALID_NO_PC' }
  | { kind: 'INVALID_AUDIO_GRAPH' }
  | { kind: 'INVALID_RELOAD' }
  | { kind: 'INVALID_HOOK_BLIND' }
  | { kind: 'PRODUCT_NO_MEDIA' };

/**
 * Pure taxonomy classifier: no browser, no I/O, deterministic.
 * Returns tagged union; caller decides WAV write, INVALID throw, etc.
 */
export function classifyCapture(
  state: Partial<B08S2CaptureState>,
  stats?: { inboundAudioRtp?: number },
): CaptureClassification {
  if (!state || !state.installed) {
    return { kind: 'INVALID_HOOK_MISSING' };
  }
  if (state.navCount && state.navCount > 1) {
    return { kind: 'INVALID_RELOAD' };
  }
  if (!state.pcCount || state.pcCount === 0) {
    return { kind: 'INVALID_NO_PC' };
  }
  if (!state.trackCount || state.trackCount === 0) {
    if (stats && stats.inboundAudioRtp && stats.inboundAudioRtp > 0) {
      return { kind: 'INVALID_HOOK_BLIND' };
    }
    if (stats && stats.inboundAudioRtp === 0) {
      return { kind: 'PRODUCT_NO_MEDIA' };
    }
    return { kind: 'INVALID_NO_PC' };
  }
  if (!state.callbackCount || state.callbackCount === 0 || state.audioContextState !== 'running') {
    return { kind: 'INVALID_AUDIO_GRAPH' };
  }

  // trackCount >= 1, callbackCount >= 1, context running
  const durationMs = state.sampleCount && state.audioContextState === 'running' ? state.sampleCount / 48 : 0;
  const rms = calculateRms(state.audioSamplesBytes || []);

  const SILENCE_FLOOR = 0.01;
  if (rms < SILENCE_FLOOR) {
    return { kind: 'SILENCE', durationMs, rms };
  }
  return { kind: 'VALID', durationMs, rms };
}

function concatenateByteChunks(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function calculateRms(byteChunks: Uint8Array[]): number {
  if (!byteChunks || byteChunks.length === 0) return 0;
  try {
    const allBytes = concatenateByteChunks(byteChunks);
    const int16Array = new Int16Array(allBytes.buffer, allBytes.byteOffset, allBytes.length / 2);
    let sum = 0;
    for (let i = 0; i < int16Array.length; i++) {
      const normalized = int16Array[i] / 32768;
      sum += normalized * normalized;
    }
    return int16Array.length > 0 ? Math.sqrt(sum / int16Array.length) : 0;
  } catch {
    return 0;
  }
}

/**
 * Install receive-side audio capture hook on page BEFORE any navigation.
 * Must call BEFORE page.goto() so hook persists and intercepts PC construction at join.
 * GUARD: throws if page.url() !== 'about:blank' (ordering guard, prevents late install).
 * Note: guard is defensive; mocks without url() method are allowed (test-only).
 */
export async function installCaptureHook(page: Page): Promise<string> {
  const currentUrl = typeof (page as any).url === 'function' ? (page as any).url() : 'about:blank';
  if (currentUrl !== 'about:blank') {
    throw new Error(
      `Cannot install capture hook: page already navigated (url="${currentUrl}"). ` +
      `Call installCaptureHook() BEFORE joinBrowser() / page.goto().`,
    );
  }

  const hookId = `hook-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  await page.addInitScript(
    (hId: string) => {
      const originalRtcPeerConnection =
        (window as any).RTCPeerConnection || (window as any).webkitRTCPeerConnection;

      if (!originalRtcPeerConnection) {
        (window as any).__b08s2ReceiveCapture = {
          installed: false,
          pcCount: 0,
          trackCount: 0,
          callbackCount: 0,
          sampleCount: 0,
          navCount: 1,
          firstTrackAtMs: 0,
          audioContextState: 'closed',
          audioSamplesBytes: [],
          sourceNodes: [],
          scriptProcessor: null,
        };
        return;
      }

      // Guard re-entry: if already installed, return original PC (prevent double-wrap)
      if ((window as any).__b08s2ReceiveCapture) {
        return;
      }

      // Initialize live state object
      (window as any).__b08s2ReceiveCapture = {
        installed: true,
        pcCount: 0,
        trackCount: 0,
        callbackCount: 0,
        sampleCount: 0,
        navCount: 1,
        firstTrackAtMs: 0,
        audioContextState: 'closed',
        audioSamplesBytes: [] as Uint8Array[],
        sourceNodes: [] as any[],
        scriptProcessor: null,
      } as B08S2CaptureState;

      const state = (window as any).__b08s2ReceiveCapture;

      // Track navigations to detect page reloads. Gated on pcCount >= 1: Angular
      // Router (and other SPA routers) fire their own replaceState/pushState
      // during bootstrap/initial route resolution, BEFORE any RTCPeerConnection
      // exists — that is not a reload and must not trip INVALID_RELOAD. Once a
      // real RTCPeerConnection is up, any further history mutation is a genuine
      // mid-call navigation and still counts.
      const origReplace = window.history.replaceState;
      const origPush = window.history.pushState;
      window.history.replaceState = function (...args) {
        if (state.pcCount >= 1) state.navCount++;
        return origReplace.apply(window.history, args);
      };
      window.history.pushState = function (...args) {
        if (state.pcCount >= 1) state.navCount++;
        return origPush.apply(window.history, args);
      };

      const processAudioTrack = (event: RTCTrackEvent) => {
        if (event.track.kind !== 'audio') return;

        state.trackCount++;

        // Lazy graph initialization on first audio track
        if (state.trackCount === 1) {
          const AudioContextCtor =
            (window as any).AudioContext || (window as any).webkitAudioContext;
          if (!AudioContextCtor) {
            state.audioContextState = 'unavailable';
            return;
          }

          const audioContext = new AudioContextCtor();
          audioContext.resume().catch(() => {});

          if (audioContext.state !== 'running') {
            state.audioContextState = audioContext.state;
            return;
          }
          state.audioContextState = 'running';

          // Create graph: ScriptProcessorNode once, reused for all tracks
          const scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
          const mixerGain = audioContext.createGain();
          const zeroGain = audioContext.createGain();
          zeroGain.gain.value = 0;

          zeroGain.connect(audioContext.destination);

          // onaudioprocess: collect samples once (called on first track setup)
          scriptProcessor.onaudioprocess = (e: AudioProcessingEvent) => {
            state.callbackCount++;
            const inputData = e.inputBuffer.getChannelData(0);
            state.sampleCount += inputData.length;

            // Convert Float32 to Int16, store raw bytes (no base64 encoding per-chunk)
            const int16 = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
              int16[i] = Math.max(-1, Math.min(1, inputData[i])) < 0 ? inputData[i] * 0x8000 : inputData[i] * 0x7fff;
            }
            // Store the raw byte chunk; concatenate only when decoding
            const uint8Chunk = new Uint8Array(int16.buffer);
            state.audioSamplesBytes.push(uint8Chunk);
          };

          // Correct connection order: mixerGain (source aggregator) → scriptProcessor (capture) → zeroGain (mute) → destination
          mixerGain.connect(scriptProcessor);
          scriptProcessor.connect(zeroGain);
          zeroGain.connect(audioContext.destination);

          state.scriptProcessor = scriptProcessor;
          state.mixerGain = mixerGain;
        }

        // GUARD 2 (tee): connect new source to scriptProcessor for capture
        if (!state.scriptProcessor) return;

        const audioContext = state.scriptProcessor.context;
        const source = audioContext.createMediaStreamSource(event.streams[0]);
        // Direct connection for capture: source → scriptProcessor input
        source.connect(state.scriptProcessor);
        state.sourceNodes.push(source);

        // Force real decode by attaching stream to a playing audio element (Chromium requirement).
        // This mirrors what the real app does at remote-audio.service.ts:560,628.
        const audioEl = document.createElement('audio');
        audioEl.srcObject = event.streams[0];
        audioEl.style.display = 'none';
        audioEl.autoplay = true;
        audioEl.muted = true;
        document.body.appendChild(audioEl);
        audioEl.play().catch(() => {});
      };

      // Wrap global RTCPeerConnection: constructor is the sole capture entry point
      (window as any).RTCPeerConnection = function (...args: any[]) {
        const pc = new originalRtcPeerConnection(...args);

        state.pcCount++;

        // GUARD 1 (passthrough): copy RTCConfiguration exactly as-is
        // (no filtering, no mutations; the caller's config reaches the real PC)

        // GUARD key: attach listener synchronously in constructor
        pc.addEventListener('track', (event: RTCTrackEvent) => {
          processAudioTrack(event);
        });

        return pc;
      };

      // Preserve prototype and statics
      (window as any).RTCPeerConnection.prototype = originalRtcPeerConnection.prototype;
      Object.setPrototypeOf((window as any).RTCPeerConnection, originalRtcPeerConnection);
    },
    hookId,
  );

  return hookId;
}

/**
 * Stop recording and encode to WAV. Must call after both browsers published.
 * Reads live state, classifies, and either writes WAV or throws INVALID.
 */
export async function stopAndEncodeCapture(
  page: Page,
  outputDir: string,
  hookId: string,
): Promise<{ wavPath: string; durationMs: number; metaPath?: string }> {
  const recordingId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  // Read live state from hook
  const captureResult = await page.evaluate(() => {
    const state = (window as any).__b08s2ReceiveCapture;
    if (!state) {
      return {
        state: null,
        stats: null,
      };
    }

    // Disconnect graph to stop recording
    if (state.scriptProcessor) {
      state.scriptProcessor.disconnect();
    }

    // Read stats for corroboration (optional)
    const stats = (window as any).__meetDebug?.sfuGetStats?.() || null;
    const inboundAudioRtp = stats?.inboundRtp?.find((s: any) => s.kind === 'audio')?.packetsReceived || 0;

    return {
      state,
      stats: { inboundAudioRtp },
    };
  });

  const { state, stats } = captureResult;

  // Classify
  const classification = classifyCapture(state, stats);

  if (classification.kind === 'INVALID_HOOK_MISSING') {
    throw new Error('INVALID_HOOK_MISSING');
  }
  if (classification.kind === 'INVALID_NO_PC') {
    throw new Error('INVALID_NO_PC');
  }
  if (classification.kind === 'INVALID_AUDIO_GRAPH') {
    throw new Error('INVALID_AUDIO_GRAPH');
  }
  if (classification.kind === 'INVALID_RELOAD') {
    throw new Error('INVALID_RELOAD');
  }
  if (classification.kind === 'INVALID_HOOK_BLIND') {
    throw new Error('INVALID_HOOK_BLIND');
  }
  if (classification.kind === 'PRODUCT_NO_MEDIA') {
    // Media never arrived; don't write WAV
    const metaPath = path.join(outputDir, `b08s2-receive-${recordingId}.meta.json`);
    fs.writeFileSync(metaPath, JSON.stringify({ reason: 'PRODUCT_NO_MEDIA', stats }, null, 2));
    throw new Error('PRODUCT_NO_MEDIA: no inbound audio detected');
  }

  // VALID or SILENCE: write WAV
  if (classification.kind === 'VALID' || classification.kind === 'SILENCE') {
    // Concatenate all byte chunks
    const allBytes = new Uint8Array(state!.audioSamplesBytes?.reduce((sum, chunk) => sum + chunk.length, 0) || 0);
    let offset = 0;
    for (const chunk of state!.audioSamplesBytes || []) {
      allBytes.set(chunk, offset);
      offset += chunk.length;
    }

    const int16Array = new Int16Array(allBytes.buffer, allBytes.byteOffset, allBytes.length / 2);
    const decodedSampleCount = int16Array.length;

    // Guard 3: decoded sample count must match sampleCount
    if (decodedSampleCount !== state!.sampleCount) {
      throw new Error(
        `B08S-2: sample count mismatch — expected ${state!.sampleCount}, got ${decodedSampleCount} ` +
        `(${state!.callbackCount} callbacks, ${state!.audioSamplesBytes?.length || 0} byte chunks)`,
      );
    }

    // Convert int16 to float32
    const float32 = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      float32[i] = int16Array[i] / 32768;
    }

    const encoder = new WavEncoder({ sampleRate: 48000, channels: 1 });
    const wavBuffer = encoder.encode(float32);

    const wavPath = path.join(outputDir, `b08s2-receive-${recordingId}.wav`);
    fs.writeFileSync(wavPath, wavBuffer);

    const metaPath = path.join(outputDir, `b08s2-receive-${recordingId}.meta.json`);
    fs.writeFileSync(
      metaPath,
      JSON.stringify(
        {
          reason: classification.kind,
          pcCount: state!.pcCount,
          trackCount: state!.trackCount,
          callbackCount: state!.callbackCount,
          sampleCount: state!.sampleCount,
          audioContextState: state!.audioContextState,
          byteChunksCount: state!.audioSamplesBytes?.length || 0,
          decodedSampleCount,
          rms: classification.rms,
        },
        null,
        2,
      ),
    );

    return {
      wavPath,
      metaPath,
      durationMs: classification.durationMs,
    };
  }

  throw new Error('Unknown classification result');
}

/**
 * Generate transcript from ConversationScript (script-sourced, labeled scriptExpected).
 * Represents the far-end speech as heard by the receiving browser.
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
 * Must call BEFORE joinBrowser() on the receiver page.
 */
export async function startReceiveSideRecording(page: Page, outputDir: string): Promise<CaptureHandle> {
  const hookId = await installCaptureHook(page);
  return { hookId, page, outputDir };
}

/**
 * Phase 2: Stop recording and generate transcript.
 * Called after call ends and both browsers have published.
 */
export async function stopReceiveSideRecording(
  handle: CaptureHandle,
  script?: ConversationScript,
  receiverSpeakerId: 'bot-140' | 'bot-123' = 'bot-140',
): Promise<ReceiveSideRecordingResult> {
  const recordingId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  const { wavPath, durationMs } = await stopAndEncodeCapture(handle.page, handle.outputDir, handle.hookId);

  let transcriptContent = '[No script provided]';
  let transcriptPath = path.join(handle.outputDir, `b08s2-transcript-${recordingId}.txt`);

  if (script) {
    transcriptContent = generateScriptTranscript(script, receiverSpeakerId);
    ({ transcriptPath } = writeTranscriptFile(transcriptContent, handle.outputDir, recordingId));
  } else {
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
