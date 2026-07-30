// Difficulty-profile metrics — plan §6.2.
//
// This replaces v1's curve-geometry diff. We do NOT compare our lanes to REF's
// shapes (that would be tracing, see §0.2); we measure the properties a player
// actually feels and check them against designed bands. Original geometry,
// equivalent experience.
//
// Also computes the §3.5 aspect-fit assertion: every sample must lie inside the
// 16:10 reference box, because that is what makes difficulty identical on a 4:3
// iPad, a 19.5:9 iPhone and a 16:10 Deck.

import { buildLane } from './lane.js';

const SAMPLE_SPACING = 25;

function resample(lane) {
  const out = [];
  for (let s = 0; s <= lane.length; s += SAMPLE_SPACING) {
    let lo = 0;
    let hi = lane.count - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (lane.cum[mid] < s) lo = mid + 1;
      else hi = mid;
    }
    const i = lo > 0 ? lo - 1 : 0;
    const seg = lane.cum[i + 1] - lane.cum[i];
    const f = seg > 0 ? (s - lane.cum[i]) / seg : 0;
    out.push([lane.xs[i] + (lane.xs[i + 1] - lane.xs[i]) * f, lane.ys[i] + (lane.ys[i + 1] - lane.ys[i]) * f]);
  }
  return out;
}

function segmentsCross(p1, p2, p3, p4) {
  const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
  if (Math.abs(d) < 1e-9) return false;
  const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d;
  const u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d;
  return t > 0 && t < 1 && u > 0 && u < 1;
}

function countCrossings(polylines) {
  let n = 0;
  const segs = [];
  polylines.forEach((pts, laneIdx) => {
    for (let i = 0; i < pts.length - 1; i++) segs.push({ a: pts[i], b: pts[i + 1], laneIdx, i });
  });
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 2; j < segs.length; j++) {
      // Skip neighbours within a lane; they share endpoints by construction.
      if (segs[i].laneIdx === segs[j].laneIdx && Math.abs(segs[i].i - segs[j].i) <= 2) continue;
      if (segmentsCross(segs[i].a, segs[i].b, segs[j].a, segs[j].b)) n++;
    }
  }
  return n;
}

function tightestTurnRadius(pts) {
  const stride = 2; // ~50 units apart, enough to see through sampling noise
  let tightest = Infinity;
  for (let i = stride; i < pts.length - stride; i++) {
    const a = pts[i - stride];
    const b = pts[i];
    const c = pts[i + stride];
    const ab = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const bc = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const ca = Math.hypot(a[0] - c[0], a[1] - c[1]);
    const area = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
    if (area < 1e-6) continue;
    const r = (ab * bc * ca) / (4 * area);
    if (r < tightest) tightest = r;
  }
  return tightest === Infinity ? null : Math.round(tightest * 10) / 10;
}

export function profileFor(level, tuningRow, globals) {
  const D = globals.ballRadius * 2;
  const geoms = level.lanes.map((l) => buildLane(l.points));
  const polys = geoms.map(resample);

  const totalLength = geoms.reduce((n, g) => n + g.length, 0);
  const longest = Math.max(...geoms.map((g) => g.length));

  let inside = 0;
  let total = 0;
  for (const pts of polys) {
    for (const [x, y] of pts) {
      total++;
      if (x >= 0 && y >= 0 && x <= level.box[0] && y <= level.box[1]) inside++;
    }
  }

  return {
    id: level.id,
    name: level.name,
    chapter: level.chapter,
    laneCount: level.lanes.length,
    lengthInDiameters: Math.round((totalLength / D) * 10) / 10,
    // Time for a ball to ride the longest lane from gate to intake — the real
    // measure of how much thinking room a level gives you.
    reactionBudgetSec: Math.round((longest / tuningRow.chainSpeed) * 10) / 10,
    crossings: countCrossings(polys),
    tightestTurnRadius: Math.min(...polys.map((p) => tightestTurnRadius(p) ?? Infinity)),
    insideBoxFraction: Math.round((inside / total) * 10000) / 10000,
    shooterClearance: level.shooterClearance ?? null,
    colors: tuningRow.colors,
    gaugeTarget: tuningRow.gaugeTarget,
    chainSpeed: tuningRow.chainSpeed,
  };
}
