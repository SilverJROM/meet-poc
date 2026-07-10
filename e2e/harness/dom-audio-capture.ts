// P3-LIVE-04: alternate receive-side audio capture that does NOT wrap `window.RTCPeerConnection`.
//
// receive-side-recorder.ts's installCaptureHook wraps the global RTCPeerConnection constructor via
// addInitScript to count/tap PCs as they're created. On the split-host live path that hook's own
// state object survives (still readable, pcCount:0) but window.RTCPeerConnection itself reads back
// as the native constructor by the time the app calls it — proven NOT to be zone.js, NOT a
// defineProperty-defeatable reassignment, NOT a reload/crash/iframe (see
// decisions/2026-07-10-p3-live-02-invalid-no-pc.md). Root cause still unknown.
//
// This module sidesteps the whole question: instead of intercepting PC construction, it captures
// audio from the DOM element the app itself already renders for playback. remote-audio.service.ts
// (frontend) creates `<audio data-remote-audio="<publisherId}">` per remote publisher and sets
// `el.srcObject` to the live remote MediaStream (addPublisher(), remote-audio.service.ts:559-564) —
// that attribute is stable, app-owned product code, not a harness assumption. HTMLMediaElement's
// native `captureStream()` re-taps whatever is actually playing through that element, independent
// of how/when the underlying RTCPeerConnection was constructed.
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Page } from '@playwright/test';
import { WavEncoder } from './wav-encoder.js';

export interface DomCaptureHandle {
  captureId: string;
  page: Page;
  outputDir: string;
}

/**
 * Waits for the app's first `audio[data-remote-audio]` element to appear with a live srcObject,
 * then taps it via `captureStream()` and starts accumulating raw PCM samples via a
 * ScriptProcessorNode (same collection pattern as receive-side-recorder.ts's hook, minus the PC
 * wrap). Call once, after publish validation has already confirmed both legs are live.
 */
