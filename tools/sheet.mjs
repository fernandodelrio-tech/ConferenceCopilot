#!/usr/bin/env node
// Contact sheet for visual sign-off (protocol §5.4): every asset at authoring size,
// plus every ball at 48/32/24/16 px so small-size legibility is reviewable by eye
// alongside the numbers gate G4 produces.

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8123';
mkdirSync('artifacts', { recursive: true });

const manifest = JSON.parse(readFileSync('assets/manifest.json', 'utf8'));
const tuning = JSON.parse(readFileSync('content/tuning.json', 'utf8'));

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1240, height: 760 } });
await page.goto(`${BASE}/game.html`, { waitUntil: 'domcontentloaded' });

const png = await page.evaluate(async ({ names, glyphs, base }) => {
  const load = (n) =>
    new Promise((res) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => res(null);
      i.src = `${base}/assets/generated/${n}.png`;
    });

  const c = document.createElement('canvas');
  c.width = 1240;
  c.height = 760;
  const x = c.getContext('2d');
  x.fillStyle = '#14171a';
  x.fillRect(0, 0, c.width, c.height);
  x.font = '11px ui-monospace, monospace';

  const pad = 12;
  const cell = 150;
  let col = 0, row = 0;
  for (const n of names) {
    const img = await load(n);
    if (!img) continue;
    const px = pad + col * cell, py = pad + row * cell;
    const s = Math.min(cell - 30, (cell - 30) * (img.width / Math.max(img.width, img.height)));
    x.drawImage(img, px, py, s, s * (img.height / img.width));
    x.fillStyle = '#8a8f95';
    x.fillText(n.slice(0, 20), px, py + cell - 8);
    col++;
    if (col === 8) { col = 0; row++; }
  }

  // Small-size legibility strip.
  const yBase = pad + (row + 1) * 150 + 10;
  x.fillStyle = '#8a8f95';
  x.fillText('small-size legibility  48 / 32 / 24 / 16 px', pad, yBase - 8);
  for (let i = 0; i < glyphs.length; i++) {
    const img = await load(`ball-${glyphs[i]}`);
    if (!img) continue;
    let ox = pad + i * 150;
    for (const size of [48, 32, 24, 16]) {
      x.drawImage(img, ox, yBase + (48 - size) / 2, size, size);
      ox += size + 8;
    }
  }
  return c.toDataURL('image/png');
}, {
  names: Object.keys(manifest.assets).filter((n) => !n.startsWith('backdrop-')),
  glyphs: tuning.palette.colors.map((c) => c.glyph),
  base: BASE,
});

await browser.close();
writeFileSync('artifacts/contact-sheet.png', Buffer.from(png.split(',')[1], 'base64'));
console.log('artifacts/contact-sheet.png');
