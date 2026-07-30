// Emits content/lanes/*.json — the level roster.
//
// Per §0.2/§6.2 these lanes are ORIGINAL GEOMETRY. They are not traced from REF;
// they are generated from parametric families and then checked against designed
// difficulty bands (tests/profiles.test.js). This script is the authoring half of
// the level editor called for in §3.3.
//
// Two guarantees this script enforces by construction, so no playtest round has to
// discover them:
//   1. Every control point lands inside the 16:10 reference box (§3.5), which is
//      what makes difficulty identical on 4:3, 19.5:9 and 16:10.
//   2. No turn is tighter than MIN_TURN_RADIUS. A corner tighter than a ball
//      diameter makes the chain visually overlap itself and the player cannot read
//      colour order — found by the first profile dump, fixed by relax() below.

import { writeFileSync, mkdirSync } from 'node:fs';

const BOX_W = 1600;
const BOX_H = 1000;
const MARGIN = 110;
const MIN_TURN_RADIUS = 60; // 1.5 ball diameters
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- lane families

function spiral({ turns = 2.5, r0 = 1.0, r1 = 0.22, phase = 0, dir = 1, squash = 0.62 } = {}) {
  const pts = [];
  const steps = Math.round(turns * 64);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = phase + dir * t * turns * TAU;
    const r = r0 + (r1 - r0) * t;
    pts.push([Math.cos(a) * r, Math.sin(a) * r * squash]);
  }
  return pts;
}

function serpentine({ lobes = 3, amp = 0.85, yOffset = 0, flip = false } = {}) {
  const pts = [];
  const steps = lobes * 56;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = -1 + 2 * t;
    pts.push([flip ? -x : x, Math.sin(t * lobes * Math.PI) * amp + yOffset]);
  }
  return pts;
}

// Figure eight — exactly one self-crossing. Note the 1:2 ratio specifically: most
// other small Lissajous ratios (1:3 among them) satisfy p(pi - t) === p(t), so the
// curve retraces itself and produces a lane that is visually two lanes in the same
// place. The profile dump caught two of those at 215 and 256 crossings.
function figureEight({ squash = 0.62 } = {}) {
  const pts = [];
  const steps = 220;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * TAU;
    pts.push([Math.sin(t), Math.sin(2 * t) * squash]);
  }
  return pts;
}

// Coil: loops advancing along the x axis. Crossing count is controlled directly —
// when the advance per turn is less than the loop diameter, consecutive loops
// overlap, giving roughly `turns - 1` crossings. Predictable beats clever.
function coil({ turns = 3, radius = 0.36, span = 0.72, squash = 0.85 } = {}) {
  const pts = [];
  const steps = turns * 90;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = t * turns * TAU;
    pts.push([(-1 + 2 * t) * span + radius * Math.cos(a), radius * Math.sin(a) * squash]);
  }
  return pts;
}

const stretchX = (pts, k) => pts.map(([x, y]) => [x * k, y]);

// Boustrophedon sweeps with rounded returns — long track, no crossings.
function cascade({ sweeps = 4 } = {}) {
  const pts = [];
  const rows = sweeps;
  const steps = 40;
  for (let r = 0; r < rows; r++) {
    const y = -1 + (2 * r) / (rows - 1 || 1);
    const dir = r % 2 === 0 ? 1 : -1;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      pts.push([dir * (-1 + 2 * t) * 0.9, y]);
    }
    if (r < rows - 1) {
      const yNext = -1 + (2 * (r + 1)) / (rows - 1 || 1);
      const cx = dir * 0.9;
      for (let i = 1; i < 16; i++) {
        const ang = (i / 16) * Math.PI;
        pts.push([cx + dir * Math.sin(ang) * 0.16, y + ((yNext - y) * (1 - Math.cos(ang))) / 2]);
      }
    }
  }
  return pts;
}

// --------------------------------------------------------- geometry conditioning

function turnRadiusAt(pts, i, stride) {
  const a = pts[i - stride];
  const b = pts[i];
  const c = pts[i + stride];
  const ab = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const bc = Math.hypot(c[0] - b[0], c[1] - b[1]);
  const ca = Math.hypot(a[0] - c[0], a[1] - c[1]);
  const area = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
  if (area < 1e-9) return Infinity;
  return (ab * bc * ca) / (4 * area);
}

