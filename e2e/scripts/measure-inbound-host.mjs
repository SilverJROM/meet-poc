/*
 * measure-inbound-host.mjs — joins AGENTROOM, publishes a tone, and measures INBOUND audio
 * bytesReceived per remote track over time. Proves the host is actually RECEIVING a peer's voice
 * (not just that the peer is sending). Usage: node measure-inbound-host.mjs [--secs 40]
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const arg = (f, d) => { const i = process.argv.indexOf(f); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const SECS = parseInt(arg('--secs', '40'), 10);
const FLAGS = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
  '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'];
const TONE = path.resolve(REPO_ROOT, 'e2e/fixtures/audio/tone-660.wav');
const EMAIL = 'jrom@silverjrom.app', PW = 'Admin@1234';
const AGENT = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'AGENTROOM.json'), 'utf8'));
const ROOM_URL = `http://localhost:4700/room/${AGENT.id}`;
const log = (...a) => console.log('[MEASURE]', ...a);

async function main() {
  const launchArgs = [...FLAGS];
  if (fs.existsSync(TONE)) launchArgs.push(`--use-file-for-fake-audio-capture=${TONE}`);
  const browser = await chromium.launch({ headless: true, args: launchArgs });
  const page = await (await browser.newContext({ permissions: ['microphone', 'camera'] })).newPage();
  await page.goto('http://localhost:4700/login').catch(() => {});
  await page.locator('input[type="email"], #login-email').fill(EMAIL).catch(() => {});
  await page.locator('input[type="password"], #login-password').fill(PW).catch(() => {});
  await page.getByRole('button', { name: /Sign in|Log in/i }).click().catch(() => {});
  await page.waitForTimeout(1400);
  await page.goto(ROOM_URL).catch(() => {});
  await page.waitForTimeout(700);
  const cfg = page.getByRole('button', { name: /Test \/ configure devices|Test|configure/i });
  if (await cfg.count() > 0) { await cfg.first().click().catch(() => {}); await page.waitForTimeout(400); }
  const ts = page.getByRole('button', { name: 'Test speaker' });
  if (await ts.count() > 0) { await ts.first().click().catch(() => {}); await page.waitForTimeout(1100); }
  const yes = page.locator('button.speaker-confirm-yes, button:has-text("Yes")').first();
  if (await yes.count() > 0 && await yes.isVisible().catch(() => false)) { await yes.click().catch(() => {}); await page.waitForTimeout(350); }
  const cb = page.getByRole('button', { name: /Confirm — everything works|Check mic and speaker/i });
  if (await cb.count() > 0) { await cb.first().click().catch(() => {}); await page.waitForTimeout(400); }
  const nm = page.locator('#display-name'); if (await nm.count() > 0) await nm.fill('Measurer').catch(() => {});
  await page.getByRole('button', { name: 'Join' }).click().catch(() => {});
  for (let i = 0; i < 40; i++) { if (await page.locator('button[aria-label="Leave call"]').count().catch(() => 0)) { log('in-call'); break; } await page.waitForTimeout(500); }

  const readInbound = () => page.evaluate(async () => {
    const d = window.__meetDebug || {}; let stats = null;
    try { if (d.sfuGetStats) stats = await d.sfuGetStats(); } catch {}
    const out = [];
    if (stats) stats.forEach(s => { if (s.type === 'inbound-rtp' && s.kind === 'audio') out.push({ t: (s.trackIdentifier || '').slice(0, 8), br: s.bytesReceived || 0, pkts: s.packetsReceived || 0 }); });
    return out;
  }).catch(() => []);

  let prev = {};
  for (let s = 0; s < SECS; s += 4) {
    const inb = await readInbound();
    const parts = inb.map(x => { const rising = (x.br > (prev[x.t] || 0)); prev[x.t] = x.br; return `track ${x.t}: bytesRecv=${x.br} pkts=${x.pkts} ${rising ? 'RISING' : 'flat'}`; });
    log(`t=${s}s  remote-audio-inbound: ${parts.length ? parts.join(' | ') : 'NONE (no remote audio arriving)'}`);
    await page.waitForTimeout(4000);
  }
  await browser.close().catch(() => {});
  process.exit(0);
}
main().catch(e => { console.error('[MEASURE] fatal', e); process.exit(1); });
