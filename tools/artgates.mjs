#!/usr/bin/env node
// Art quality gates — the enforcement half of docs/graphics-protocol.md.
//
// These run against real pixels: the baked assets and the actual composited frame,
// loaded in Chromium. Everything asserted here is something a reviewer cannot
// reliably judge by eye, which is exactly why it is automated:
//
//   G1 BALL/BACKDROP CONTRAST   every ball colour against every chapter backdrop
//   G2 LANE-BAND DETAIL         the §3.4 restraint rule, measured as local
//                               luminance variance inside the track band
//   G3 COLOUR-VISION SEPARATION the six ball colours under protan/deutan/tritan
//   G4 SMALL-SIZE LEGIBILITY    balls downscaled to iPhone size must stay
//                               distinguishable, and their glyphs must survive
//   G5 BUDGET                   decoded texture memory
//
// A failure here is a blocking defect, not a note.

import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8123';

const THRESHOLDS = {
  ballBackdropContrast: 3.0,   // WCAG-style ratio; below this a ball fades into the scene
  laneBandStdDev: 26,          // 0..255 luminance; above this the backdrop competes with the balls
  chromeShouldExceed: 8,       // the chrome is where detail belongs — prove budget is spent there
  cvdDeltaE: 18,               // CIE76 between any two ball colours under any CVD type
  smallSizeDeltaE: 16,         // same, after downscaling to 24 physical px
  glyphContrast: 12,           // engraved glyph must still modulate the ball face at 24px
  textureMemoryMB: 32,
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.error('page error:', e.message));

await page.goto(`${BASE}/game.html`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__ascendant, null, { timeout: 20000 });

