import { expect, type Page, test } from '@playwright/test';
import { loginAsJrom } from '../../fixtures/auth';

test('DR-49 diagnostics TURN health check reports relay reachable and closes probe PC', async ({ page }) => {
  await routeTurnIceConfig(page);
  await installTurnHealthProbe(page, 'relay');
  await loginAsJrom(page);

  await page.goto('/app/diagnostics');
  await page.getByRole('button', { name: 'Check TURN' }).click();

  await expect(page.getByText(/TURN reachable/)).toBeVisible();
  await expect.poll(() => turnHealthProbeSnapshot(page)).toMatchObject({ created: 1, closed: 1, setLocalDescription: 1 });
});

test('DR-49 diagnostics TURN health timeout reports unavailable and closes probe PC', async ({ page }) => {
  await routeTurnIceConfig(page);
  await installTurnHealthProbe(page, 'timeout');
  await loginAsJrom(page);

  await page.goto('/app/diagnostics');
  await page.getByRole('button', { name: 'Check TURN' }).click();

  await expect(page.getByText(/TURN unavailable/)).toBeVisible({ timeout: 7000 });
  await expect(page.getByText(/Timed out waiting for a relay candidate/)).toBeVisible();
  await expect.poll(() => turnHealthProbeSnapshot(page)).toMatchObject({ created: 1, closed: 1, setLocalDescription: 1 });
});

async function routeTurnIceConfig(page: Page): Promise<void> {
  await page.route('**/api/ice-config', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        iceServers: [
          {
            urls: 'turn:turn.example.test:3478?transport=udp',
            username: 'fresh-user',
            credential: 'fresh-credential',
          },
        ],
      }),
    });
  });
}

async function installTurnHealthProbe(page: Page, mode: 'relay' | 'timeout'): Promise<void> {
  await page.addInitScript(({ mode }) => {
    window.__turnHealthProbe = { created: 0, closed: 0, setLocalDescription: 0 };
    window.__turnHealthMode = mode;

    class MockPeerConnection {
      onicecandidate: ((event: { candidate: { toJSON: () => RTCIceCandidateInit } | null }) => void) | null = null;
      onicegatheringstatechange: (() => void) | null = null;
      iceGatheringState: RTCIceGatheringState = 'new';

      configuration?: RTCConfiguration;

      constructor(configuration?: RTCConfiguration) {
        this.configuration = configuration;
        window.__turnHealthProbe!.created += 1;
      }

      createDataChannel(): Record<string, never> {
        return {};
      }

      async createOffer(): Promise<RTCSessionDescriptionInit> {
        return { type: 'offer', sdp: 'v=0\r\n' };
      }

      async setLocalDescription(): Promise<void> {
        window.__turnHealthProbe!.setLocalDescription += 1;
        if (window.__turnHealthMode !== 'relay') return;
        window.setTimeout(() => {
          this.onicecandidate?.({
            candidate: {
              toJSON: () => ({
                candidate: 'candidate:1 1 udp 2122260223 203.0.113.1 49170 typ relay raddr 0.0.0.0 rport 0',
              }),
            },
          });
        }, 0);
      }

      close(): void {
        window.__turnHealthProbe!.closed += 1;
      }
    }

    Object.defineProperty(window, 'RTCPeerConnection', {
      configurable: true,
      value: MockPeerConnection,
    });
  }, { mode });
}

async function turnHealthProbeSnapshot(page: Page): Promise<{ created: number; closed: number; setLocalDescription: number }> {
  return page.evaluate(() => window.__turnHealthProbe ?? { created: 0, closed: 0, setLocalDescription: 0 });
}

declare global {
  interface Window {
    __turnHealthMode?: 'relay' | 'timeout';
    __turnHealthProbe?: {
      created: number;
      closed: number;
      setLocalDescription: number;
    };
  }
}
