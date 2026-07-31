// Per-pixel shading library for the asset bakers.
//
// This is AUTHORING code, not runtime code. It runs once in tools/bake.mjs and
// writes PNGs; the game never imports it. That separation is the point: expensive,
// physically-motivated shading happens offline at 8x the pixel density anything
// ships at, and the game just blits the result.
//
// Lighting rig (fixed across every asset so they read as one scene):
//   KEY   warm gaslight from upper-left, slightly in front
//   FILL  cool bounce from lower-right
//   RIM   cold backlight to separate silhouettes from a dark backdrop
//   ENV   a fake studio environment sampled by the reflection vector — a bright
//         sky band above the horizon, dark iron below, and a warm furnace glow
//         low-right. This is what makes glass and brass look photographed rather
//         than gradient-filled.

export const KEY = norm([-0.46, -0.68, 0.57]);
export const FILL = norm([0.55, 0.42, 0.72]);
export const RIM = norm([0.25, -0.45, -0.85]);

export const KEY_COLOR = [1.0, 0.92, 0.78];
export const FILL_COLOR = [0.42, 0.52, 0.68];
export const RIM_COLOR = [0.62, 0.78, 0.95];

function norm(v) {
  const m = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / m, v[1] / m, v[2] / m];
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const mix = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

// ------------------------------------------------------------------- colour

export function hexToLinear(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
}
export const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
export const linearToSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(clamp01(c), 1 / 2.4) - 0.055);

// Soft-knee tonemap: linear through the mid-tones, compressing only the highlights.
//
// This started as the usual ACES-style filmic curve, which looked good on a single
// object and was quietly catastrophic for the palette. Because it compresses every
// channel independently and starts compressing early, saturated colours desaturate
// toward grey — measured, an optimised palette with worst-case separation of
// deltaE 34 arrived on screen at deltaE 5, and a near-neutral pewter (#807864)
// rendered LIGHTER than its own albedo (#b0a992). Highlights still need a roll-off,
// but mid-tones — which is where a ball's face lives — must stay linear.
const KNEE = 0.78;
export function tonemap(c) {
  if (c <= KNEE) return clamp01(c);
  return clamp01(KNEE + (1 - Math.exp(-(c - KNEE) * 2.2)) * (1 - KNEE));
}

export const toByte = (linear) => Math.round(clamp01(linearToSrgb(tonemap(linear))) * 255);

// -------------------------------------------------------------------- noise

function hash2(x, y, seed = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function valueNoise(x, y, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return mix(mix(a, b, u), mix(c, d, u), v);
}

export function fbm(x, y, octaves = 4, seed = 0) {
  let sum = 0, amp = 0.5, freq = 1;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * freq, y * freq, seed + i * 17) * amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum;
}

// Anisotropic streaks — brushed metal. Sampling noise with a squashed axis is the
// whole trick; the ratio controls how "spun" versus "brushed" the surface reads.
export function brushed(u, v, scale = 90, anisotropy = 26, seed = 3) {
  return fbm(u * scale, v * (scale / anisotropy), 3, seed);
}

// ------------------------------------------------------------------ surfaces

// Environment probe: returns linear RGB for a reflection direction.
export function envSample(r) {
  const y = r[1];
  // Sky band above, iron below, warm furnace bounce low and to the right.
  const sky = smoothstep(0.05, -0.85, y);
  const floor = smoothstep(0.1, 0.9, y);
  const furnace = smoothstep(0.2, 0.95, y) * smoothstep(-0.4, 0.7, r[0]);

  const out = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    out[i] =
      sky * [0.55, 0.68, 0.9][i] * 1.15 +
      floor * [0.05, 0.045, 0.04][i] +
      furnace * [0.85, 0.34, 0.09][i] * 0.75;
  }
  // A hard highlight streak where the "window" is — gives glass a crisp catchlight.
  const streak = Math.pow(clamp01(1 - Math.abs(y + 0.62) * 5.5), 6) * clamp01(1 - Math.abs(r[0] + 0.3) * 2.2);
  for (let i = 0; i < 3; i++) out[i] += streak * 2.6 * [1, 0.97, 0.9][i];
  return out;
}

