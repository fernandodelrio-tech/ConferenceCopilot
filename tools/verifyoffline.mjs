#!/usr/bin/env node
// Verifies dist/ascendant.html actually runs from a file:// URL — no server, no
// network. This is the only check that matters for the offline build, because
// everything that breaks on file:// (ES modules, fetch, canvas tainting) breaks
// silently when tested over HTTP.

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

mkdirSync('artifacts', { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=swiftshader'],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true });
const page = await context.newPage();

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
// Any network request at all means something was not inlined.
const requests = [];
page.on('request', (r) => { if (!r.url().startsWith('file://') && !r.url().startsWith('data:')) requests.push(r.url()); });

await page.goto(`file://${resolve('dist/ascendant.html')}`);
await page.waitForFunction(() => !!window.__ascendant, null, { timeout: 20000 });

await page.evaluate(() => window.__ascendant.startLevel(4));
await page.waitForTimeout(400);

const box = await page.locator('#stage').boundingBox();
for (let i = 0; i < 18; i++) {
  const a = (i / 18) * Math.PI * 2;
  await page.mouse.move(box.x + box.width / 2 + Math.cos(a) * box.width * 0.32,
                        box.y + box.height / 2 + Math.sin(a) * box.height * 0.32);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(80);
}

const stats = await page.evaluate(() => {
  const g = window.__ascendant.app.game;
  return {
    tick: g.state.tick,
    score: g.state.score,
    balls: g.state.chains.reduce((n, c) => n + c.balls.length, 0),
    assets: window.__ascendant.app.assetInfo.count,
    // If bloom worked, the emissive buffer is non-empty and untainted.
    bloomOk: (() => {
      try {
        const p = window.__ascendant.app.post;
        p.emissive.getContext('2d').getImageData(0, 0, 1, 1);
        return true;
      } catch (e) {
        return `tainted: ${e.message}`;
      }
    })(),
  };
});

await page.screenshot({ path: 'artifacts/offline-file-url.png' });
await browser.close();

const ok = errors.length === 0 && requests.length === 0 && stats.tick > 200 && stats.bloomOk === true;
console.log(`${ok ? 'PASS' : 'FAIL'}  file:// offline build`);
console.log(`  assets loaded  ${stats.assets}`);
console.log(`  sim ticks      ${stats.tick}`);
console.log(`  score          ${stats.score}`);
console.log(`  balls on track ${stats.balls}`);
console.log(`  canvas untainted ${stats.bloomOk}`);
console.log(`  external requests ${requests.length}${requests.length ? ': ' + requests.join(', ') : ''}`);
for (const e of errors) console.log(`  ${e}`);
process.exit(ok ? 0 : 1);
