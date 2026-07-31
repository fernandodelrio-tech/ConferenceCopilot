#!/usr/bin/env node
// Calibration step: measure the ACTUAL rendered face colour of each baked ball and
// record the residual against the analytic model in art/bakers.js.
//
// Why this exists. tools/palette.mjs optimises against a predicted rendered colour,
// but the prediction cannot include everything the real bake does — chiefly the
// engraved glyph, which covers a different fraction of the face for each glyph
// shape. That residual is what made the optimiser promise deltaE 25 and the art
// gate measure deltaE 12.
//
// The residual is a PER-SLOT constant, not a per-colour function: palette slot i
// always carries glyph i, so measuring it once closes the loop exactly.
//
//   bake -> measurefaces -> palette --write -> bake -> artgates

import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { ballFaceMean } from '../art/bakers.js';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8123';
const tuning = JSON.parse(readFileSync('content/tuning.json', 'utf8'));

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
await page.goto(`${BASE}/art/measure.html`);
await page.waitForFunction(() => window.__diag, null, { timeout: 20000 });
const diag = await page.evaluate(() => window.__diag);
await browser.close();

const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

const slots = tuning.palette.colors.map((c, i) => {
  const measured = hexToRgb(diag.rows[i].rendered);
  const predicted = ballFaceMean(c.hex);
  return {
    slot: i,
    glyph: c.glyph,
    source: c.hex,
    measured,
    predicted: predicted.map((v) => Math.round(v)),
    residual: measured.map((m, k) => +(m - predicted[k]).toFixed(2)),
  };
});

writeFileSync(
  'content/face-calibration.json',
  JSON.stringify({ generated: 'tools/measurefaces.mjs', slots }, null, 2) + '\n',
);

console.log('slot  glyph        source    predicted -> measured   residual');
for (const s of slots) {
  console.log(
    `  ${s.slot}   ${s.glyph.padEnd(11)} ${s.source}  ` +
      `[${s.predicted.join(',')}] -> [${s.measured.join(',')}]   [${s.residual.join(',')}]`,
  );
}