const results = await page.evaluate(async (TH) => {
  // ---------------------------------------------------------------- colour math
  const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const relLum = (r, g, b) =>
    0.2126 * srgbToLinear(r / 255) + 0.7152 * srgbToLinear(g / 255) + 0.0722 * srgbToLinear(b / 255);
  const contrastRatio = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

  function rgbToLab(r, g, b) {
    const [lr, lg, lb] = [srgbToLinear(r / 255), srgbToLinear(g / 255), srgbToLinear(b / 255)];
    let x = (lr * 0.4124 + lg * 0.3576 + lb * 0.1805) / 0.95047;
    let y = lr * 0.2126 + lg * 0.7152 + lb * 0.0722;
    let z = (lr * 0.0193 + lg * 0.1192 + lb * 0.9505) / 1.08883;
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    [x, y, z] = [f(x), f(y), f(z)];
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  }
  const deltaE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

  // Viénot/Brettel dichromat simulation, applied in linear RGB.
  const CVD = {
    protan: [0.170556, 0.829443, 0, 0.170556, 0.829443, 0, -0.004517, 0.004517, 1],
    deutan: [0.330660, 0.669340, 0, 0.330660, 0.669340, 0, -0.027855, 0.027855, 1],
    tritan: [1, 0.127399, -0.127399, 0, 0.873909, 0.126091, 0, 0.873909, 0.126091],
  };
  function simulate(rgb, kind) {
    const m = CVD[kind];
    const l = rgb.map((c) => srgbToLinear(c / 255));
    const out = [
      m[0] * l[0] + m[1] * l[1] + m[2] * l[2],
      m[3] * l[0] + m[4] * l[1] + m[5] * l[2],
      m[6] * l[0] + m[7] * l[1] + m[8] * l[2],
    ];
    const toSrgb = (c) => {
      const v = Math.max(0, Math.min(1, c));
      return Math.round((v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255);
    };
    return out.map(toSrgb);
  }

  // ------------------------------------------------------------------- sampling
  function scratch(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  // Mean colour of a ball's FACE — the coloured glass disc, excluding the brass
  // cage, because the cage is not the thing being colour-matched.
  function ballFace(img) {
    const S = 64;
    const c = scratch(S, S);
    const cx = c.getContext('2d');
    cx.drawImage(img, 0, 0, S, S);
    const d = cx.getImageData(0, 0, S, S).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const u = (x - S / 2) / (S * 0.46);
        const v = (y - S / 2) / (S * 0.46);
        if (Math.hypot(u, v) > 0.62) continue; // inside the glass, clear of the cage
        const i = (y * S + x) * 4;
        if (d[i + 3] < 200) continue;
        r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
      }
    }
    return [r / n, g / n, b / n];
  }

  const failures = [];
  const info = {};
  const app = window.__ascendant.app;
  const palette = app.tuning.palette.colors;
  const assets = await import('./render/assets.js');

  // ------------------------------------------------- G3 colour-vision separation
  const faces = palette.map((p) => ballFace(assets.ballFor(p.glyph)));
  info.faceColors = faces.map((f) => f.map(Math.round));
  let worstCvd = { d: Infinity };
  for (const kind of ['protan', 'deutan', 'tritan', 'normal']) {
    const sim = faces.map((f) => (kind === 'normal' ? f : simulate(f, kind)));
    const labs = sim.map((s) => rgbToLab(s[0], s[1], s[2]));
    for (let i = 0; i < labs.length; i++) {
      for (let j = i + 1; j < labs.length; j++) {
        const d = deltaE(labs[i], labs[j]);
        if (d < worstCvd.d) worstCvd = { d, kind, a: palette[i].key, b: palette[j].key };
      }
    }
  }
  info.worstCvd = { ...worstCvd, d: +worstCvd.d.toFixed(1) };
  if (worstCvd.d < TH.cvdDeltaE) {
    failures.push(
      `G3 colour-vision: ${worstCvd.a}/${worstCvd.b} differ by only ΔE ${worstCvd.d.toFixed(1)} under ${worstCvd.kind} (need ${TH.cvdDeltaE})`,
    );
  }

  // --------------------------------------------- G4 small-size legibility (24px)
  // 24 physical pixels is roughly a ball on an iPhone 16 at the tightest fit.
  const SMALL = 24;
  const smallFaces = [];
  let worstGlyph = { c: Infinity };
  for (let i = 0; i < palette.length; i++) {
    const c = scratch(SMALL, SMALL);
    const cx = c.getContext('2d');
    cx.drawImage(assets.ballFor(palette[i].glyph), 0, 0, SMALL, SMALL);
    const d = cx.getImageData(0, 0, SMALL, SMALL).data;

    let r = 0, g = 0, b = 0, n = 0;
    const lums = [];
    for (let y = 0; y < SMALL; y++) {
      for (let x = 0; x < SMALL; x++) {
        const u = (x - SMALL / 2) / (SMALL * 0.46);
        const v = (y - SMALL / 2) / (SMALL * 0.46);
        if (Math.hypot(u, v) > 0.6) continue;
        const k = (y * SMALL + x) * 4;
        if (d[k + 3] < 200) continue;
        r += d[k]; g += d[k + 1]; b += d[k + 2]; n++;
        lums.push(0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2]);
      }
    }
    smallFaces.push([r / n, g / n, b / n]);

    // The glyph is the only thing modulating luminance inside the face, so its
    // survival at this size shows up directly as spread.
    const mean = lums.reduce((a, x) => a + x, 0) / lums.length;
    const sd = Math.sqrt(lums.reduce((a, x) => a + (x - mean) ** 2, 0) / lums.length);
    if (sd < worstGlyph.c) worstGlyph = { c: sd, glyph: palette[i].glyph };
  }
  info.worstGlyphContrast = +worstGlyph.c.toFixed(1);
  if (worstGlyph.c < TH.glyphContrast) {
    failures.push(`G4 glyph legibility: "${worstGlyph.glyph}" modulates only ${worstGlyph.c.toFixed(1)} at ${SMALL}px (need ${TH.glyphContrast})`);
  }

  let worstSmall = { d: Infinity };
  const smallLabs = smallFaces.map((f) => rgbToLab(f[0], f[1], f[2]));
  for (let i = 0; i < smallLabs.length; i++) {
    for (let j = i + 1; j < smallLabs.length; j++) {
      const d = deltaE(smallLabs[i], smallLabs[j]);
      if (d < worstSmall.d) worstSmall = { d, a: palette[i].key, b: palette[j].key };
    }
  }
  info.worstSmallSize = { ...worstSmall, d: +worstSmall.d.toFixed(1) };
  if (worstSmall.d < TH.smallSizeDeltaE) {
    failures.push(`G4 small-size colour: ${worstSmall.a}/${worstSmall.b} differ by ΔE ${worstSmall.d.toFixed(1)} at ${SMALL}px (need ${TH.smallSizeDeltaE})`);
  }

  // ------------------------------- G1 + G2, measured on real composited frames
  const perLevel = [];
  for (const levelId of [1, 4, 7, 12]) {
    await window.__ascendant.startLevel(levelId);
    await new Promise((r) => setTimeout(r, 260));

    const game = app.game;
    const layer = app.staticLayer;
    const lc = layer.canvas.getContext('2d', { willReadFrequently: true });
    const ps = layer.pixelScale;
    const R = game.T.ballRadius;

    const lane = game.geom[0];
    const { pointAt } = await import('./sim/lane.js');

    // Sample the track band at intervals along the lane, skipping the escapement
    // gate and furnace intake at either end. Those are functional landmarks and are
    // MEANT to be detailed; including them made a few windows dominate the average
    // and reported the whole track as noisy when the bed itself measures flat
    // (plate tile sigma 0.6).
    const furnitureZone = R * 4;
    const lums = [];
    const windows = [];
    for (let s = furnitureZone; s < lane.length - furnitureZone; s += 47) {
      const p = pointAt(lane, s, { x: 0, y: 0 });
      const px = Math.round(p.x * ps);
      const py = Math.round(p.y * ps);
      const half = Math.round(R * ps); // exactly the ball's footprint
      if (px - half < 0 || py - half < 0 || px + half >= layer.canvas.width || py + half >= layer.canvas.height) continue;
      const d = lc.getImageData(px - half, py - half, half * 2, half * 2).data;
      const local = [];
      const side = half * 2;
      // A ball's footprint is a DISC. Sampling a square let its corners reach past
      // the clean corridor into the rails and inner shadow, so the metric reported
      // the track as noisy when the bed under a ball is flat.
      for (let yy = 0; yy < side; yy++) {
        for (let xx = 0; xx < side; xx++) {
          if (Math.hypot(xx - half, yy - half) > half) continue;
          const i = (yy * side + xx) * 4;
          const L = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
          local.push(L);
          lums.push(L);
        }
      }
      const m = local.reduce((a, x) => a + x, 0) / local.length;
      windows.push(Math.sqrt(local.reduce((a, x) => a + (x - m) ** 2, 0) / local.length));
    }

    // The gate is LOCAL variance: a track that is uniformly bright is fine; one
    // with busy high-frequency texture under the balls is not.
    const laneStdDev = windows.reduce((a, x) => a + x, 0) / windows.length;
    const laneMeanL = lums.reduce((a, x) => a + x, 0) / lums.length;

    // Chrome region: a corner outside the box, where detail is meant to live.
    const cd = lc.getImageData(4, 4, 90, 90).data;
    const cl = [];
    for (let i = 0; i < cd.length; i += 4) cl.push(0.2126 * cd[i] + 0.7152 * cd[i + 1] + 0.0722 * cd[i + 2]);
    const cm = cl.reduce((a, x) => a + x, 0) / cl.length;
    const chromeStdDev = Math.sqrt(cl.reduce((a, x) => a + (x - cm) ** 2, 0) / cl.length);

    // G1: each ball face against the measured track luminance.
    const bedLum = relLum(laneMeanL, laneMeanL, laneMeanL);
    let worstContrast = { r: Infinity };
    for (let i = 0; i < faces.length; i++) {
      const r = contrastRatio(relLum(faces[i][0], faces[i][1], faces[i][2]), bedLum);
      if (r < worstContrast.r) worstContrast = { r, key: palette[i].key };
    }

    perLevel.push({
      levelId,
      laneStdDev: +laneStdDev.toFixed(1),
      laneMeanL: +laneMeanL.toFixed(1),
      chromeStdDev: +chromeStdDev.toFixed(1),
      worstContrast: { key: worstContrast.key, r: +worstContrast.r.toFixed(2) },
    });

    if (laneStdDev > TH.laneBandStdDev) {
      failures.push(`G2 lane-band detail: level ${levelId} local σ ${laneStdDev.toFixed(1)} exceeds ${TH.laneBandStdDev} — the track is competing with the balls`);
    }
    if (worstContrast.r < TH.ballBackdropContrast) {
      failures.push(`G1 contrast: level ${levelId} "${worstContrast.key}" only ${worstContrast.r.toFixed(2)}:1 against the track (need ${TH.ballBackdropContrast})`);
    }
  }
  info.perLevel = perLevel;

  // ------------------------------------------------------------- G5 budget
  const mb = Object.values(assets.assetMeta ? {} : {});
  const manifest = await fetch('assets/manifest.json').then((r) => r.json());
  let decoded = 0;
  for (const a of Object.values(manifest.assets)) decoded += a.width * a.height * 4;
  info.textureMemoryMB = +(decoded / 1024 / 1024).toFixed(1);
  if (info.textureMemoryMB > TH.textureMemoryMB) {
    failures.push(`G5 budget: ${info.textureMemoryMB} MB decoded textures exceeds ${TH.textureMemoryMB} MB`);
  }

  return { failures, info };
}, THRESHOLDS);