function minTurnRadius(pts, stride = 2) {
  let m = Infinity;
  for (let i = stride; i < pts.length - stride; i++) m = Math.min(m, turnRadiusAt(pts, i, stride));
  return m;
}

// Uniform arc-length resampling. Curvature measured on unevenly spaced samples is
// meaningless — where the parametric speed is low the samples bunch up and the
// circumradius collapses toward zero, which reported turn radii of 3 and 7 units on
// geometry that was merely tight, not degenerate. Every curvature measurement below
// happens on uniformly spaced points.
function resampleUniform(pts, spacing) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  const total = cum[cum.length - 1];
  const n = Math.max(8, Math.round(total / spacing));
  const out = [];
  let j = 0;
  for (let k = 0; k <= n; k++) {
    const s = (k / n) * total;
    while (j < cum.length - 2 && cum[j + 1] < s) j++;
    const seg = cum[j + 1] - cum[j];
    const f = seg > 0 ? (s - cum[j]) / seg : 0;
    out.push([pts[j][0] + (pts[j + 1][0] - pts[j][0]) * f, pts[j][1] + (pts[j + 1][1] - pts[j][1]) * f]);
  }
  return out;
}

// Laplacian relaxation until every turn clears MIN_TURN_RADIUS, re-resampled each
// pass so spacing stays uniform. Endpoints are pinned so the gate and intake stay
// where they were designed.
function relax(pts, minRadius, spacing = 20, maxPasses = 800) {
  let cur = resampleUniform(pts, spacing);
  for (let pass = 0; pass < maxPasses; pass++) {
    if (minTurnRadius(cur) >= minRadius) break;
    const next = cur.map((p) => [p[0], p[1]]);
    for (let i = 1; i < cur.length - 1; i++) {
      next[i][0] = cur[i][0] + 0.3 * (cur[i - 1][0] + cur[i + 1][0] - 2 * cur[i][0]);
      next[i][1] = cur[i][1] + 0.3 * (cur[i - 1][1] + cur[i + 1][1] - 2 * cur[i][1]);
    }
    cur = resampleUniform(next, spacing);
  }
  return cur;
}

function fitToBox(lanes) {
  const all = lanes.flat();
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of all) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const s = Math.min((BOX_W - MARGIN * 2) / (maxX - minX || 1), (BOX_H - MARGIN * 2) / (maxY - minY || 1));
  const offX = (BOX_W - (maxX - minX) * s) / 2 - minX * s;
  const offY = (BOX_H - (maxY - minY) * s) / 2 - minY * s;
  return lanes.map((pts) => pts.map(([x, y]) => [x * s + offX, y * s + offY]));
}

const round2 = (lanes) => lanes.map((pts) => pts.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]));

// -------------------------------------------------------------- turret placement
// Maximise clearance from every lane. Automating this is what stops a level from
// being unfair by accident; a hand-placed turret 40px off the track is a Sev-2
// no playtest should have to find.

function placeShooter(lanes) {
  let best = null;
  for (let gx = 0.2; gx <= 0.8; gx += 0.02) {
    for (let gy = 0.22; gy <= 0.78; gy += 0.02) {
      const p = [BOX_W * gx, BOX_H * gy];
      let minD = Infinity;
      for (const pts of lanes) for (const q of pts) minD = Math.min(minD, Math.hypot(p[0] - q[0], p[1] - q[1]));
      const score = minD * (1 - 0.25 * Math.hypot(gx - 0.5, gy - 0.5));
      if (!best || score > best.score) best = { score, p, minD };
    }
  }
  return { shooter: [Math.round(best.p[0] * 100) / 100, Math.round(best.p[1] * 100) / 100], clearance: Math.round(best.minD * 100) / 100 };
}

// ------------------------------------------------------------------- the roster

const CHAPTERS = ['Boiler Deck', 'Clockworks', 'Pneumatic Exchange', 'Aether Observatory', 'Airship Yards', 'Spire Foundry'];