export async function startDomRemoteAudioCapture(page: Page, outputDir: string, timeoutMs = 15000): Promise<DomCaptureHandle> {
  const captureId = `dom-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  await page.evaluate(
    async ({ captureId, timeoutMs }: { captureId: string; timeoutMs: number }) => {
      const w = window as any;
      w.__p3l04Captures = w.__p3l04Captures || {};

      const deadline = Date.now() + timeoutMs;
      let el: HTMLMediaElement | null = null;
      while (Date.now() < deadline) {
        const candidate = document.querySelector('audio[data-remote-audio]') as HTMLMediaElement | null;
        if (candidate && candidate.srcObject) {
          el = candidate;
          break;
        }
        await new Promise((r) => setTimeout(r, 100));
      }

      if (!el) {
        w.__p3l04Captures[captureId] = { installed: false, reason: 'NO_REMOTE_AUDIO_ELEMENT' };
        return;
      }

      const captureFn = (el as any).captureStream || (el as any).mozCaptureStream;
      if (typeof captureFn !== 'function') {
        w.__p3l04Captures[captureId] = { installed: false, reason: 'NO_CAPTURE_STREAM_SUPPORT' };
        return;
      }

      const stream: MediaStream = captureFn.call(el);
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        w.__p3l04Captures[captureId] = { installed: false, reason: 'NO_AUDIO_TRACK_ON_ELEMENT' };
        return;
      }

      const AudioContextCtor = (window as any).AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContextCtor();
      await audioContext.resume().catch(() => {});

      const audioTrack = audioTracks[0];
      const state = {
        installed: true,
        elementSelector: `audio[data-remote-audio="${el.dataset['remoteAudio']}"]`,
        callbackCount: 0,
        sampleCount: 0,
        audioContextState: audioContext.state,
        audioSamplesBytes: [] as Uint8Array[],
        elDiag: {
          muted: el.muted,
          volume: el.volume,
          paused: el.paused,
          readyState: el.readyState,
          trackReadyState: audioTrack.readyState,
          trackEnabled: audioTrack.enabled,
          trackMuted: (audioTrack as any).muted,
        },
      };
      w.__p3l04Captures[captureId] = state;

      const source = audioContext.createMediaStreamSource(stream);
      const scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
      const zeroGain = audioContext.createGain();
      zeroGain.gain.value = 0;

      source.connect(scriptProcessor);
      scriptProcessor.connect(zeroGain);
      zeroGain.connect(audioContext.destination);

      scriptProcessor.onaudioprocess = (e: AudioProcessingEvent) => {
        state.callbackCount++;
        state.audioContextState = audioContext.state;
        const inputData = e.inputBuffer.getChannelData(0);
        state.sampleCount += inputData.length;
        const int16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          int16[i] = Math.max(-1, Math.min(1, inputData[i])) < 0 ? inputData[i] * 0x8000 : inputData[i] * 0x7fff;
        }
        state.audioSamplesBytes.push(new Uint8Array(int16.buffer));
      };

      w.__p3l04CaptureCleanup = w.__p3l04CaptureCleanup || {};
      w.__p3l04CaptureCleanup[captureId] = () => {
        try {
          scriptProcessor.disconnect();
        } catch {
          // already disconnected
        }
      };
    },
    { captureId, timeoutMs },
  );

  return { captureId, page, outputDir };
}

/**
 * P3-LIVE-06: alternate capture source, found necessary after `startDomRemoteAudioCapture`
 * (captureStream() on the app's `<audio data-remote-audio>` element) proved to reproduce exact
 * silence — isolated (local-only, no SFU) to a genuine Chromium double-AudioContext-hop bug:
 * `el.srcObject` is the OUTPUT of the app's OWN internal gain+compressor graph
 * (`createRemoteAudioGraph()`, `remote-audio.service.ts:730-751`, via `createMediaStreamDestination()`),
 * and `captureStream()`-ing THAT element into a SECOND, independent AudioContext silently yields
 * all-zero samples — reproduced with a synthetic two-hop test with zero network/SFU involvement.
 * Single-hop captures (raw stream straight into one AudioContext, no intermediate element/context)
 * worked fine in every isolation test (P3-LIVE-04/05).
 *
 * This taps `window.__meetDebug.sfuRemoteStreams` (real product code, `sfu-client.service.ts:114`,
 * exposed via `room.page.ts` `sfuRemoteStreams: this.sfuClient.remoteStreams()`) directly — the
 * RAW remote WebRTC `MediaStream`, before the app's own processing graph — and feeds it into a
 * single capture AudioContext, matching the isolation tests' working shape exactly. Trade-off,
 * disclosed not hidden: this proves energy arrived and is decodable (the acceptance bar — "receive
 * energy"), but is pre-gain/compressor, not bit-identical to what a human ear hears through the
 * app's own processing.
 */
export async function startRawRemoteStreamCapture(page: Page, outputDir: string, timeoutMs = 15000): Promise<DomCaptureHandle> {
  const captureId = `raw-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  await page.evaluate(
    async ({ captureId, timeoutMs }: { captureId: string; timeoutMs: number }) => {
      const w = window as any;
      w.__p3l04Captures = w.__p3l04Captures || {};

      const deadline = Date.now() + timeoutMs;
      let stream: MediaStream | null = null;
      let peerId: string | null = null;
      while (Date.now() < deadline) {
        const streams: Map<string, MediaStream> | undefined = w.__meetDebug?.sfuRemoteStreams;
        if (streams && typeof streams.entries === 'function') {
          for (const [id, s] of streams.entries()) {
            if (s.getAudioTracks().length > 0) {
              stream = s;
              peerId = id;
              break;
            }
          }
        }
        if (stream) break;
        await new Promise((r) => setTimeout(r, 100));
      }

      if (!stream) {
        w.__p3l04Captures[captureId] = { installed: false, reason: 'NO_REMOTE_WEBRTC_STREAM' };
        return;
      }

      const audioTracks = stream.getAudioTracks();
      const audioTrack = audioTracks[0];

      const AudioContextCtor = (window as any).AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContextCtor();
      await audioContext.resume().catch(() => {});

      const state = {
        installed: true,
        elementSelector: `sfuRemoteStreams["${peerId}"]`,
        callbackCount: 0,
        sampleCount: 0,
        audioContextState: audioContext.state,
        audioSamplesBytes: [] as Uint8Array[],
        elDiag: {
          trackReadyState: audioTrack.readyState,
          trackEnabled: audioTrack.enabled,
          trackMuted: (audioTrack as any).muted,
        },
      };
      w.__p3l04Captures[captureId] = state;

      const source = audioContext.createMediaStreamSource(stream);
      const scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
      const zeroGain = audioContext.createGain();
      zeroGain.gain.value = 0;

      source.connect(scriptProcessor);
      scriptProcessor.connect(zeroGain);
      zeroGain.connect(audioContext.destination);

      scriptProcessor.onaudioprocess = (e: AudioProcessingEvent) => {
        state.callbackCount++;
        state.audioContextState = audioContext.state;
        const inputData = e.inputBuffer.getChannelData(0);
        state.sampleCount += inputData.length;
        const int16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          int16[i] = Math.max(-1, Math.min(1, inputData[i])) < 0 ? inputData[i] * 0x8000 : inputData[i] * 0x7fff;
        }
        state.audioSamplesBytes.push(new Uint8Array(int16.buffer));
      };

      w.__p3l04CaptureCleanup = w.__p3l04CaptureCleanup || {};
      w.__p3l04CaptureCleanup[captureId] = () => {
        try {
          scriptProcessor.disconnect();
        } catch {
          // already disconnected
        }
      };
    },
    { captureId, timeoutMs },
  );

  return { captureId, page, outputDir };
}

