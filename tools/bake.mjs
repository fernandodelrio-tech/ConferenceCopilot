#!/usr/bin/env node
// Asset bake step. Runs the procedural bakers in Chromium (so they use exactly the
// same Canvas2D implementation the game does) and writes PNGs + a manifest.
//
// Baking in a browser rather than a native canvas binding keeps the project free of
// native dependencies, and guarantees the authored pixels are the pixels that ship.

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, statSync, readFileSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8123';
const OUT = 'assets/generated';
// Fast path for tools/palettesearch.mjs, which re-bakes only the balls per step.
const ballsOnly = process.argv.includes('--balls-only');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
page.on('pageerror', (e) => { console.error('bake page error:', e.message); process.exitCode = 1; });

await page.goto(`${BASE}/art/bake.html`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__bakeReady === true, null, { timeout: 20000 });

if (!ballsOnly) console.log('baking…');
const started = Date.now();
const assets = (await page.evaluate(() => window.__bake())).filter(
  (a) => !ballsOnly || a.name.startsWith('ball-'),
);
await browser.close();

const manifest = { generated: 'tools/bake.mjs', assets: {} };
let total = 0;
for (const a of assets) {
  const file = `${OUT}/${a.name}.png`;
  writeFileSync(file, Buffer.from(a.dataUrl.split(',')[1], 'base64'));
  const bytes = statSync(file).size;
  total += bytes;
  manifest.assets[a.name] = { file: `${OUT}/${a.name}.png`, width: a.width, height: a.height, bytes };
  if (!ballsOnly) console.log(`  ${a.name.padEnd(28)} ${a.width}x${a.height}  ${(bytes / 1024).toFixed(0)} KB`);
}
if (ballsOnly) {
  // Merge into the existing manifest rather than truncating it.
  const prev = JSON.parse(readFileSync('assets/manifest.json', 'utf8'));
  manifest.assets = { ...prev.assets, ...manifest.assets };
}
writeFileSync('assets/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
if (!ballsOnly) console.log(`\n${assets.length} assets, ${(total / 1024 / 1024).toFixed(2)} MB on disk, ${((Date.now() - started) / 1000).toFixed(1)}s`);
