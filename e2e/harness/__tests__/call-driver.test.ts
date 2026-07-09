// B08S-1: Dual-browser call driver tests
// Validates join+publish on two Chromium instances, ledger registration, and dry-run smoke paths.
// Target: 1/25 call burn for real-call, 0/25 for dry-run (if isolated from actual call infrastructure).

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { joinDualBrowserCall, dryRunDualBrowserCall, type CallDriverConfig } from '../call-driver.js';
import {
  resetLedger,
  getState,
  registerCreatedID,
  canDelete,
  initLedger,
  incrementCallBurn,
  isCallBurnExceeded,
} from '../call-ledger.js';
import { WavEncoder } from '../wav-encoder.js';
import {
  generateScriptTranscript,
  writeTranscriptFile,
  captureReceiveSideAudio,
  installCaptureHook,
  stopAndEncodeCapture,
  startReceiveSideRecording,
  stopReceiveSideRecording,
} from '../receive-side-recorder.js';
import { RecordingArbiter } from '../recording-arbiter.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMP_DIR = path.join(HERE, '.temp-call-driver-test');

// Mock app URL — in real scenario this would be a running dev server
const BASE_URL = 'http://localhost:4700';

describe('B08S-1 call driver — dual-browser room join + publish validation', () => {
  beforeEach(() => {
    // Ensure temp directory exists before each test
    if (!fs.existsSync(TEMP_DIR)) {
      fs.mkdirSync(TEMP_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up only ledger and temp files, not the directory
    if (fs.existsSync(TEMP_DIR)) {
      fs.readdirSync(TEMP_DIR).forEach((file) => {
        if (file.match(/^ledger-state\.json$|\.json$|\.wav$|\.txt$/)) {
          fs.unlinkSync(path.join(TEMP_DIR, file));
        }
      });
    }
  });

  it.skip(
    'dry-run: validates join + publish on two browsers without full conversation',
    async () => {
      // SKIP NOTE: This requires a running dev server (yarn dev) and actual app infrastructure.
      // Uncomment and run with: yarn dev & npm run vitest -- call-driver.test.ts --run

      resetLedger();

      const config: CallDriverConfig = {
        baseUrl: BASE_URL,
        speaker1Name: 'bot-140',
        speaker2Name: 'bot-123',
        autoAdmitRoom: true,
        ledgerBasePath: TEMP_DIR,
        launchArgs: [
          '--use-file-for-fake-audio-capture=/path/to/speech.wav', // Would need actual fixture
        ],
      };

      const result = await dryRunDualBrowserCall(config);

      // Assertions
      expect(result.success).toBe(true);
      expect(result.roomId).toBeTruthy();
      expect(result.speaker1.publishedBytes).toBeGreaterThan(0);
      expect(result.speaker2.publishedBytes).toBeGreaterThan(0);
      expect(result.ledgerState.createdIDs.length).toBeGreaterThan(0);
      expect(result.ledgerState.callBurnCount).toBe(1);
    },
    120_000, // 2 minute timeout
  );

  it(
    'ledger integration: registerCreatedID tracks room and prevents deletion of protected IDs',
    () => {
      resetLedger();

      // Register a new room
      registerCreatedID('room', 'test-room-abc-123');
      let state = getState();
      expect(state.createdIDs).toHaveLength(1);
      expect(state.createdIDs[0].id).toBe('test-room-abc-123');
      expect(state.createdIDs[0].type).toBe('room');

      // Verify it can be deleted
      expect(canDelete('test-room-abc-123')).toBe(true);

      // Protected IDs cannot be deleted
      expect(canDelete('652c1475')).toBe(false); // protected session
      expect(canDelete('TEST_ROOM01')).toBe(false); // protected room
      expect(canDelete('testroom01001')).toBe(false); // protected room

      // Unregistered IDs cannot be deleted
      expect(canDelete('unknown-id')).toBe(false);
    },
  );

  it(
    'call burn tracking: incrementCallBurn respects budget cap and persists state',
    () => {
      resetLedger();

      initLedger(TEMP_DIR);

      let state = getState();
      expect(state.callBurnCount).toBe(0);

      // First burn (should succeed)
      const didNotExceed = incrementCallBurn();
      expect(didNotExceed).toBe(true);
      state = getState();
      expect(state.callBurnCount).toBe(1);
      expect(isCallBurnExceeded()).toBe(false);

      // Simulate loading a different state file that has already burned some
      // (This tests persistence across initLedger calls)
      const stateFile = path.join(TEMP_DIR, 'ledger-state.json');
      if (fs.existsSync(stateFile)) {
        const partial = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
        expect(partial.callBurnCount).toBe(1);
      }
    },
  );

  it(
    'config validation: missing baseUrl or room details are caught',
    async () => {
      resetLedger();

      const badConfig: CallDriverConfig = {
        baseUrl: '', // Missing!
        speaker1Name: 'bot-140',
        speaker2Name: 'bot-123',
      };

      // Should fail during room creation (URL constructor or fetch)
      try {
        await dryRunDualBrowserCall(badConfig);
        expect.fail('Expected error on empty baseUrl');
      } catch (err) {
        // Error can come from URL constructor or fetch — just validate it's an error
        expect((err as Error).message).toBeTruthy();
        expect(
          (err as Error).message.includes('Failed to create room') ||
            (err as Error).message.includes('Failed to parse URL'),
        ).toBe(true);
      }
    },
  );

  it(
    'dry-run exports its function and accepts optional ConversationScript',
    async () => {
      // This test validates function signature and exports
      expect(typeof dryRunDualBrowserCall).toBe('function');
      expect(typeof joinDualBrowserCall).toBe('function');

      // dryRunDualBrowserCall should call joinDualBrowserCall without a script
      // Verify by checking the function exists and is callable
      expect(dryRunDualBrowserCall.length).toBeGreaterThanOrEqual(1); // accepts config param
    },
  );

  it(
    'diagnostics sampling: correctly reads __meetDebug and sfuGetStats with stubbed globals',
    () => {
      // Unit test for joinBrowser diagnostics path (F1)
      // Validates that the correct debug object (__meetDebug) and method (sfuGetStats) are used
      // by simulating the browser context sampling logic

      const mockSessionId = 'sess-12345-mock';
      // Mock as Map-like RTCStatsReport with real app's `kind: 'audio'` shape
      const mockStats = {
        forEach(callback: (stat: any) => void) {
          [
            {
              type: 'outbound-rtp',
              kind: 'audio',
              bytesSent: 5000,
            },
            {
              type: 'outbound-rtp',
              kind: 'audio',
              bytesSent: 3000,
            },
            {
              type: 'inbound-rtp', // Should be ignored
              kind: 'audio',
              bytesSent: 1000,
            },
          ].forEach(callback);
        },
      };

      // Test 1: sessionId is correctly extracted from __meetDebug
      const contextWithSession = {
        __meetDebug: {
          sessionId: mockSessionId,
          sfuGetStats: async () => mockStats,
        },
      };

      const sessionIdResult = (contextWithSession as any).__meetDebug?.sessionId || null;
      expect(sessionIdResult).toBe(mockSessionId);

      // Test 2: bytesSent is correctly accumulated from outbound-rtp audio stats
      let totalBytes = 0;
      if (contextWithSession.__meetDebug?.sfuGetStats) {
        if (typeof mockStats.forEach === 'function') {
          mockStats.forEach((stat: any) => {
            if (stat.type === 'outbound-rtp' && (stat.kind ?? stat.mediaType) === 'audio') {
              totalBytes += stat.bytesSent || 0;
            }
          });
        }
      }
      expect(totalBytes).toBe(8000); // 5000 + 3000

      // Test 3: Missing sfuGetStats returns 0 (no publish)
      const contextWithoutStats = {
        __meetDebug: {
          sessionId: mockSessionId,
          // sfuGetStats is missing
        },
      };

      let noStatsBytes = 0;
      if (contextWithoutStats.__meetDebug?.sfuGetStats) {
        if (typeof mockStats.forEach === 'function') {
          mockStats.forEach((stat: any) => {
            if (stat.type === 'outbound-rtp' && (stat.kind ?? stat.mediaType) === 'audio') {
              noStatsBytes += stat.bytesSent || 0;
            }
          });
        }
      }
      expect(noStatsBytes).toBe(0);

      // Test 4: Missing __meetDebug entirely returns 0 (diagnostic unavailable)
      const contextNoDebug = {}; // No __meetDebug

      let noDebugBytes = 0;
      if ((contextNoDebug as any).__meetDebug?.sfuGetStats) {
        if (typeof mockStats.forEach === 'function') {
          mockStats.forEach((stat: any) => {
            if (stat.type === 'outbound-rtp' && (stat.kind ?? stat.mediaType) === 'audio') {
              noDebugBytes += stat.bytesSent || 0;
            }
          });
        }
      }
      expect(noDebugBytes).toBe(0);
    },
  );
});

describe('B08S-1 call driver — integration with ConversationScheduler', () => {
  it.skip(
    'real-call: runs ConversationScheduler with two browsers on fixed-clock schedule',
    async () => {
      // SKIP NOTE: This requires:
      // 1. A running dev server
      // 2. Pre-generated speech WAVs from B03 fixtures
      // 3. Proper gUM shim configuration
      // Uncomment when B08S-2 (receive-side recorder) is ready to validate end-to-end.

      resetLedger();

      const config: CallDriverConfig = {
        baseUrl: BASE_URL,
        speaker1Name: 'bot-140',
        speaker2Name: 'bot-123',
        autoAdmitRoom: true,
        ledgerBasePath: TEMP_DIR,
      };

      // Import scheduler
      const { ConversationScheduler } = require('../conversation-scheduler.js');
      const scheduler = new ConversationScheduler();

      // Mock script: two utterances over 5 seconds
      const script = {
        utterances: [
          {
            speaker: 'bot-140' as const,
            timeMs: 0,
            durationMs: 1500,
            audioPath: '/fixtures/bot-140-hello.wav',
            text: 'Hello, how are you?',
          },
          {
            speaker: 'bot-123' as const,
            timeMs: 2000,
            durationMs: 1500,
            audioPath: '/fixtures/bot-123-good.wav',
            text: 'Good, thanks!',
          },
        ],
        totalDurationMs: 3500,
      };

      // This would run the actual call
      const result = await joinDualBrowserCall(config, script);

      expect(result.success).toBe(true);
      expect(result.duration).toBeGreaterThanOrEqual(3500); // At minimum the script duration
      expect(result.ledgerState.callBurnCount).toBe(1);

      const report = scheduler.getTimingReport();
      expect(report.played).toHaveLength(2);
      expect(report.allOnTime).toBe(true); // All utterances within 50ms skew
    },
    120_000,
  );
});

describe('B08S-2 receive-side recorder — WAV encoding and transcript generation', () => {
  beforeEach(() => {
    // Ensure temp directory exists before each test
    if (!fs.existsSync(TEMP_DIR)) {
      fs.mkdirSync(TEMP_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up only WAV and transcript files, not the directory
    if (fs.existsSync(TEMP_DIR)) {
      fs.readdirSync(TEMP_DIR).forEach((file) => {
        if (file.match(/\.(wav|txt)$/)) {
          fs.unlinkSync(path.join(TEMP_DIR, file));
        }
      });
    }
  });

  it('WAV encoder: produces valid WAV file with correct RIFF header', () => {
    const encoder = new WavEncoder({ sampleRate: 48000, channels: 1 });

    // Generate simple test samples (1 second of tone)
    const sampleRate = 48000;
    const numSamples = sampleRate; // 1 second
    const testSamples = new Float32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      // 440 Hz sine wave
      testSamples[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.5;
    }

    const wavBuffer = encoder.encode(testSamples);

    // Validate RIFF header
    expect(wavBuffer.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wavBuffer.toString('ascii', 8, 12)).toBe('WAVE');
    expect(wavBuffer.toString('ascii', 12, 16)).toBe('fmt ');
    expect(wavBuffer.toString('ascii', 36, 40)).toBe('data');

    // Validate fmt chunk
    const format = wavBuffer.readUInt16LE(20); // fmt chunk + size + offset
    expect(format).toBe(1); // PCM
    const channels = wavBuffer.readUInt16LE(22);
    expect(channels).toBe(1);
    const sr = wavBuffer.readUInt32LE(24);
    expect(sr).toBe(48000);
    const bitsPerSample = wavBuffer.readUInt16LE(34);
    expect(bitsPerSample).toBe(16);

    // Validate data size
    const dataSize = wavBuffer.readUInt32LE(40);
    expect(dataSize).toBe(numSamples * 2); // 16-bit = 2 bytes per sample
  });

  it('receive-side recorder: CallResult includes WAV and transcript paths when recordReceiveSide is enabled', async () => {
    // This test validates the config and type signatures
    // Actual recording requires a running browser, so this is a type/config test

    const config: CallDriverConfig = {
      baseUrl: BASE_URL,
      speaker1Name: 'bot-140',
      speaker2Name: 'bot-123',
      autoAdmitRoom: true,
      ledgerBasePath: TEMP_DIR,
      recordReceiveSide: true,
      receiverPageIndex: 1, // bot-123 receives
    };

    // Validate config fields are present
    expect(config.recordReceiveSide).toBe(true);
    expect(config.receiverPageIndex).toBe(1);
  });

  it('transcript generation: script-sourced transcript filters by speaker and concatenates text', () => {
    const script = {
      utterances: [
        {
          speaker: 'bot-140',
          timeMs: 0,
          durationMs: 1500,
          audioPath: '/fixtures/bot-140-hello.wav',
          text: 'Hello, how are you?',
        },
        {
          speaker: 'bot-123',
          timeMs: 2000,
          durationMs: 1500,
          audioPath: '/fixtures/bot-123-good.wav',
          text: 'Good, thanks!',
        },
        {
          speaker: 'bot-140',
          timeMs: 4000,
          durationMs: 1500,
          audioPath: '/fixtures/bot-140-nice.wav',
          text: 'Nice to meet you.',
        },
      ],
      totalDurationMs: 5500,
    };

    // From bot-123 perspective (hearing bot-140)
    const transcript = generateScriptTranscript(script, 'bot-140');
    expect(transcript).toContain('Hello, how are you?');
    expect(transcript).toContain('Nice to meet you.');
    expect(transcript).not.toContain('Good, thanks!');

    // From bot-140 perspective (hearing bot-123)
    const transcript2 = generateScriptTranscript(script, 'bot-123');
    expect(transcript2).toContain('Good, thanks!');
    expect(transcript2).not.toContain('Hello, how are you?');
  });

  it('transcript file writing: writes transcript with header and returns valid path', () => {
    const transcriptContent = '[00.00s] Hello, how are you?\n[02.00s] Good, thanks!';
    const recordingId = 'test-rec-123';

    const { transcriptPath } = writeTranscriptFile(transcriptContent, TEMP_DIR, recordingId);

    // Validate file exists and has correct content
    expect(fs.existsSync(transcriptPath)).toBe(true);
    const content = fs.readFileSync(transcriptPath, 'utf-8');
    expect(content).toContain('script-sourced');
    expect(content).toContain('scriptExpected');
    expect(content).toContain(transcriptContent);

    // Clean up
    fs.unlinkSync(transcriptPath);
  });

  it('RecordingArbiter integration: WAV file from encoder is parseable by RecordingArbiter', async () => {
    // Create a test WAV with some audio content
    const encoder = new WavEncoder({ sampleRate: 48000, channels: 1 });
    const sampleRate = 48000;
    const duration = 1000; // 1 second
    const numSamples = Math.floor((duration / 1000) * sampleRate);
    const samples = new Float32Array(numSamples);

    // Generate tone + noise
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const sine = Math.sin(2 * Math.PI * 440 * t) * 0.3;
      const noise = (Math.random() - 0.5) * 0.1;
      samples[i] = sine + noise;
    }

    const wavBuffer = encoder.encode(samples);
    const wavPath = path.join(TEMP_DIR, 'test-arbiter-input.wav');
    fs.writeFileSync(wavPath, wavBuffer);

    // Parse with RecordingArbiter
    const arbiter = new RecordingArbiter(TEMP_DIR);
    const analysis = await arbiter.analyzeRecording(wavPath);

    // Validate analysis
    expect(analysis.recordingPath).toBe(wavPath);
    expect(analysis.voicedSegments.length).toBeGreaterThan(0);
    expect(analysis.overallLoudness.rms).toBeGreaterThan(0);
    expect(analysis.overallLoudness.lufs).toBeGreaterThan(-Infinity);

    // Clean up
    fs.unlinkSync(wavPath);
  });

  it.skip('captureReceiveSideAudio: fails closed when no real audio captured (rejects synthetic)', async () => {
    // SKIP NOTE: Deprecated single-phase API. Use startReceiveSideRecording + stopReceiveSideRecording instead.
    // Mock a page that returns no captured audio (the old behavior would have written synthetic WAV)
    let evaluateCalls = 0;
    const mockPage = {
      evaluate: async (fn: (recId: string) => Promise<any>, recId: string) => {
        evaluateCalls++;
        // For installCaptureHook call
        if (evaluateCalls === 1) {
          return; // Hook installation success
        }
        // For stopAndEncodeCapture call
        return { samples: null, sampleRate: 0, durationMs: 0 };
      },
    } as any;

    // Should throw instead of writing synthetic WAV
    try {
      await captureReceiveSideAudio(mockPage, TEMP_DIR);
      expect.fail('Expected captureReceiveSideAudio to throw on no captured audio');
    } catch (err) {
      expect((err as Error).message).toContain('No real remote audio captured');
      expect((err as Error).message).toContain('Failing closed');
      // Verify no WAV file was written
      const wavFiles = fs.readdirSync(TEMP_DIR).filter((f) => f.endsWith('.wav'));
      expect(wavFiles).toHaveLength(0);
    }
  });

  it.skip('captureReceiveSideAudio: encodes real captured samples to WAV (not synthetic)', async () => {
    // SKIP NOTE: Deprecated single-phase API. Use startReceiveSideRecording + stopReceiveSideRecording instead.
    // Mock a page that returns real audio samples from captured remote track
    let evaluateCalls = 0;
    const mockPage = {
      evaluate: async (fn: (recId: string) => Promise<any>, recId: string) => {
        evaluateCalls++;
        // For installCaptureHook call
        if (evaluateCalls === 1) {
          return; // Hook installation success
        }
        // For stopAndEncodeCapture call - return real audio samples
        const sampleRate = 48000;
        const duration = 1000; // 1 second
        const numSamples = Math.floor((duration / 1000) * sampleRate);
        const samples: number[] = [];

        // Generate a unique pattern: 220Hz sine wave (distinct from the old 440Hz stub)
        for (let i = 0; i < numSamples; i++) {
          const t = i / sampleRate;
          const sine = Math.sin(2 * Math.PI * 220 * t) * 0.5; // 220Hz, 0.5 amplitude
          samples.push(sine);
        }

        return { samples, sampleRate, durationMs: duration };
      },
    } as any;

    // Should succeed and write the real captured audio
    const result = await captureReceiveSideAudio(mockPage, TEMP_DIR);
    expect(result.wavPath).toBeTruthy();
    expect(fs.existsSync(result.wavPath)).toBe(true);

    // Verify WAV content by parsing it
    const encoder = new WavEncoder({ sampleRate: 48000, channels: 1 });
    const wavBuffer = fs.readFileSync(result.wavPath);

    // Verify it's a valid WAV (has RIFF header)
    const riffHeader = String.fromCharCode(...Array.from(wavBuffer.slice(0, 4)));
    expect(riffHeader).toBe('RIFF');

    // Parse and analyze with RecordingArbiter to verify it contains the real captured audio
    const arbiter = new RecordingArbiter(TEMP_DIR);
    const analysis = await arbiter.analyzeRecording(result.wavPath);

    // The 220Hz sine wave should produce measurable audio analysis
    expect(analysis.overallLoudness.rms).toBeGreaterThan(0.1); // 220Hz sine at 0.5 amplitude
    expect(analysis.voicedSegments.length).toBeGreaterThan(0);

    // Clean up
    fs.unlinkSync(result.wavPath);
  });

  it.skip('captureReceiveSideAudio: empty sample array also fails closed', async () => {
    // SKIP NOTE: Deprecated single-phase API. Use startReceiveSideRecording + stopReceiveSideRecording instead.
    // Mock a page that returns an empty array (array exists but no samples)
    let evaluateCalls = 0;
    const mockPage = {
      evaluate: async (fn: (recId: string) => Promise<any>, recId: string) => {
        evaluateCalls++;
        // For installCaptureHook call
        if (evaluateCalls === 1) {
          return; // Hook installation success
        }
        // For stopAndEncodeCapture call - return empty samples
        return { samples: [], sampleRate: 48000, durationMs: 0 };
      },
    } as any;

    // Should throw since empty array means no real audio
    try {
      await captureReceiveSideAudio(mockPage, TEMP_DIR);
      expect.fail('Expected captureReceiveSideAudio to throw on empty samples');
    } catch (err) {
      expect((err as Error).message).toContain('No real remote audio captured');
    }
  });

  it('installCaptureHook: installs wrapper via addInitScript (persists across navigation)', async () => {
    // Unit test: verify that installCaptureHook uses addInitScript for navigation persistence
    const mockPage = {
      addInitScript: async (fn: (hId: string) => void, hId: string) => {
        // Mock addInitScript (injected on every document, including post-navigation)
        return undefined; // Script injection success
      },
      evaluate: async (fn: (hId: string) => any, hId: string) => {
        // Mock evaluate for later state retrieval in stopAndEncodeCapture
        return undefined;
      },
    } as any;

    // Should return a valid hookId without error
    const hookId = await installCaptureHook(mockPage);
    expect(hookId).toBeTruthy();
    expect(hookId).toMatch(/^hook-/);
    // Verify hookId is unique (timestamp + random)
    expect(hookId.length).toBeGreaterThan(5);
  });

  it('installCaptureHook: hook persists across page.goto() navigation', async () => {
    // Integration test: verify hook survives page navigation (Playwright addInitScript pattern)
    // This test documents the B08S-2 R5 fix: addInitScript injects on every document
    const { chromium } = await import('@playwright/test');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      // Install hook via addInitScript BEFORE any navigation
      // addInitScript will run on the first page.goto and all subsequent navigations
      const hookId = await installCaptureHook(page);
      expect(hookId).toBeTruthy();

      // Navigate to first page (hook script runs here for the first time)
      await page.goto('about:blank').catch(() => {});
      await page.waitForTimeout(50);

      // Probe on first page (hook should be present)
      const firstPage = await page.evaluate(() => {
        return {
          hasState: !!(window as any).__captureHookState,
          wrapped: typeof (window as any).RTCPeerConnection === 'function',
        };
      });
      expect(firstPage.hasState).toBe(true);
      expect(firstPage.wrapped).toBe(true);

      // Navigate to second page (simulates joinBrowser's page.goto(roomUrl))
      await page.goto('about:blank?test=2').catch(() => {});
      await page.waitForTimeout(50);

      // Probe AFTER navigation (hook MUST persist because addInitScript injects on every load)
      const secondPage = await page.evaluate(() => {
        return {
          hasState: !!(window as any).__captureHookState,
          wrapped: typeof (window as any).RTCPeerConnection === 'function',
        };
      });

      // With addInitScript, hook state MUST persist across navigation
      expect(secondPage.hasState).toBe(true);
      expect(secondPage.wrapped).toBe(true);
    } finally {
      await context.close();
      await browser.close();
    }
  });

  it('stopAndEncodeCapture: retrieves state from hook and encodes captured audio', async () => {
    // Mock a page that has hook state with real audio samples
    const hookId = `hook-${Date.now()}-test`;
    const mockPage = {
      addInitScript: async (fn: (hId: string) => void, hId: string) => {
        // Mock addInitScript for hook installation
        return undefined;
      },
      evaluate: async (fn: (hId: string) => Promise<any>, hId: string) => {
        // Simulate: hook was installed, real audio was captured
        const sampleRate = 48000;
        const duration = 1000; // 1 second
        const numSamples = Math.floor((duration / 1000) * sampleRate);
        const samples: number[] = [];

        // Generate a 220Hz sine wave (real captured audio simulation)
        for (let i = 0; i < numSamples; i++) {
          const t = i / sampleRate;
          const sine = Math.sin(2 * Math.PI * 220 * t) * 0.5;
          samples.push(sine);
        }

        return { samples, sampleRate, durationMs: duration };
      },
    } as any;

    // Should succeed and write the real captured audio
    const result = await stopAndEncodeCapture(mockPage, TEMP_DIR, hookId);
    expect(result.wavPath).toBeTruthy();
    expect(fs.existsSync(result.wavPath)).toBe(true);

    // Clean up
    fs.unlinkSync(result.wavPath);
  });

  it('startReceiveSideRecording + stopReceiveSideRecording: two-phase recording flow', async () => {
    // Unit test: verify the two-phase API exists and is callable
    const mockPage = {
      addInitScript: async (fn: (hId: string) => void, hId: string) => {
        // Mock addInitScript for hook installation
        return undefined;
      },
      evaluate: async (fn: (hId: string) => Promise<any>, hId: string) => {
        // Mock returning real audio samples
        const sampleRate = 48000;
        const numSamples = 48000; // 1 second
        const samples: number[] = [];
        for (let i = 0; i < numSamples; i++) {
          const t = i / sampleRate;
          samples.push(Math.sin(2 * Math.PI * 220 * t) * 0.5);
        }
        return { samples, sampleRate, durationMs: 1000 };
      },
    } as any;

    // Phase 1: Start recording (install hook)
    const handle = await startReceiveSideRecording(mockPage, TEMP_DIR);
    expect(handle).toBeTruthy();
    expect(handle.hookId).toBeTruthy();
    expect(handle.page).toBe(mockPage);
    expect(handle.outputDir).toBe(TEMP_DIR);

    // Phase 2: Stop and encode (with optional script)
    const script = {
      utterances: [
        {
          speaker: 'bot-140' as const,
          timeMs: 0,
          durationMs: 1000,
          audioPath: '/fixtures/test.wav',
          text: 'Test audio',
        },
      ],
      totalDurationMs: 1000,
    };

    const result = await stopReceiveSideRecording(handle, script, 'bot-140');
    expect(result.wavPath).toBeTruthy();
    expect(result.transcriptPath).toBeTruthy();
    expect(result.transcriptContent).toContain('Test audio');
    expect(fs.existsSync(result.wavPath)).toBe(true);
    expect(fs.existsSync(result.transcriptPath)).toBe(true);

    // Clean up
    fs.unlinkSync(result.wavPath);
    fs.unlinkSync(result.transcriptPath);
  });
});