/**
 * Stops the capture graph and encodes accumulated samples to WAV. Throws with a descriptive
 * reason (no silent fallback) if the element/track was never found, or if nothing audible was
 * captured — mirrors receive-side-recorder.ts's fail-closed contract without going through its
 * pcCount-based classification.
 */
export async function stopDomRemoteAudioCapture(
  handle: DomCaptureHandle,
): Promise<{ wavPath: string; metaPath: string; durationMs: number; rms: number; elDiag: unknown }> {
  const { page, outputDir, captureId } = handle;
  const recordingId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  const result = await page.evaluate((captureId: string) => {
    const w = window as any;
    const state = w.__p3l04Captures?.[captureId];
    const cleanup = w.__p3l04CaptureCleanup?.[captureId];
    if (cleanup) cleanup();
    if (!state) return { ok: false, reason: 'CAPTURE_STATE_MISSING' };
    if (!state.installed) return { ok: false, reason: state.reason || 'NOT_INSTALLED' };
    if (state.sampleCount === 0) return { ok: false, reason: 'NO_SAMPLES_CAPTURED' };

    const allBytes = new Uint8Array(state.audioSamplesBytes.reduce((sum: number, c: Uint8Array) => sum + c.length, 0));
    let offset = 0;
    for (const chunk of state.audioSamplesBytes) {
      allBytes.set(chunk, offset);
      offset += chunk.length;
    }
    // Chunked binary-string build: spreading a large typed array into String.fromCharCode(...)
    // blows the call-stack argument limit (~100k+ args) for anything beyond ~1-2s of audio.
    let binary = '';
    const CHUNK = 8192;
    for (let i = 0; i < allBytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, allBytes.subarray(i, i + CHUNK) as unknown as number[]);
    }
    return {
      ok: true,
      bytesBase64: btoa(binary),
      sampleCount: state.sampleCount,
      callbackCount: state.callbackCount,
      audioContextState: state.audioContextState,
      elementSelector: state.elementSelector,
      elDiag: state.elDiag,
    };
  }, captureId);

  if (!result.ok) {
    throw new Error(`DOM_CAPTURE_${result.reason}`);
  }

  const allBytes = Uint8Array.from(Buffer.from(result.bytesBase64 as string, 'base64'));
  const int16Array = new Int16Array(allBytes.buffer, allBytes.byteOffset, allBytes.length / 2);

  const float32 = new Float32Array(int16Array.length);
  let sumSquares = 0;
  for (let i = 0; i < int16Array.length; i++) {
    float32[i] = int16Array[i] / 32768;
    sumSquares += float32[i] * float32[i];
  }
  const rms = int16Array.length > 0 ? Math.sqrt(sumSquares / int16Array.length) : 0;

  const encoder = new WavEncoder({ sampleRate: 48000, channels: 1 });
  const wavBuffer = encoder.encode(float32);

  const wavPath = path.join(outputDir, `p3l04-dom-receive-${recordingId}.wav`);
  fs.writeFileSync(wavPath, wavBuffer);

  const durationMs = (result.sampleCount as number) / 48;
  const metaPath = path.join(outputDir, `p3l04-dom-receive-${recordingId}.meta.json`);
  fs.writeFileSync(
    metaPath,
    JSON.stringify(
      {
        mechanism: 'dom-audio-element-captureStream',
        elementSelector: result.elementSelector,
        sampleCount: result.sampleCount,
        callbackCount: result.callbackCount,
        audioContextState: result.audioContextState,
        elDiag: result.elDiag,
        durationMs,
        rms,
      },
      null,
      2,
    ),
  );

  return { wavPath, metaPath, durationMs, rms, elDiag: result.elDiag };
}

