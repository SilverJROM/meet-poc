#!/usr/bin/env node
import fs from 'node:fs';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';

const [url, jsonOut, htmlOut] = process.argv.slice(2);

if (!url || !jsonOut || !htmlOut) {
  console.error('Usage: node scripts/lighthouse-mobile-fallback.mjs <url> <jsonOut> <htmlOut>');
  process.exit(1);
}

const chrome = await chromeLauncher.launch({
  chromeFlags: ['--headless=new', '--no-sandbox'],
});

try {
  const result = await lighthouse(url, {
    port: chrome.port,
    output: ['json', 'html'],
    formFactor: 'mobile',
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
    screenEmulation: {
      mobile: true,
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      disabled: false,
    },
  });

  if (!result) throw new Error('Lighthouse returned no result');
  const reports = Array.isArray(result.report) ? result.report : [JSON.stringify(result.lhr), result.report];
  fs.writeFileSync(jsonOut, reports[0]);
  fs.writeFileSync(htmlOut, reports[1]);
} finally {
  await chrome.kill();
}
