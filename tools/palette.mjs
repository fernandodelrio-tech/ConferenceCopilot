#!/usr/bin/env node
// Ball-palette optimiser.
//
// Six colours have to stay mutually distinguishable for players with normal colour
// vision AND for protanopes, deuteranopes and tritanopes, while keeping enough
// contrast against the dark track bed to read at speed. Hand-picking cannot do
// this: art gate G3 caught cobalt/violet collapsing to deltaE 9.6 under protanopia,
// and the obvious hand-fix (lighten violet) immediately collapsed violet against
// brass under tritanopia instead. Hue is exactly the channel dichromats lose, so
// the palette has to be spread in LIGHTNESS as well, and balancing six colours
// across four vision models at once is a search problem.
//
// Maximises the minimum pairwise CIE76 deltaE across all four vision models,
// subject to a contrast floor against the track.
//
//   node tools/palette.mjs            report only
//   node tools/palette.mjs --write    write the result into content/tuning.json

import { readFileSync, writeFileSync } from 'node:fs';
import { ballFaceMean } from '../art/bakers.js';

// THE critical step. The optimiser scores the colour that reaches the screen after
// shading, not the source hex. Optimising source colours produced a palette with
// worst-case separation of deltaE 34 that measured deltaE 5 once baked.
// Per-slot residuals measured from the real bake (tools/measurefaces.mjs). The
// analytic model cannot see the engraved glyph, and each slot's glyph covers a
// different fraction of its face, so the correction is a per-slot constant.
let CALIBRATION = null;
try {
  CALIBRATION = JSON.parse(readFileSync('content/face-calibration.json', 'utf8')).slots;
} catch {
  CALIBRATION = null;
}

const renderCache = new Map();
function rendered(rgb, slot = -1) {
  const hex = toHex(rgb);
  const key = `${hex}:${slot}`;
  if (!renderCache.has(key)) {
    const base = ballFaceMean(hex);
    const res = CALIBRATION && CALIBRATION[slot] ? CALIBRATION[slot].residual : [0, 0, 0];
    renderCache.set(key, base.map((c, i) => Math.max(0, Math.min(1, (c + res[i]) / 255))));
  }
  return renderCache.get(key);
}

// Measured track-bed brightness (see artgates output) converted to RELATIVE
// LUMINANCE. Passing the raw sRGB value here demanded near-white for every ball
// and the search returned no valid palette at all.
const BED_SRGB = 34 / 255;
const MIN_CONTRAST = 3.6;
let BED_LUMINANCE = 0; // set below, once srgbToLinear is defined
const MIN_CHROMA = [42, 42, 42, 42, 42, 4]; // the sixth ("bone") is allowed to be near-neutral
// Aesthetic bounds. Unconstrained, the optimiser happily returns neon cyan and
// highlighter yellow at deltaE 39 — functionally superb and completely wrong for a
// brass-and-iron scene. These caps cost some separation and buy jewel tones.
const MAX_CHROMA = 74;
const MIN_L = 46;
const MAX_L = 86;
const ITERATIONS = 9000; // each evaluation now integrates a shaded sphere, so far fewer steps

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const linearToSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const relLum = ([r, g, b]) => 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
BED_LUMINANCE = srgbToLinear(BED_SRGB);

function labToRgb(L, a, bb) {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - bb / 200;
  const inv = (t) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
  const x = inv(fx) * 0.95047, y = inv(fy), z = inv(fz) * 1.08883;
  const lr = x * 3.2406 + y * -1.5372 + z * -0.4986;
  const lg = x * -0.9689 + y * 1.8758 + z * 0.0415;
  const lb = x * 0.0557 + y * -0.204 + z * 1.057;
  return [linearToSrgb(lr), linearToSrgb(lg), linearToSrgb(lb)];
}