function reflect(n, l) {
  const d = 2 * dot(n, l);
  return [d * n[0] - l[0], d * n[1] - l[1], d * n[2] - l[2]];
}

export const fresnel = (nDotV, f0 = 0.04) => f0 + (1 - f0) * Math.pow(1 - clamp01(nDotV), 5);

// Full lighting evaluation for a surface point.
//   albedo     linear RGB
//   n          unit normal
//   opts.metal 0 dielectric .. 1 metal
//   opts.rough 0 mirror .. 1 diffuse
export function shade(albedo, n, opts = {}) {
  const metal = opts.metal ?? 0;
  const rough = opts.rough ?? 0.4;
  const ao = opts.ao ?? 1;
  // Environment reflection is an ADDITIVE, colour-independent term, so on a
  // coloured dielectric it pulls every hue toward the same point. Metals want it at
  // full strength (it is most of what makes brass look like brass); the ball glass
  // needs it dialled back or the palette separation measured by art gate G3 dies on
  // the way to the screen.
  const envScale = opts.envScale ?? 1;
  const V = [0, 0, 1];
  const nDotV = clamp01(dot(n, V));
  const shininess = Math.pow(2, mix(11, 3, rough));

  const out = [0, 0, 0];

  for (const [L, C, power] of [[KEY, KEY_COLOR, 1.35], [FILL, FILL_COLOR, 0.5], [RIM, RIM_COLOR, 0.9]]) {
    const nDotL = dot(n, L);
    if (nDotL <= 0) continue;
    const R = reflect(n, L);
    const spec = Math.pow(clamp01(dot(R, V)), shininess) * (1 - rough * 0.75);
    for (let i = 0; i < 3; i++) {
      out[i] += albedo[i] * nDotL * power * C[i] * (1 - metal * 0.82) * ao;
      out[i] += spec * power * C[i] * mix(0.25, 1.0, metal) * (metal ? albedo[i] : 1);
    }
  }

  // Environment: metals reflect tinted, dielectrics get a fresnel-weighted sheen.
  const R = reflect(n, V);
  const env = envSample(R);
  const f = fresnel(nDotV, metal ? 0.6 : 0.045) * (1 - rough * 0.55);
  for (let i = 0; i < 3; i++) {
    out[i] += env[i] * (metal ? albedo[i] * (0.55 + f) : f * envScale) * ao;
    out[i] += albedo[i] * 0.055 * ao * (1 - metal * 0.6); // ambient floor
  }

  return out;
}

// ------------------------------------------------------------------- helpers

export function makeImage(ctx, w, h, shadeFn) {
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = shadeFn(x + 0.5, y + 0.5);
      const i = (y * w + x) * 4;
      if (!px) {
        d[i + 3] = 0;
        continue;
      }
      d[i] = toByte(px[0]);
      d[i + 1] = toByte(px[1]);
      d[i + 2] = toByte(px[2]);
      d[i + 3] = Math.round(clamp01(px[3] ?? 1) * 255);
    }
  }
  return img;
}

// 4x supersampled variant for edges that must not alias — spheres, mostly.
export function makeImageSS(ctx, w, h, shadeFn, ss = 2) {
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const inv = 1 / (ss * ss);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const px = shadeFn(x + (sx + 0.5) / ss, y + (sy + 0.5) / ss);
          if (!px) continue;
          const pa = px[3] ?? 1;
          r += px[0] * pa;
          g += px[1] * pa;
          b += px[2] * pa;
          a += pa;
        }
      }
      const i = (y * w + x) * 4;
      if (a <= 0) {
        d[i + 3] = 0;
        continue;
      }
      // Premultiplied average, then unpremultiply, so edges don't darken.
      d[i] = toByte((r * inv) / (a * inv));
      d[i + 1] = toByte((g * inv) / (a * inv));
      d[i + 2] = toByte((b * inv) / (a * inv));
      d[i + 3] = Math.round(clamp01(a * inv) * 255);
    }
  }
  return img;
}

export function sphereNormal(u, v) {
  const d2 = u * u + v * v;
  if (d2 > 1) return null;
  return [u, v, Math.sqrt(1 - d2)];
}
