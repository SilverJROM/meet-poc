// B5 lobby-render smoke (NS5-compliant): proves the new lobbySelfTestFlag /
// micTestFlagged / micTestDeviceLabel bindings do NOT crash the lobby at runtime.
// It does NOT (and cannot) exercise the "silent mic flag" — fake media tones every
// input (NS5), so this only asserts: lobby renders, no console errors, app-root mounts.
import { chromium } from 'playwright';

const TARGET = 'http://localhost:4700/room/3f324d8be763';
const OUT = '/home/agjrom/websites/meet-poc/plan/WK_0526/meet-diagnostics/projcore-run-2026-05-29/validation/B5/screenshots/lobby-render-b5.png';

const browser = await chromium.launch({
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
  ],
});
const ctx = await browser.newContext({
  permissions: ['microphone', 'camera'],
});
const page = await ctx.newPage();

const consoleErrors = [];
const pageErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => { pageErrors.push(String(e)); });

await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 30000 });
// allow Angular to bootstrap + lobby to render
await page.waitForSelector('app-root', { timeout: 15000 });
await page.waitForTimeout(4000); // let lobby preflight + ~1s poller run a few ticks

const hasLobbyPreview = await page.locator('app-lobby-preview').count();
const bodyText = (await page.locator('body').innerText().catch(() => '')) || '';
const hasNoSoundFlag = /No sound detected/.test(bodyText); // expected FALSE under fake-media (tone => working)

await page.screenshot({ path: OUT, fullPage: true });

console.log('LOBBY-SMOKE-RESULT:');
console.log('  url:', TARGET);
console.log('  app-lobby-preview count:', hasLobbyPreview);
console.log('  "No sound detected" visible:', hasNoSoundFlag, '(expected false under fake-media tone — NS5)');
console.log('  console.error count:', consoleErrors.length);
console.log('  pageerror count:', pageErrors.length);
if (consoleErrors.length) console.log('  console errors:', JSON.stringify(consoleErrors, null, 2));
if (pageErrors.length) console.log('  page errors:', JSON.stringify(pageErrors, null, 2));
console.log('  screenshot:', OUT);

await browser.close();
