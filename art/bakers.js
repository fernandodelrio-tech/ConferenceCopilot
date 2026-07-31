// Asset bakers. Each returns { name, canvas } and is driven by tools/bake.mjs.
//
// Authoring resolution is 2x Deck native per plan §3.4, and spheres are baked at
// ~8x their largest shipped size so they stay crisp on an iPad Pro at 2x DPR.

import {
  makeImage, makeImageSS, sphereNormal, shade, envSample, hexToLinear,
  fbm, brushed, valueNoise, clamp01, mix, smoothstep, fresnel, toByte,
} from './lib/shade.js';

const BRASS = hexToLinear('#b98a3c');
const BRASS_DARK = hexToLinear('#6d5326');
const IRON = hexToLinear('#3a4147');
const IRON_DARK = hexToLinear('#1b1f23');
const VERDIGRIS = hexToLinear('#3f7d6e');

function canvasOf(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// ============================================================ balls (the hero)
//
// The single most-looked-at object in the game: six of them are on screen at all
// times and the player reads colour + glyph from them under time pressure. Every
// technique here exists to serve that read, not to be pretty:
//
//   - a real sphere normal with key/fill/rim and an environment probe, so the ball
//     has form instead of being a radial gradient
//   - refracted interior: light entering the glass and pooling as a caustic on the
//     far-lower side, which is what makes a marble look like glass and not plastic
//   - a THIN brass cage. It never covers more than the outer 12% of the radius,
//     because the coloured area is the signal
//   - the glyph engraved with a proper bevel (dark on the light-facing edge, bright
//     on the far edge) so it survives at 24 physical pixels

export const BALL_SIZE = 192;

export function bakeBall(colorHex, glyphKind) {
  const S = BALL_SIZE;
  const c = canvasOf(S, S);
  const ctx = c.getContext('2d');
  const R = S * 0.46;
  const cx = S / 2;
  const cy = S / 2;
  const albedo = hexToLinear(colorHex);

  const img = makeImageSS(ctx, S, S, (px, py) => {
    const u = (px - cx) / R;
    const v = (py - cy) / R;
    const r2 = u * u + v * v;
    if (r2 > 1.0) return null;

    const n = sphereNormal(u, v);
    const rad = Math.sqrt(r2);

    // --- brass cage: outer bezel plus four claws reaching over the glass.
    const bezel = smoothstep(0.86, 0.9, rad);
    const claw = clawMask(u, v, rad);
    const metalMask = clamp01(Math.max(bezel, claw));

    // --- glass body
    const glass = shade(albedo, n, { metal: 0, rough: 0.08, envScale: 0.12 });

    // Interior transmission: tint deepens with path length through the ball, and a
    // caustic pools opposite the key light.
    // Both terms are multiplied by albedo so they deepen the ball's own colour
    // rather than washing toward white. The first bake ran the caustic at 3.4,
    // which blew a near-white hotspot across a third of the face and collapsed the
    // measured separation between colours from deltaE 34 to deltaE 5 — art gate G3
    // catches exactly this, and it is invisible to the eye on a single ball.
    const depth = n[2];
    const caustic = Math.pow(clamp01(0.55 + u * 0.75 + v * 0.6), 9) * (1 - rad * 0.35);
    for (let i = 0; i < 3; i++) {
      glass[i] += albedo[i] * depth * 0.85;
      glass[i] += albedo[i] * caustic * 1.5;
      glass[i] *= mix(1.0, 0.66, smoothstep(0.55, 1.0, rad)); // edge densification
    }

    // Contact-shadow darkening at the very rim keeps balls separable when packed.
    const rimDark = 1 - smoothstep(0.93, 1.0, rad) * 0.5;
    for (let i = 0; i < 3; i++) glass[i] *= rimDark;

    // --- metal
    let out = glass;
    if (metalMask > 0.001) {
      // Curve the bezel outward so it catches its own highlight.
      const bevel = smoothstep(0.86, 1.0, rad);
      const mn = [
        n[0] * (1 + bevel * 0.7),
        n[1] * (1 + bevel * 0.7),
        n[2] * (1 - bevel * 0.55),
      ];
      const ml = Math.hypot(mn[0], mn[1], mn[2]) || 1;
      const nn = [mn[0] / ml, mn[1] / ml, mn[2] / ml];

      const grain = brushed(Math.atan2(v, u) / Math.PI, rad, 60, 20, 11);
      const wear = smoothstep(0.4, 0.9, fbm(u * 6 + 3, v * 6, 3, 5));
      const metalAlbedo = BRASS.map((b, i) => mix(b, BRASS_DARK[i], 0.35 + grain * 0.5) * mix(1, 1.25, wear));
      const metal = shade(metalAlbedo, nn, { metal: 1, rough: 0.22 + grain * 0.22 });

      out = out.map((g, i) => mix(g, metal[i], metalMask));
    }

    // Antialias the silhouette in the alpha channel.
    const alpha = 1 - smoothstep(0.985, 1.0, rad);
    return [out[0], out[1], out[2], alpha];
  }, 2);

  ctx.putImageData(img, 0, 0);

  // --- engraved glyph, composited after shading so it can use canvas paths.
  engraveGlyph(ctx, glyphKind, cx, cy, R);

  return { name: `ball-${glyphKind}`, canvas: c };
}

// Mean colour of a ball's glass face, computed with the SAME shading path bakeBall
// uses. Exported so tools/palette.mjs can optimise the palette against what the
// player actually sees: source-space optimisation is worthless here, because the
// shading pipeline compressed a deltaE-34 palette down to deltaE 5 on screen.
export function ballFaceMean(colorHex) {
  const albedo = hexToLinear(colorHex);
  let r = 0, g = 0, b = 0, n = 0;
  const STEP = 0.02;
  for (let v = -0.62; v <= 0.62; v += STEP) {
    for (let u = -0.62; u <= 0.62; u += STEP) {
      if (Math.hypot(u, v) > 0.62) continue;
      const nrm = sphereNormal(u, v);
      if (!nrm) continue;
      const rad = Math.hypot(u, v);
      const glass = shade(albedo, nrm, { metal: 0, rough: 0.08, envScale: 0.12 });
      const depth = nrm[2];
      const caustic = Math.pow(clamp01(0.55 + u * 0.75 + v * 0.6), 9) * (1 - rad * 0.35);
      for (let i = 0; i < 3; i++) {
        glass[i] += albedo[i] * depth * 0.85;
        glass[i] += albedo[i] * caustic * 1.5;
        glass[i] *= mix(1.0, 0.66, smoothstep(0.55, 1.0, rad));
        glass[i] *= 1 - smoothstep(0.93, 1.0, rad) * 0.5;
      }
      r += toByte(glass[0]); g += toByte(glass[1]); b += toByte(glass[2]); n++;
    }
  }
  return [r / n, g / n, b / n];
}

// Four claws at the diagonals, so they never sit on top of the glyph.
function clawMask(u, v, rad) {
  if (rad < 0.6) return 0;
  const a = Math.atan2(v, u);
  let best = 0;
  for (let i = 0; i < 4; i++) {
    const ca = -Math.PI * 0.75 + (i * Math.PI) / 2;
    let d = Math.abs(((a - ca + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    d = Math.PI - d;
    const angular = 1 - smoothstep(0.17, 0.30, d);
    const radial = smoothstep(0.60, 0.72, rad);
    best = Math.max(best, angular * radial);
  }
  return best;
}

function glyphPath(ctx, kind, r) {
  ctx.beginPath();
  switch (kind) {
    case 'spiral':
      for (let i = 0; i <= 48; i++) {
        const t = i / 48;
        const a = t * 1.7 * Math.PI * 2;
        const rr = r * 0.16 + t * r * 0.4;
        const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      break;
    case 'cross':
      ctx.moveTo(-r * 0.5, 0); ctx.lineTo(r * 0.5, 0);
      ctx.moveTo(0, -r * 0.5); ctx.lineTo(0, r * 0.5);
      break;
    case 'dot-triad':
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + (i * Math.PI * 2) / 3;
        const x = Math.cos(a) * r * 0.34, y = Math.sin(a) * r * 0.34;
        ctx.moveTo(x + r * 0.14, y);
        ctx.arc(x, y, r * 0.14, 0, Math.PI * 2);
      }
      break;
    case 'chevron':
      ctx.moveTo(-r * 0.42, r * 0.20); ctx.lineTo(0, -r * 0.32); ctx.lineTo(r * 0.42, r * 0.20);
      break;
    case 'ring':
      ctx.moveTo(r * 0.42, 0); ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2);
      break;
    case 'bar':
      ctx.moveTo(-r * 0.48, 0); ctx.lineTo(r * 0.48, 0);
      break;
    default:
      ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2);
  }
}

// Engraving = a dark groove, a shadow on the key-facing edge, and a lit far edge.
// Three offset strokes, not one — that is the whole difference between "carved"
// and "drawn on with a marker".
function engraveGlyph(ctx, kind, cx, cy, r) {
  const w = r * 0.135;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalCompositeOperation = 'source-atop';

  // far edge catches light (key comes from upper-left, so light lands lower-right)
  ctx.translate(w * 0.30, w * 0.30);
  ctx.strokeStyle = 'rgba(255,246,225,0.42)';
  ctx.lineWidth = w;
  glyphPath(ctx, kind, r);
  ctx.stroke();

  // the groove itself
  ctx.translate(-w * 0.30, -w * 0.30);
  ctx.strokeStyle = 'rgba(14,12,10,0.46)';
  ctx.lineWidth = w;
  glyphPath(ctx, kind, r);
  ctx.stroke();

  // occlusion on the key-facing lip
  ctx.translate(-w * 0.26, -w * 0.26);
  ctx.strokeStyle = 'rgba(0,0,0,0.24)';
  ctx.lineWidth = w * 0.72;
  glyphPath(ctx, kind, r);
  ctx.stroke();

  ctx.restore();
}

// ==================================================== powerup ring overlays

export function bakePowerupRing(kind, hex) {
  const S = 192;
  const c = canvasOf(S, S);
  const ctx = c.getContext('2d');
  const col = hexToLinear(hex);
  const R = S * 0.46;

  const img = makeImageSS(ctx, S, S, (px, py) => {
    const u = (px - S / 2) / R;
    const v = (py - S / 2) / R;
    const rad = Math.hypot(u, v);
    const band = Math.exp(-Math.pow((rad - 1.05) * 7.5, 2));
    if (band < 0.004) return null;

    // Ticks around the ring so each powerup reads as an instrument, not a glow.
    const a = Math.atan2(v, u);
    const ticks = 0.55 + 0.45 * Math.pow(Math.abs(Math.cos(a * 12)), 8);
    const i = band * ticks * 3.2;
    return [col[0] * i, col[1] * i, col[2] * i, clamp01(band * 1.4)];
  }, 2);

  ctx.putImageData(img, 0, 0);
  return { name: `powerup-${kind}`, canvas: c };
}

// ================================================================== turret

export function bakeTurretBody() {
  const S = 512;
  const c = canvasOf(S, S);
  const ctx = c.getContext('2d');
  const R = S * 0.45;

  const img = makeImageSS(ctx, S, S, (px, py) => {
    const u = (px - S / 2) / R;
    const v = (py - S / 2) / R;
    const rad = Math.hypot(u, v);
    if (rad > 1) return null;

    // Domed pressure vessel.
    const n = sphereNormal(u * 0.92, v * 0.92) || [u, v, 0.1];
    const dome = [n[0] * 0.75, n[1] * 0.75, Math.max(0.25, n[2])];

    const grain = brushed(Math.atan2(v, u) / Math.PI, rad, 44, 18, 7);
    const patina = smoothstep(0.55, 0.95, fbm(u * 3.4 + 9, v * 3.4, 4, 21)) * smoothstep(0.35, 0.95, rad);
    let albedo = BRASS.map((b, i) => mix(b, BRASS_DARK[i], 0.25 + grain * 0.45));
    albedo = albedo.map((b, i) => mix(b, VERDIGRIS[i], patina * 0.55));

    let out = shade(albedo, dome, { metal: 1, rough: 0.24 + grain * 0.2 });

    // Rivet ring.
    const ringR = 0.78;
    const a = Math.atan2(v, u);
    const rivetPhase = (a / (Math.PI * 2)) * 12;
    const nearest = Math.round(rivetPhase);
    const dA = (rivetPhase - nearest) * (Math.PI * 2) * ringR;
    const dR = rad - ringR;
    const rd = Math.hypot(dA, dR) / 0.075;
    if (rd < 1.25) {
      // Note the clamp range: clamp01 here would erase the negative half of every
      // rivet's normal and bake them flat.
      const cl = (t) => Math.max(-1, Math.min(1, t));
      const rn = sphereNormal(cl(dA / 0.075) * 0.92, cl(dR / 0.075) * 0.92);
      if (rn) {
        const rivet = shade(BRASS.map((b) => b * 1.45), rn, { metal: 1, rough: 0.16 });
        const m = 1 - smoothstep(0.85, 1.15, rd);
        out = out.map((o, i) => mix(o, rivet[i], m));
      }
    }

    // Seam band + edge darkening.
    const seam = 1 - Math.exp(-Math.pow((rad - 0.62) * 26, 2)) * 0.5;
    for (let i = 0; i < 3; i++) out[i] *= seam;
    const edge = 1 - smoothstep(0.9, 1.0, rad) * 0.55;
    for (let i = 0; i < 3; i++) out[i] *= edge;

    return [out[0], out[1], out[2], 1 - smoothstep(0.985, 1, rad)];
  }, 2);

  ctx.putImageData(img, 0, 0);
  return { name: 'turret-body', canvas: c };
}

// Barrel is a separate sprite because it rotates independently of the body.
export function bakeTurretBarrel() {
  const W = 384, H = 160;
  const c = canvasOf(W, H);
  const ctx = c.getContext('2d');

  const img = makeImageSS(ctx, W, H, (px, py) => {
    const x = px / W;
    const v = (py - H / 2) / (H * 0.34);
    if (Math.abs(v) > 1) return null;
    if (x < 0.02 || x > 0.99) return null;

    // Cylinder normal across the barrel.
    const n = [0, v * 0.92, Math.sqrt(Math.max(0.02, 1 - v * v * 0.85))];
    const grain = brushed(x, v, 70, 30, 13);
    let albedo = BRASS.map((b, i) => mix(b, IRON[i], 0.42 + grain * 0.3));

    // Reinforcing bands.
    const bandPhase = Math.abs(Math.sin(x * Math.PI * 7));
    const band = smoothstep(0.86, 0.99, bandPhase);
    albedo = albedo.map((b, i) => mix(b, BRASS[i] * 1.25, band));
    const bn = [n[0], n[1] * (1 + band * 0.3), n[2]];

    let out = shade(albedo, bn, { metal: 1, rough: 0.3 - band * 0.12 + grain * 0.15 });

    // Muzzle glow and a dark bore at the tip.
    const muzzle = smoothstep(0.9, 1.0, x);
    for (let i = 0; i < 3; i++) out[i] = mix(out[i], [0.9, 0.42, 0.14][i] * 0.5, muzzle * 0.5);
    const taper = 1 - smoothstep(0.92, 1.0, Math.abs(v));
    return [out[0], out[1], out[2], taper];
  }, 2);

  ctx.putImageData(img, 0, 0);
  return { name: 'turret-barrel', canvas: c };
}

// ======================================================== lane furniture

export function bakeSleeper() {
  const W = 96, H = 176;
  const c = canvasOf(W, H);
  const ctx = c.getContext('2d');

  const img = makeImageSS(ctx, W, H, (px, py) => {
    const u = (px - W / 2) / (W * 0.34);
    const v = (py - H / 2) / (H * 0.46);
    if (Math.abs(u) > 1 || Math.abs(v) > 1) return null;

    const n = [u * 0.6, 0, Math.sqrt(Math.max(0.05, 1 - u * u * 0.36))];
    const grain = fbm(px * 0.14, py * 0.05, 3, 31);
    const albedo = IRON.map((b, i) => mix(b, IRON_DARK[i], 0.3 + grain * 0.55));
    const out = shade(albedo, n, { metal: 1, rough: 0.62 });

    const fade = (1 - smoothstep(0.72, 1.0, Math.abs(v))) * (1 - smoothstep(0.8, 1.0, Math.abs(u)));
    return [out[0], out[1], out[2], fade * 0.85];
  }, 2);

  ctx.putImageData(img, 0, 0);
  return { name: 'sleeper', canvas: c };
}

export function bakeGate() {
  const S = 256;
  const c = canvasOf(S, S);
  const ctx = c.getContext('2d');
  const R = S * 0.46;

  const img = makeImageSS(ctx, S, S, (px, py) => {
    const u = (px - S / 2) / R, v = (py - S / 2) / R;
    const rad = Math.hypot(u, v);
    if (rad > 1) return null;

    const a = Math.atan2(v, u);
    // Escapement teeth around a dark bore.
    const teeth = 0.5 + 0.5 * Math.cos(a * 14);
    const toothBand = smoothstep(0.52, 0.66, rad) * (1 - smoothstep(0.9, 1.0, rad));
    const h = toothBand * teeth;

    const n = [u * 0.55 - Math.cos(a) * h * 0.5, v * 0.55 - Math.sin(a) * h * 0.5, 0.85];
    const nl = Math.hypot(n[0], n[1], n[2]);
    const nn = [n[0] / nl, n[1] / nl, n[2] / nl];

    const grain = brushed(a / Math.PI, rad, 40, 14, 19);
    const albedo = BRASS.map((b, i) => mix(b, BRASS_DARK[i], 0.3 + grain * 0.4));
    let out = shade(albedo, nn, { metal: 1, rough: 0.3 });

    // Bore.
    const bore = 1 - smoothstep(0.3, 0.5, rad);
    for (let i = 0; i < 3; i++) out[i] = mix(out[i], 0.006, bore);

    return [out[0], out[1], out[2], 1 - smoothstep(0.98, 1, rad)];
  }, 2);

  ctx.putImageData(img, 0, 0);
  return { name: 'gate', canvas: c };
}

// Intake ring is baked WITHOUT its glow; the glow is drawn at runtime because it
// animates with the boiler needle and must land in the bloom pass.
export function bakeIntake() {
  const S = 320;
  const c = canvasOf(S, S);
  const ctx = c.getContext('2d');
  const R = S * 0.46;

  const img = makeImageSS(ctx, S, S, (px, py) => {
    const u = (px - S / 2) / R, v = (py - S / 2) / R;
    const rad = Math.hypot(u, v);
    if (rad > 1) return null;

    const a = Math.atan2(v, u);
    const housing = smoothstep(0.55, 0.62, rad);
    const bolts = 0.5 + 0.5 * Math.cos(a * 16);
    const boltBand = smoothstep(0.72, 0.80, rad) * (1 - smoothstep(0.88, 0.94, rad));

    const bulge = housing * 0.5 + boltBand * bolts * 0.45;
    const n = [u * bulge, v * bulge, 0.9];
    const nl = Math.hypot(n[0], n[1], n[2]);
    const nn = [n[0] / nl, n[1] / nl, n[2] / nl];

    const soot = smoothstep(0.3, 0.85, fbm(u * 4 + 2, v * 4 + 7, 4, 41));
    const grain = brushed(a / Math.PI, rad, 36, 12, 23);
    let albedo = BRASS.map((b, i) => mix(b, BRASS_DARK[i], 0.35 + grain * 0.4));
    albedo = albedo.map((b, i) => mix(b, IRON_DARK[i], soot * 0.65 * housing));

    let out = shade(albedo, nn, { metal: 1, rough: 0.34 + soot * 0.3 });

    // Throat: nearly black, so the runtime glow reads as coming from inside.
    const throat = 1 - smoothstep(0.42, 0.58, rad);
    for (let i = 0; i < 3; i++) out[i] = mix(out[i], 0.004, throat);

    return [out[0], out[1], out[2], 1 - smoothstep(0.98, 1, rad)];
  }, 2);

  ctx.putImageData(img, 0, 0);
  return { name: 'intake', canvas: c };
}

// ==================================================== grain and lane plate

// Tiling film grain. Applied at low opacity over the final frame; it hides banding
// in the dark gradients, which is most of what makes cheap 2D look cheap.
export function bakeGrain() {
  const S = 256;
  const c = canvasOf(S, S);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  const d = img.data;
  let x = 987654321;
  for (let i = 0; i < S * S; i++) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    const v = (x >>> 24);
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
    d[i * 4 + 3] = 26;
  }
  ctx.putImageData(img, 0, 0);
  return { name: 'grain', canvas: c };
}

// Tileable brushed-iron plate used for the track bed. Sampled as a pattern under
// the lane stroke, so the track has material instead of being a flat fill —
// while staying low-frequency enough to obey the §3.4 lane-band restraint rule.
export function bakePlate() {
  const S = 256;
  const c = canvasOf(S, S);
  const ctx = c.getContext('2d');

  const img = makeImage(ctx, S, S, (px, py) => {
    // Wrap-safe sampling: blend the tile against its own offset copy.
    const f = (x, y) => fbm(x * 0.035, y * 0.012, 4, 55);
    const wx = px / S, wy = py / S;
    const n =
      f(px, py) * (1 - wx) * (1 - wy) +
      f(px - S, py) * wx * (1 - wy) +
      f(px, py - S) * (1 - wx) * wy +
      f(px - S, py - S) * wx * wy;

    // Brightness matters more than realism here: this is the surface the balls sit
    // on, and the first bake came out near-black, which would have made the track
    // invisible against the backdrop.
    // Amplitude deliberately low: art gate G2 measures local luminance variance in
    // the ball corridor, and a livelier plate pushed it over the §3.4 ceiling. The
    // material still reads, because the eye picks up brushed direction at very low
    // contrast — it is the ball that needs the contrast budget, not the floor.
    const albedo = IRON.map((b, i) => mix(b * 1.15, IRON_DARK[i] * 1.0, 0.38 + n * 0.10));
    const nz = [(n - 0.5) * 0.10, (n - 0.5) * 0.05, 1];
    const nl = Math.hypot(nz[0], nz[1], nz[2]);
    const out = shade(albedo, [nz[0] / nl, nz[1] / nl, nz[2] / nl], { metal: 1, rough: 0.55 });
    return [out[0] * 1.1, out[1] * 1.1, out[2] * 1.1, 1];
  });

  ctx.putImageData(img, 0, 0);
  return { name: 'plate', canvas: c };
}

// ============================================================== backdrops
//
// One per chapter. Baked at 10% overscan so the renderer can parallax them without
// exposing an edge. Composition rule from §3.4: big low-frequency forms only, and
// contrast kept well below the balls — the backdrop's job is depth, not detail.

const CHAPTERS = [
  { key: 'boiler-deck',        tint: [0.42, 0.20, 0.10], glow: [1.0, 0.42, 0.14], motif: 'boiler' },
  { key: 'clockworks',         tint: [0.16, 0.20, 0.30], glow: [0.55, 0.72, 1.0], motif: 'gears' },
  { key: 'pneumatic-exchange', tint: [0.12, 0.24, 0.24], glow: [0.35, 0.9, 0.8],  motif: 'pipes' },
  { key: 'aether-observatory', tint: [0.22, 0.15, 0.34], glow: [0.72, 0.5, 1.0],  motif: 'orrery' },
  { key: 'airship-yards',      tint: [0.14, 0.19, 0.27], glow: [0.6, 0.75, 0.95], motif: 'gantry' },
  { key: 'spire-foundry',      tint: [0.40, 0.16, 0.10], glow: [1.0, 0.36, 0.10], motif: 'foundry' },
];

export function bakeBackdrop(index) {
  const ch = CHAPTERS[index];
  // Half the box resolution, with 10% overscan for parallax. These are entirely
  // low-frequency forms, so upscaling is invisible — and baking them at full size
  // cost 3 MB each for detail no one can see.
  const W = 880, H = 550;
  const c = canvasOf(W, H);
  const ctx = c.getContext('2d');

  const img = makeImage(ctx, W, H, (px, py) => {
    const x = px / W, y = py / H;

    // Depth gradient: darker at the edges, a faint warm floor bounce.
    let base = 0.030 + 0.055 * (1 - y) * 0.4;
    const out = [base * ch.tint[0] * 1.6, base * ch.tint[1] * 1.6, base * ch.tint[2] * 1.6];

    // Far structure: large silhouettes, very low contrast.
    const far = structure(x, y, ch.motif, 1.0, index);
    for (let i = 0; i < 3; i++) out[i] *= mix(1.0, 0.45, far);

    // Mid structure, slightly brighter rim-lit edges.
    const mid = structure(x * 1.6 + 0.3, y * 1.6 + 0.2, ch.motif, 0.55, index + 7);
    for (let i = 0; i < 3; i++) out[i] += mid * 0.012 * ch.glow[i];

    // Volumetric light shafts from the upper left.
    const shaft = Math.pow(clamp01(1 - Math.abs((x * 1.4 - y * 0.55) % 0.34 - 0.17) * 9), 3);
    const shaftFade = smoothstep(1.0, 0.15, y) * smoothstep(0.0, 0.45, x);
    for (let i = 0; i < 3; i++) out[i] += shaft * shaftFade * 0.028 * [1, 0.9, 0.75][i];

    // Gaslight pools.
    for (const [lx, ly, s] of [[0.16, 0.22, 0.30], [0.86, 0.34, 0.24], [0.5, 0.86, 0.4]]) {
      const d = Math.hypot((x - lx) * 1.6, y - ly) / s;
      const g = Math.exp(-d * d * 2.2);
      for (let i = 0; i < 3; i++) out[i] += g * 0.055 * ch.glow[i];
    }

    // Soot vignette. No per-pixel dust here: high-frequency noise is what makes a
    // PNG incompressible (3 MB per backdrop), and the runtime grain tile does the
    // same job for free.
    const vig = 1 - smoothstep(0.35, 1.05, Math.hypot((x - 0.5) * 1.25, (y - 0.5) * 1.35));
    for (let i = 0; i < 3; i++) out[i] *= mix(0.35, 1.0, vig);

    return [out[0], out[1], out[2], 1];
  });

  ctx.putImageData(img, 0, 0);
  return { name: `backdrop-${ch.key}`, canvas: c };
}

// Motif silhouettes. Returns 0..1 occupancy — deliberately soft-edged, because a
// crisp backdrop competes with the balls.
function structure(x, y, motif, scale, seed) {
  switch (motif) {
    case 'gears': {
      let v = 0;
      for (const [cx, cy, r, teeth] of [[0.2, 0.3, 0.26, 18], [0.78, 0.66, 0.34, 24], [0.55, 0.12, 0.18, 14]]) {
        const dx = (x - cx) / scale, dy = (y - cy) / scale;
        const rad = Math.hypot(dx, dy * 1.35);
        const a = Math.atan2(dy, dx);
        const toothed = r * (1 + 0.075 * Math.cos(a * teeth));
        v = Math.max(v, smoothstep(toothed + 0.02, toothed - 0.02, rad) * smoothstep(r * 0.35, r * 0.5, rad));
      }
      return v;
    }
    case 'pipes': {
      let v = 0;
      for (let i = 0; i < 5; i++) {
        const yy = 0.1 + i * 0.2;
        const bend = Math.sin(x * 5 + i) * 0.05;
        v = Math.max(v, Math.exp(-Math.pow((y - yy - bend) / (0.035 * scale), 2)));
      }
      return v;
    }
    case 'gantry': {
      const grid = Math.exp(-Math.pow(((x * 7) % 1 - 0.5) / 0.09, 2)) * smoothstep(0.05, 0.6, y);
      const beams = Math.exp(-Math.pow(((y * 5) % 1 - 0.5) / 0.07, 2));
      return clamp01(Math.max(grid, beams * 0.7) * scale);
    }
    case 'orrery': {
      let v = 0;
      for (let i = 1; i <= 4; i++) {
        const r = 0.12 * i * scale;
        const d = Math.abs(Math.hypot((x - 0.5) * 1.5, (y - 0.45) * 1.1) - r);
        v = Math.max(v, Math.exp(-Math.pow(d / 0.012, 2)));
      }
      return v;
    }
    case 'foundry': {
      const cauldron = smoothstep(0.42, 0.36, Math.hypot((x - 0.5) * 1.2, (y - 0.95) * 0.8));
      const chimneys = Math.exp(-Math.pow(((x * 4.5) % 1 - 0.5) / 0.13, 2)) * smoothstep(0.75, 0.2, y);
      return clamp01(Math.max(cauldron, chimneys * 0.8));
    }
    default: {
      // boiler: stacked cylindrical vessels
      let v = 0;
      for (const [cx, cy, rw, rh] of [[0.22, 0.62, 0.16, 0.3], [0.72, 0.5, 0.2, 0.36], [0.48, 0.82, 0.26, 0.2]]) {
        const d = Math.hypot((x - cx) / (rw * scale), (y - cy) / (rh * scale));
        v = Math.max(v, smoothstep(1.02, 0.96, d));
      }
      return v;
    }
  }
}

export const CHAPTER_KEYS = CHAPTERS.map((c) => c.key);

// ============================================================== the manifest

export function bakeAll(palette) {
  const out = [];
  for (const c of palette) out.push(bakeBall(c.hex, c.glyph));
  for (const [kind, hex] of Object.entries({
    fulminate: '#ff6b3d', arc: '#7fd4ff', reverse: '#9ad76b', governor: '#c9a0ff', sightline: '#ffe083',
  })) out.push(bakePowerupRing(kind, hex));
  out.push(bakeTurretBody(), bakeTurretBarrel(), bakeSleeper(), bakeGate(), bakeIntake(), bakeGrain(), bakePlate());
  for (let i = 0; i < CHAPTERS.length; i++) out.push(bakeBackdrop(i));
  return out;
}
