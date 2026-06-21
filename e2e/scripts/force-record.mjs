#!/usr/bin/env node
/**
 * force-record.mjs — drive host record start for ~3min capstone, then stop.
 * Run while Alice/Bob (+peer2s) are in call publishing.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const AGENT = JSON.parse(fs.readFileSync('AGENTROOM.json', 'utf8'));
const ROOM_ID = AGENT.id;
const URL = `http://localhost:4700/room/${ROOM_ID}`;
const EMAIL = 'jrom@silverjrom.app';
const PW = 'Admin@1234';

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--use-fake-ui-for-media-stream'] });
  const ctx = await browser.newContext({ permissions: ['microphone','camera'] });
  const page = await ctx.newPage();
  await page.goto('http://localhost:4700/login');
  await page.locator('input[type="email"], #login-email').fill(EMAIL).catch(()=>{});
  await page.locator('input[type="password"], #login-password').fill(PW).catch(()=>{});
  await page.getByRole('button', { name: /Sign in|Log in/i }).click().catch(() => {});
  await page.waitForTimeout(1500);
  await page.goto(URL);
  await page.waitForTimeout(2000);

  // Click record to start
  let started = false;
  for (let i=0; i<5; i++) {
    const rec = page.getByRole('button', { name: /record|Record/i });
    if (await rec.count() > 0) {
      await rec.first().click().catch(()=>{});
      started = true;
      console.log('[FORCE-REC] RECORD START clicked');
      break;
    }
    await page.waitForTimeout(800);
  }
  if (!started) {
    const toggled = await page.evaluate(() => { const d=window.__meetDebug||{}; if(typeof d.toggleRecording==='function'){d.toggleRecording(); return true;} return false; }).catch(()=>false);
    if (toggled) { started=true; console.log('[FORCE-REC] RECORD START via toggle'); }
  }

  // Let run ~60s overlap for loud speech during record (FINALE)
  console.log('[FORCE-REC] letting 60s overlap for loud named speech...');
  await page.waitForTimeout(60_000);

  // Stop
  const recStop = page.getByRole('button', { name: /stop|record|Stop/i });
  if (await recStop.count() > 0) {
    await recStop.first().click().catch(()=>{});
    console.log('[FORCE-REC] RECORD STOP clicked');
  } else {
    await page.evaluate(() => { const d=window.__meetDebug||{}; if(typeof d.toggleRecording==='function') d.toggleRecording(); }).catch(()=>{});
    console.log('[FORCE-REC] RECORD STOP via toggle');
  }

  // Capture last upload info
  await page.waitForTimeout(4000);
  const info = await page.evaluate(() => {
    const d = window.__meetDebug || {};
    return { lastUpload: d.lastRecordingUpload, sources: d.recorderSourceCount, lastMeta: d.lastMetadataUpload };
  }).catch(()=>({}));
  console.log('[FORCE-REC] UPLOAD_INFO', JSON.stringify(info));

  await browser.close();
  console.log('[FORCE-REC] DONE');
}
main().catch(e=>{console.error(e); process.exit(1);});
