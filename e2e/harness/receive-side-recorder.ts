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
 * Capture receive-side audio from a Playwright page via MediaRecorder API.
 * Requires that the page has an active RTCPeerConnection with remote audio tracks.
 *
 * @param page Receiving browser page
 * @param outputDir Directory to write WAV and transcript
 * @returns RecordingResult with paths and transcript content
 */
export async function captureReceiveSideAudio(
  page: Page,
  outputDir: string,
): Promise<{ wavPath: string; durationMs: number }> {
  // Capture real remote audio or fail (fail-closed, no synthetic fallback)
  const recordingId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const captureResult = await page.evaluate(
    async (recId: string) => {
      // This runs in browser context; captures raw PCM samples from incoming audio
      return new Promise<{
        samples: number[] | null;
        sampleRate: number;
        durationMs: number;
      }>((resolve) => {
        const originalRtcPeerConnection = (window as any).RTCPeerConnection ||
          (window as any).webkitRTCPeerConnection;

        if (!originalRtcPeerConnection) {
          // No RTCPeerConnection support; fail closed
          resolve({ samples: null, sampleRate: 0, durationMs: 0 });
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

          initializeAudioContext();
          if (!audioContext) return;

          // Create source from remote stream and capture raw samples
          const mediaStreamAudioSource = audioContext.createMediaStreamSource(
            event.streams[0],
          );

          // Use ScriptProcessorNode to capture raw PCM (4096 buffer)
          if (!scriptProcessor) {
            recordingStartTime = Date.now();
            scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);

            scriptProcessor.onaudioprocess = (e: AudioProcessingEvent) => {
              const inputData = e.inputBuffer.getChannelData(0);
              // Copy sample data to avoid mutation
              audioSamples.push(new Float32Array(inputData));
            };

            mediaStreamAudioSource.connect(scriptProcessor);
            scriptProcessor.connect(audioContext.destination);
          }
        };

        // Wrap RTCPeerConnection to intercept track events
        (window as any).RTCPeerConnection = function (...args: any[]) {
          const pc = new originalRtcPeerConnection(...args);

          pc.addEventListener('track', (event: RTCTrackEvent) => {
            processAudioTrack(event);
          });

          // Enumerate existing remote audio tracks that may have arrived before wrapper installed
          pc.getReceivers().forEach((receiver: any) => {
            if (receiver.track && receiver.track.kind === 'audio') {
              const event = { track: receiver.track, streams: [new MediaStream([receiver.track])] };
              processAudioTrack(event as unknown as RTCTrackEvent);
            }
          });

          return pc;
        };

        // Wait for recording window; stop if no audio arrived or if time expires
        setTimeout(() => {
          if (scriptProcessor) {
            scriptProcessor.disconnect();
          }

          if (!hasReceivedAudio || audioSamples.length === 0) {
            // No real audio was captured; fail closed
            resolve({ samples: null, sampleRate: 0, durationMs: 0 });
            return;
          }

          // Combine all captured samples into one buffer
          const totalSamples = audioSamples.reduce((sum, arr) => sum + arr.length, 0);
          const combinedSamples = new Float32Array(totalSamples);
          let offset = 0;
          for (const samples of audioSamples) {
            combinedSamples.set(samples, offset);
            offset += samples.length;
          }

          const durationMs = Date.now() - recordingStartTime;
          const sampleRate = audioContext?.sampleRate || 48000;

          // Convert to array for serialization
          resolve({
            samples: Array.from(combinedSamples),
            sampleRate,
            durationMs,
          });
        }, 5000); // Record for max 5 seconds
      });
    },
    recordingId,
  );

  // Fail closed: if no real audio captured, throw instead of writing synthetic WAV
  if (captureResult.samples === null || captureResult.samples.length === 0) {
    throw new Error(
      `captureReceiveSideAudio: No real remote audio captured (durationMs=${captureResult.durationMs}). ` +
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

/**
 * Orchestrate full receive-side recording: audio capture + transcript generation.
 * Returns paths and content for integration with RecordingArbiter.
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

  // Capture audio
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