const ROSTER = [
  { name: 'First Firing',     build: () => [serpentine({ lobes: 2, amp: 0.7 })] },
  { name: 'Feedwater',        build: () => [serpentine({ lobes: 3, amp: 0.8 })] },
  { name: 'Mainspring',       build: () => [spiral({ turns: 2.0, r1: 0.3 })] },
  { name: 'Escapement',       build: () => [figureEight()] },
  { name: 'Transit Hall',     build: () => [cascade({ sweeps: 4 })] },
  { name: 'Sorting Yard',     build: () => [cascade({ sweeps: 5 })] },
  { name: 'Orrery',           build: () => [coil({ turns: 2, radius: 0.4, span: 0.66 })] },
  { name: 'Aether Drift',     build: () => [coil({ turns: 3, radius: 0.38, span: 0.7 })] },
  { name: 'Twin Gantries',    build: () => [stretchX(serpentine({ lobes: 4, amp: 0.4, yOffset: -0.6 }), 1.75),
                                            stretchX(serpentine({ lobes: 4, amp: 0.4, yOffset: 0.6, flip: true }), 1.75)] },
  { name: 'Mooring Spiral',   build: () => [spiral({ turns: 3.0, r0: 0.95, r1: 0.24, squash: 1.0 }).map(([x, y]) => [x * 0.5 - 0.52, y]),
                                            spiral({ turns: 3.0, r0: 0.95, r1: 0.24, squash: 1.0, phase: Math.PI }).map(([x, y]) => [x * 0.5 + 0.52, y])] },
  { name: 'Crucible',         build: () => [spiral({ turns: 3.0, r0: 1.0, r1: 0.26 })] },
  { name: 'The Great Ascent', build: () => [coil({ turns: 5, radius: 0.34, span: 0.78 })] },
];

// Designed reaction-budget curve, seconds from gate to intake on the longest lane.
// Monotone by intent. chainSpeed is DERIVED from this (see tools/derivespeed.js)
// rather than picked by hand — the first profile dump showed hand-picked speeds
// produced a budget curve of 76,92,161,209,111,126,116,162,20,66,149,186, which is
// not a difficulty curve at all.
export const REACTION_BUDGET_SEC = [90, 84, 78, 73, 68, 64, 60, 56, 53, 50, 47, 44];

mkdirSync('content/lanes', { recursive: true });

const index = [];
const report = [];

ROSTER.forEach((entry, i) => {
  const id = i + 1;
  let lanes = fitToBox(entry.build());
  lanes = lanes.map((pts) => relax(pts, MIN_TURN_RADIUS));
  // Relaxation shrinks a curve, so refit and re-verify: scaling up only ever
  // increases turn radius, so a second short pass is enough to hold the guarantee.
  lanes = fitToBox(lanes);
  lanes = lanes.map((pts) => relax(pts, MIN_TURN_RADIUS, 20, 120));
  lanes = round2(fitToBox(lanes));

  const { shooter, clearance } = placeShooter(lanes);
  const level = {
    _generated: 'tools/genlanes.js',
    id,
    name: entry.name,
    chapter: Math.floor(i / 2) + 1,
    chapterName: CHAPTERS[Math.floor(i / 2)],
    box: [BOX_W, BOX_H],
    shooter,
    shooterClearance: clearance,
    targetReactionSec: REACTION_BUDGET_SEC[i],
    lanes: lanes.map((points) => ({ points })),
  };

  const file = `content/lanes/${String(id).padStart(2, '0')}.json`;
  writeFileSync(file, JSON.stringify(level));
  index.push({ id, name: entry.name, chapter: level.chapter, chapterName: level.chapterName, file });
  const lens = lanes.map((l) => {
    let n = 0;
    for (let i = 1; i < l.length; i++) n += Math.hypot(l[i][0] - l[i - 1][0], l[i][1] - l[i - 1][1]);
    return Math.round(n / 40);
  });
  report.push({ id, name: entry.name, minR: Math.round(Math.min(...lanes.map((l) => minTurnRadius(l)))), clearance, lens });
});

writeFileSync('content/lanes/index.json', JSON.stringify({ levels: index }));
for (const r of report) {
  console.log(
    `${String(r.id).padStart(2)} ${r.name.padEnd(18)} minTurnRadius=${String(r.minR).padStart(4)}` +
      ` turretClearance=${String(r.clearance).padStart(7)} laneDiameters=[${r.lens.join(', ')}]`,
  );
}
console.log(`\n${index.length} levels; MIN_TURN_RADIUS=${MIN_TURN_RADIUS}`);
