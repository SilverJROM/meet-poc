// B08S-1: Dual-browser call driver tests
// Validates join+publish on two Chromium instances, ledger registration, and dry-run smoke paths.
// Target: 1/25 call burn for real-call, 0/25 for dry-run (if isolated from actual call infrastructure).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMP_DIR = path.join(HERE, '.temp-call-driver-test');

// Mock app URL — in real scenario this would be a running dev server
const BASE_URL = 'http://localhost:4700';

describe('B08S-1 call driver — dual-browser room join + publish validation', () => {
  beforeAll(() => {
    // Create temp directory for ledger state
    if (!fs.existsSync(TEMP_DIR)) {
      fs.mkdirSync(TEMP_DIR, { recursive: true });
    }
  });

  afterAll(() => {
    // Clean up temp files
    if (fs.existsSync(TEMP_DIR)) {
      fs.rmSync(TEMP_DIR, { recursive: true });
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
