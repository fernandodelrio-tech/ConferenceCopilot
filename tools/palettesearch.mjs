#!/usr/bin/env node
// Exact palette search: every evaluation is a real bake and a real measurement.
//
// This replaces optimising against an analytic model of the bake. That approach
// failed twice and failed loudly: the model promised deltaE 34 and the gate measured
// 5; adding a per-slot residual correction assumed the residual was colour-
// independent, which it is not, and the loop diverged to a palette with orange and
// red 1.3 deltaE apart under deuteranopia.
//
// Each step here costs about three seconds — a ball-only bake plus a face
// measurement — which is cheap enough to hill-climb directly on ground truth. Slower
// per evaluation, but it optimises the number the gate actually reports.
//
//   node tools/palettesearch.mjs [maxEvals] [--write]

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8123';
const MAX_EVALS = Number(process.argv[2] || 60);
const TARGET = 20;          // comfortably clear of gate G3's threshold of 18
const MIN_CONTRAST = 3.2;

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const relLum = ([r, g, b]) => 0.2126 * srgbToLinear(r / 255) + 0.7152 * srgbToLinear(g / 255) + 0.0722 * srgbToLinear(b / 255);
const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const BED = srgbToLinear(31 / 255);

function rgbToLab([r, g, b]) {
  const [lr, lg, lb] = [srgbToLinear(r / 255), srgbToLinear(g / 255), srgbToLinear(b / 255)];
  let x = (lr * 0.4124 + lg * 0.3576 + lb * 0.1805) / 0.95047;
  let y = lr * 0.2126 + lg * 0.7152 + lb * 0.0722;
  let z = (lr * 0.0193 + lg * 0.1192 + lb * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  [x, y, z] = [f(x), f(y), f(z)];
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const CVD = {
  protan: [0.170556, 0.829443, 0, 0.170556, 0.829443, 0, -0.004517, 0.004517, 1],
  deutan: [0.33066, 0.66934, 0, 0.33066, 0.66934, 0, -0.027855, 0.027855, 1],
  tritan: [1, 0.127399, -0.127399, 0, 0.873909, 0.126091, 0, 0.873909, 0.126091],
};
function simulate(rgb, kind) {
  if (kind === 'normal') return rgb;
  const m = CVD[kind];
  const l = rgb.map((c) => srgbToLinear(c / 255));
  return [
    m[0] * l[0] + m[1] * l[1] + m[2] * l[2],
    m[3] * l[0] + m[4] * l[1] + m[5] * l[2],
    m[6] * l[0] + m[7] * l[1] + m[8] * l[2],
  ].map((c) => {
    const v = Math.max(0, Math.min(1, c));
    return (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255;
  });
}
const deltaE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const page = await browser.newPage();

async function measure(hexes) {
  const tuning = JSON.parse(readFileSync('content/tuning.json', 'utf8'));
  tuning.palette.colors.forEach((c, i) => { c.hex = hexes[i]; });
  writeFileSync('content/tuning.json', JSON.stringify(tuning, null, 2) + '\n');
  execFileSync('node', ['tools/bake.mjs', '--balls-only'], { stdio: ['ignore', 'ignore', 'inherit'] });
  await page.goto(`${BASE}/art/measure.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__diag, null, { timeout: 20000 });
  const diag = await page.evaluate(() => window.__diag);
  return diag.rows.map((r) => [1, 3, 5].map((i) => parseInt(r.rendered.slice(i, i + 2), 16)));
}

// Objective: worst-case pairwise separation across all four vision models, with a
// penalty for any ball that loses contrast against the track.
function objective(faces) {
  let penalty = 0;
  for (const f of faces) {
    const cr = contrast(relLum(f), BED);
    if (cr < MIN_CONTRAST) penalty += (MIN_CONTRAST - cr) * 25;
  }
  let worst = Infinity;
  for (const v of ['normal', 'protan', 'deutan', 'tritan']) {
    const labs = faces.map((f) => rgbToLab(simulate(f, v)));
    for (let i = 0; i < labs.length; i++) {
      for (let j = i + 1; j < labs.length; j++) worst = Math.min(worst, deltaE(labs[i], labs[j]));
    }
  }
  return { score: worst - penalty, worst };
}

function worstPair(faces) {
  let w = { d: Infinity };
  for (const v of ['normal', 'protan', 'deutan', 'tritan']) {
    const labs = faces.map((f) => rgbToLab(simulate(f, v)));
    for (let i = 0; i < labs.length; i++) {
      for (let j = i + 1; j < labs.length; j++) {
        const d = deltaE(labs[i], labs[j]);
        if (d < w.d) w = { d, i, j, v };
      }
    }
  }
  return w;
}

const start = JSON.parse(readFileSync('content/tuning.json', 'utf8')).palette.colors.map((c) => c.hex);
let cur = [...start];
let curFaces = await measure(cur);
let curScore = objective(curFaces);
console.log(`start: worst deltaE ${curScore.worst.toFixed(1)}`);

let rng = 424242;
const rand = () => ((rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0) / 4294967296);
const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
const toHex = (rgb) => '#' + rgb.map((c) => clamp(c).toString(16).padStart(2, '0')).join('');
const fromHex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

for (let evals = 0; evals < MAX_EVALS && curScore.worst < TARGET; evals++) {
  // Perturb whichever ball is currently in the worst-separated pair — that is the
  // only change that can raise the minimum.
  const w = worstPair(curFaces);
  const slot = rand() < 0.5 ? w.i : w.j;
  const amp = 60 * (1 - evals / MAX_EVALS) + 14;
  const cand = [...cur];
  cand[slot] = toHex(fromHex(cur[slot]).map((c) => c + (rand() - 0.5) * amp));

  const faces = await measure(cand);
  const s = objective(faces);
  if (s.score > curScore.score) {
    cur = cand;
    curFaces = faces;
    curScore = s;
    console.log(`  eval ${evals}: worst deltaE ${s.worst.toFixed(1)}  (moved slot ${slot} -> ${cand[slot]})`);
  }
}

await browser.close();
const final = worstPair(curFaces);
console.log(`\nfinal worst-case deltaE ${curScore.worst.toFixed(1)} (${final.v}, slots ${final.i}/${final.j})`);
console.log('palette:', cur.join(' '));

const tuning = JSON.parse(readFileSync('content/tuning.json', 'utf8'));
tuning.palette.colors.forEach((c, i) => { c.hex = cur[i]; });
tuning.palette._worstDeltaE = +curScore.worst.toFixed(1);
tuning.palette._optimisedBy = 'tools/palettesearch.mjs — hill-climb on measured rendered faces';
writeFileSync('content/tuning.json', JSON.stringify(tuning, null, 2) + '\n');
console.log('written to content/tuning.json');
