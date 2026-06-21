/**
 * B0 — Local 2-client mutual measured audio (R1 foundation)
 * Uses DISTINCT fake WAVs + shared measurement module.
 * Proves: DEV up, throwaway room, host+guest knock→admit via real selectors,
 * mutual PASS (energy >=3s AND inbound bytes delta) both directions.
 * Artifacts: 2-tile screenshot + JSON metrics + room id for B1.
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
  TONE_HOST,
  TONE_GUEST,
  launchClientWithFakeAudio,
  createThrowawayRoom,
  joinAsHost,
  knockAsGuest,
  admitFromHost,
  assertMutualAudio,
  captureProofArtifacts,
  closeBrowsers,
} from '../../fixtures/audio-rig';
import { ownerSessionCookie } from '../../fixtures/rooms';

const BATCH_DIR = path.resolve(process.cwd(), '../plan/WK_0526/meet-remote-audio-e2e/projcore-run-2026-06-19/batch-artifacts/batch-0');
const SCREEN_DIR = path.join(BATCH_DIR, 'screenshots');
const METRICS_DIR = path.join(BATCH_DIR, 'metrics');

test.describe('B0: local 2-client mutual audio rig (R1)', () => {
  test('DEV up + throwaway room + distinct WAVs + knock/admit + mutual measured audio PASS', async ({ request }) => {
    fs.mkdirSync(SCREEN_DIR, { recursive: true });
    fs.mkdirSync(METRICS_DIR, { recursive: true });

    // 1. Create dedicated throwaway (record id for B1; never TEST_ROOM01)
    const room = await createThrowawayRoom(request, 'RA-E2E');
    console.log('[B0] THROWAWAY ROOM (for B1 reuse):', room.id, room.slug, room.title);

    // 2. Launch TWO clients with DISTINCT tones (guardrail #2)
    const { browser: hostBrowser, page: host } = await launchClientWithFakeAudio(TONE_HOST);
    const { browser: guestBrowser, page: guest } = await launchClientWithFakeAudio(TONE_GUEST);

    try {
      // 3. Host joins (owner path)
      await joinAsHost(host, room, 'rig-host');

      // 4. Guest knocks
      await knockAsGuest(guest, room, 'rig-guest');

      // 5. Host admits using the EXACT selector from live guardrail #1 inspection (.knock-toast)
      await admitFromHost(host, 'rig-guest');

      // Ensure 2 tiles
      await expect(host.locator('app-tile')).toHaveCount(2, { timeout: 15000 });
      await expect(guest.locator('.call-panel')).toBeVisible({ timeout: 10000 });

      // 6. Screenshot the 2-tile in-call view (required artifact)
      await host.screenshot({ path: path.join(SCREEN_DIR, 'b0-2-tile-in-call.png'), fullPage: true });

      // 7. Mutual measured audio proof (dual criteria, >=3s + bytes)
      const metrics = await assertMutualAudio(host, guest);

      // 8. Dump JSON metrics artifact
      const metricsPath = path.join(METRICS_DIR, 'b0-mutual-metrics.json');
      fs.writeFileSync(metricsPath, JSON.stringify({ room: { id: room.id, slug: room.slug, title: room.title }, metrics, timestamp: Date.now() }, null, 2));
      console.log('[B0] metrics artifact:', metricsPath);

      // 9. Capture via helper too
      await captureProofArtifacts(host, metrics, SCREEN_DIR);

      // Final assertions already inside assertMutualAudio
      expect(metrics.hostMeasuresGuest.pass).toBe(true);
      expect(metrics.guestMeasuresHost.pass).toBe(true);

      // Final 2-tile screenshot (required)
      await host.screenshot({ path: path.join(SCREEN_DIR, 'b0-2-tile-in-call-final.png'), fullPage: true });

      console.log('[B0] LOCAL MUTUAL AUDIO CHECK GREEN — room id recorded for B1:', room.id);

      // NOTE: do NOT delete the room — keep the ONE throwaway + its id for B1 reuse (guardrail #4)
    } finally {
      // Close custom browsers (ignore errors from runner teardown)
      try { await hostBrowser.close(); } catch {}
      try { await guestBrowser.close(); } catch {}
    }
  });
});