function rgbToLab([r, g, b]) {
  const [lr, lg, lb] = [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
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
  const l = rgb.map(srgbToLinear);
  return [
    m[0] * l[0] + m[1] * l[1] + m[2] * l[2],
    m[3] * l[0] + m[4] * l[1] + m[5] * l[2],
    m[6] * l[0] + m[7] * l[1] + m[8] * l[2],
  ].map((c) => linearToSrgb(Math.max(0, Math.min(1, c))));
}

const deltaE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const inGamut = (rgb) => rgb.every((c) => c >= -0.002 && c <= 1.002);
const clampRgb = (rgb) => rgb.map((c) => Math.max(0, Math.min(1, c)));
const toHex = (rgb) => '#' + clampRgb(rgb).map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('');

const VISION = ['normal', 'protan', 'deutan', 'tritan'];

// Constraints are SOFT penalties, not hard rejections. Returning a flat -1 for any
// infeasible palette gives the hill-climb no gradient to follow out of an
// infeasible random start, and the search never moved off its seed.
function violations(colors) {
  let penalty = 0;
  for (let i = 0; i < colors.length; i++) {
    for (const c of colors[i]) {
      if (c < 0) penalty += -c * 300;
      if (c > 1) penalty += (c - 1) * 300;
    }
    const cr = contrast(relLum(rendered(clampRgb(colors[i]), i)), BED_LUMINANCE);
    if (cr < MIN_CONTRAST) penalty += (MIN_CONTRAST - cr) * 55;
    const lab = rgbToLab(clampRgb(colors[i]));
    const chroma = Math.hypot(lab[1], lab[2]);
    if (chroma < MIN_CHROMA[i]) penalty += (MIN_CHROMA[i] - chroma) * 1.6;
    if (chroma > MAX_CHROMA) penalty += (chroma - MAX_CHROMA) * 1.6;
    if (lab[0] < MIN_L) penalty += (MIN_L - lab[0]) * 2.2;
    if (lab[0] > MAX_L) penalty += (lab[0] - MAX_L) * 2.2;
  }
  return penalty;
}

function separation(colors) {
  let worst = Infinity;
  const shown = colors.map((c, i) => rendered(clampRgb(c), i));
  for (const v of VISION) {
    const labs = shown.map((c) => rgbToLab(simulate(c, v)));
    for (let i = 0; i < labs.length; i++) {
      for (let j = i + 1; j < labs.length; j++) worst = Math.min(worst, deltaE(labs[i], labs[j]));
    }
  }
  return worst;
}

const score = (colors) => separation(colors) - violations(colors);
const feasible = (colors) => violations(colors) < 0.001;

// Randomised hill-climb with restarts. The space is small and the objective is
// cheap, so brute force is entirely adequate.
let best = null;
let rng = 20260731;
const rand = () => ((rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0) / 4294967296);

for (let restart = 0; restart < 26; restart++) {
  let cur = Array.from({ length: 6 }, (_, i) => {
    const L = 32 + rand() * 62;
    const C = (i === 5 ? 6 : 48) + rand() * 26;
    const h = rand() * Math.PI * 2;
    return labToRgb(L, Math.cos(h) * C, Math.sin(h) * C);
  });
  let curScore = score(cur);
  const steps = ITERATIONS / 26;

  for (let it = 0; it < steps; it++) {
    const temp = 1 - it / steps;
    const k = Math.floor(rand() * 6);
    const lab = rgbToLab(cur[k]);
    const cand = [...cur];
    cand[k] = labToRgb(
      lab[0] + (rand() - 0.5) * 26 * temp,
      lab[1] + (rand() - 0.5) * 34 * temp,
      lab[2] + (rand() - 0.5) * 34 * temp,
    );
    const s = score(cand);
    if (s > curScore) {
      cur = cand;
      curScore = s;
    }
  }
  if (feasible(cur) && (!best || curScore > best.score)) best = { score: separation(cur), colors: cur.map(clampRgb) };
}

if (!best) {
  console.error('no feasible palette found — relax MIN_CONTRAST or MIN_CHROMA');
  process.exit(1);
}

// Order by hue so the palette reads sensibly, keeping the near-neutral last.
const withLab = best.colors.map((c) => ({ rgb: clampRgb(c), lab: rgbToLab(c) }));
const neutral = withLab.reduce((a, b) => (Math.hypot(a.lab[1], a.lab[2]) < Math.hypot(b.lab[1], b.lab[2]) ? a : b));
const rest = withLab.filter((c) => c !== neutral).sort((a, b) => Math.atan2(a.lab[2], a.lab[1]) - Math.atan2(b.lab[2], b.lab[1]));
// Once calibrated, slot order is meaningful (slot -> glyph -> residual), so it
// must not be reshuffled between rounds.
const ordered = CALIBRATION ? withLab : [...rest, neutral];

console.log(`worst-case pairwise separation across normal/protan/deutan/tritan: deltaE ${best.score.toFixed(1)}\n`);
console.log('  source  -> rendered     L*     C*    contrast-vs-bed');
for (const c of ordered) {
  const C = Math.hypot(c.lab[1], c.lab[2]);
  console.log(
    `  ${toHex(c.rgb)} -> ${toHex(rendered(c.rgb, ordered.indexOf(c)))}  ${c.lab[0].toFixed(1).padStart(5)}  ${C.toFixed(1).padStart(5)}   ${contrast(relLum(rendered(c.rgb, ordered.indexOf(c))), BED_LUMINANCE).toFixed(2)}:1`,
  );
}

console.log('\n  worst pair per vision model:');
for (const v of VISION) {
  const labs = ordered.map((c, i) => rgbToLab(simulate(rendered(c.rgb, i), v)));
  let w = { d: Infinity };
  for (let i = 0; i < labs.length; i++) {
    for (let j = i + 1; j < labs.length; j++) {
      const d = deltaE(labs[i], labs[j]);
      if (d < w.d) w = { d, i, j };
    }
  }
  console.log(`    ${v.padEnd(7)} deltaE ${w.d.toFixed(1)}  (${toHex(ordered[w.i].rgb)} / ${toHex(ordered[w.j].rgb)})`);
}

if (process.argv.includes('--write')) {
  const tuning = JSON.parse(readFileSync('content/tuning.json', 'utf8'));
  tuning.palette.colors.forEach((c, i) => {
    c.hex = toHex(ordered[i].rgb);
  });
  tuning.palette._optimisedBy = 'tools/palette.mjs';
  tuning.palette._worstDeltaE = +best.score.toFixed(1);
  writeFileSync('content/tuning.json', JSON.stringify(tuning, null, 2) + '\n');
  console.log('\nwritten to content/tuning.json');
}