export interface RtpAudioStats {
  packetsReceived?: number;
  bytesReceived?: number;
  packetsSent?: number;
  bytesSent?: number;
}

/**
 * P3-LIVE-06: samples inbound-rtp audio stats via the app's own `__meetDebug.sfuGetStats()` —
 * same `RTCStatsReport` iteration shape `call-driver.ts`'s `sampleOutboundAudioBytes()` already
 * uses (awaited, `.forEach` over the Map, `(kind ?? mediaType) === 'audio'` filter). Used to prove
 * whether real RTP packets are actually arriving at this page from the far end, independent of
 * local playout/rendering — see decisions/2026-07-10-p3-live-02-invalid-no-pc.md P3-LIVE-05.
 */
export async function sampleInboundAudioStats(page: Page): Promise<RtpAudioStats> {
  return page
    .evaluate(async () => {
      try {
        const stats = await (window as any).__meetDebug?.sfuGetStats?.();
        if (!stats) return {};
        let packetsReceived = 0;
        let bytesReceived = 0;
        stats.forEach((stat: any) => {
          if (stat.type === 'inbound-rtp' && (stat.kind ?? stat.mediaType) === 'audio') {
            packetsReceived += stat.packetsReceived || 0;
            bytesReceived += stat.bytesReceived || 0;
          }
        });
        return { packetsReceived, bytesReceived };
      } catch {
        return {};
      }
    })
    .catch(() => ({}));
}

/** Same shape, outbound side — for cross-referencing the sender leg during the same window. */
export async function sampleOutboundAudioStats(page: Page): Promise<RtpAudioStats> {
  return page
    .evaluate(async () => {
      try {
        const stats = await (window as any).__meetDebug?.sfuGetStats?.();
        if (!stats) return {};
        let packetsSent = 0;
        let bytesSent = 0;
        stats.forEach((stat: any) => {
          if (stat.type === 'outbound-rtp' && (stat.kind ?? stat.mediaType) === 'audio') {
            packetsSent += stat.packetsSent || 0;
            bytesSent += stat.bytesSent || 0;
          }
        });
        return { packetsSent, bytesSent };
      } catch {
        return {};
      }
    })
    .catch(() => ({}));
}
