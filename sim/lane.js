// Lane geometry: Catmull-Rom through the authored control points, resampled into
// an arc-length table so the sim can address positions by distance-travelled.
//
// Pure geometry, no trig — polynomial evaluation only, so it is deterministic.

const SUBDIV = 4;

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

export function buildLane(points) {
  const n = points.length;
  const xs = [];
  const ys = [];
  const at = (i) => points[i < 0 ? 0 : i > n - 1 ? n - 1 : i];

  for (let i = 0; i < n - 1; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const last = i === n - 2 ? SUBDIV : SUBDIV - 1;
    for (let s = 0; s <= last; s++) {
      const t = s / SUBDIV;
      xs.push(catmull(p0[0], p1[0], p2[0], p3[0], t));
      ys.push(catmull(p0[1], p1[1], p2[1], p3[1], t));
    }
  }

  const cum = new Float64Array(xs.length);
  cum[0] = 0;
  for (let i = 1; i < xs.length; i++) {
    const dx = xs[i] - xs[i - 1];
    const dy = ys[i] - ys[i - 1];
    cum[i] = cum[i - 1] + Math.sqrt(dx * dx + dy * dy);
  }

  return {
    xs: Float64Array.from(xs),
    ys: Float64Array.from(ys),
    cum,
    length: cum[cum.length - 1],
    count: xs.length,
  };
}

function indexFor(lane, s) {
  const cum = lane.cum;
  let lo = 0;
  let hi = lane.count - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] < s) lo = mid + 1;
    else hi = mid;
  }
  return lo > 0 ? lo - 1 : 0;
}

// Positions outside [0, length] extrapolate along the end tangent. Balls pushed
// backwards past the entry sit inside the feed pipe at negative distance, which is
// what stops insertion from ever overlapping balls at the entry (§ sim/rules).
export function pointAt(lane, s, out) {
  const o = out || { x: 0, y: 0 };
  if (s <= 0) {
    const t = tangentAt(lane, 0);
    o.x = lane.xs[0] + t.x * s;
    o.y = lane.ys[0] + t.y * s;
    return o;
  }
  if (s >= lane.length) {
    const last = lane.count - 1;
    const t = tangentAt(lane, lane.length);
    const over = s - lane.length;
    o.x = lane.xs[last] + t.x * over;
    o.y = lane.ys[last] + t.y * over;
    return o;
  }
  const i = indexFor(lane, s);
  const seg = lane.cum[i + 1] - lane.cum[i];
  const f = seg > 0 ? (s - lane.cum[i]) / seg : 0;
  o.x = lane.xs[i] + (lane.xs[i + 1] - lane.xs[i]) * f;
  o.y = lane.ys[i] + (lane.ys[i + 1] - lane.ys[i]) * f;
  return o;
}

export function tangentAt(lane, s) {
  const i = Math.min(Math.max(indexFor(lane, Math.max(0, Math.min(s, lane.length))), 0), lane.count - 2);
  const dx = lane.xs[i + 1] - lane.xs[i];
  const dy = lane.ys[i + 1] - lane.ys[i];
  const m = Math.sqrt(dx * dx + dy * dy) || 1;
  return { x: dx / m, y: dy / m };
}
