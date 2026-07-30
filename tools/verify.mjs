// Browser verification pass. Loads the real game in Chromium at each target
// device's viewport, plays it with synthetic input, and fails on any console error
// or unhandled rejection.
//
// This is the closest thing available here to the "build to all three devices"
// milestone gate in §4 — it is not a substitute for running on the hardware, and
// it cannot speak to thermals, battery, or how the thing feels in the hand.

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8123';
const OUT = process.env.SHOT_DIR || 'artifacts';

// Logical CSS pixels (device pixels / DPR), which is what a browser viewport is.
const DEVICES = [
  { name: 'ipad-pro-m4-13', width: 1366, height: 1024, dpr: 2, note: '4:3' },
  { name: 'iphone-16-landscape', width: 852, height: 393, dpr: 3, note: '19.5:9' },
  { name: 'steam-deck-oled', width: 1280, height: 800, dpr: 1, note: '16:10' },
];

mkdirSync(OUT, { recursive: true });

// Use the environment's pre-installed Chromium rather than downloading one.
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=swiftshader'],
});
let failed = false;

for (const dev of DEVICES) {
  const context = await browser.newContext({
    viewport: { width: dev.width, height: dev.height },
    deviceScaleFactor: dev.dpr,
    hasTouch: true,
  });
  const page = await context.newPage();

  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(`${BASE}/game.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__ascendant, null, { timeout: 15000 });

  // Title screen.
  await page.screenshot({ path: `${OUT}/${dev.name}-01-title.png` });

  // Start a level and play it with a sweeping aim plus steady fire, so the render
  // path, input path, audio path and sim all get exercised together.
  await page.evaluate(() => window.__ascendant.startLevel(4));
  await page.waitForTimeout(400);

  const box = await page.locator('#stage').boundingBox();
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const x = box.x + box.width / 2 + Math.cos(a) * box.width * 0.33;
    const y = box.y + box.height / 2 + Math.sin(a) * box.height * 0.33;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(70);
  }

  const stats = await page.evaluate(() => {
    const g = window.__ascendant.app.game;
    return {
      status: g.state.status,
      tick: g.state.tick,
      score: g.state.score,
      destroyed: g.state.destroyed,
      shots: g.state.shots.length,
      balls: g.state.chains.reduce((n, c) => n + c.balls.length, 0),
      fps: window.__ascendant.app.fps,
      hud: (() => {
        const f = window.__ascendant.app.fit;
        return { aspect: +f.aspect.toFixed(2), slackX: Math.round(f.slackX), slackY: Math.round(f.slackY), scale: +f.scale.toFixed(3) };
      })(),
    };
  });

  await page.screenshot({ path: `${OUT}/${dev.name}-02-play.png` });

  // §3.5 assertion in the real renderer: the fitted playfield must never exceed
  // the viewport on either axis, and must be a contain-fit of the 16:10 box.
  const fitOk = await page.evaluate(() => {
    const f = window.__ascendant.app.fit;
    const box = window.__ascendant.app.game.level.box;
    const eps = 1.5;
    return (
      f.w <= f.viewW + eps &&
      f.h <= f.viewH + eps &&
      Math.abs(f.w / f.h - box[0] / box[1]) < 0.01 &&
      f.x >= -eps &&
      f.y >= -eps
    );
  });

  const advanced = stats.tick > 200;
  const ok = errors.length === 0 && advanced && fitOk;
  if (!ok) failed = true;

  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${dev.name.padEnd(22)} ${dev.note.padEnd(8)} ` +
      `${dev.width}x${dev.height}@${dev.dpr}x  tick=${stats.tick} score=${stats.score} ` +
      `destroyed=${stats.destroyed} balls=${stats.balls} fps=${stats.fps} ` +
      `fit=${JSON.stringify(stats.hud)} aspectFit=${fitOk}`,
  );
  for (const e of errors) console.log(`      ${e}`);

  await context.close();
}

await browser.close();
console.log(failed ? '\nverification FAILED' : '\nverification passed');
process.exit(failed ? 1 : 0);