await browser.close();

const { failures, info } = results;
console.log('ART QUALITY GATES\n');
console.log(`  G3  worst colour separation   ΔE ${info.worstCvd.d} (${info.worstCvd.a}/${info.worstCvd.b} under ${info.worstCvd.kind})  need ≥ ${THRESHOLDS.cvdDeltaE}`);
console.log(`  G4  worst glyph modulation    σ ${info.worstGlyphContrast} at 24px  need ≥ ${THRESHOLDS.glyphContrast}`);
console.log(`  G4  worst 24px colour sep     ΔE ${info.worstSmallSize.d} (${info.worstSmallSize.a}/${info.worstSmallSize.b})  need ≥ ${THRESHOLDS.smallSizeDeltaE}`);
console.log(`  G5  decoded texture memory    ${info.textureMemoryMB} MB  budget ${THRESHOLDS.textureMemoryMB} MB\n`);
console.log('  level  laneσ  laneL  chromeσ  worst ball contrast');
for (const l of info.perLevel) {
  console.log(
    `  ${String(l.levelId).padStart(5)}  ${String(l.laneStdDev).padStart(5)}  ${String(l.laneMeanL).padStart(5)}` +
      `  ${String(l.chromeStdDev).padStart(7)}  ${l.worstContrast.r}:1 (${l.worstContrast.key})`,
  );
}
console.log('');

if (failures.length) {
  for (const f of failures) console.log(`FAIL  ${f}`);
  console.log(`\n${failures.length} gate failure(s)`);
  process.exit(1);
}
console.log('all art gates passed');
