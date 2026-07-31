// Post-processing: bloom, vignette, grain.
//
// Bloom is the single biggest "does this look shipped" lever available in 2D, and
// it is done properly here rather than by drawing bigger translucent circles: the
// frame maintains a separate EMISSIVE buffer (furnace throat, sparks, powerup
// rings, gauge fill, muzzle flash), which is downsampled, blurred and added back.
// Only things that actually emit light bloom, so the effect reads as light rather
// than as haze.
//
// Everything here is resolution-independent and runs at quarter resolution, which
// keeps it affordable inside the Deck's 11.1ms budget at 90Hz.

const BLOOM_DIV = 4;

export function createPost() {
  return {
    emissive: document.createElement('canvas'),
    small: document.createElement('canvas'),
    small2: document.createElement('canvas'),
    w: 0,
    h: 0,
    blurSupported: null,
  };
}

export function resizePost(post, w, h) {
  if (post.w === w && post.h === h) return;
  post.w = w;
  post.h = h;
  post.emissive.width = w;
  post.emissive.height = h;
  post.small.width = Math.max(1, Math.floor(w / BLOOM_DIV));
  post.small.height = Math.max(1, Math.floor(h / BLOOM_DIV));
  post.small2.width = post.small.width;
  post.small2.height = post.small.height;

  if (post.blurSupported === null) {
    const probe = post.small.getContext('2d');
    probe.filter = 'blur(2px)';
    // Safari shipped canvas filters late; if unsupported the assignment silently
    // does not take, and we fall back to an iterative box blur.
    post.blurSupported = probe.filter !== 'none';
    probe.filter = 'none';
  }
}

export function beginEmissive(post) {
  const ctx = post.emissive.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, post.w, post.h);
  return ctx;
}

export function drawBloom(ctx, post, strength = 1) {
  const sw = post.small.width;
  const sh = post.small.height;
  const s1 = post.small.getContext('2d');
  const s2 = post.small2.getContext('2d');

  s1.setTransform(1, 0, 0, 1, 0, 0);
  s1.clearRect(0, 0, sw, sh);
  s1.drawImage(post.emissive, 0, 0, sw, sh);

  if (post.blurSupported) {
    s2.setTransform(1, 0, 0, 1, 0, 0);
    s2.clearRect(0, 0, sw, sh);
    s2.filter = `blur(${Math.max(2, sw * 0.012)}px)`;
    s2.drawImage(post.small, 0, 0);
    s2.filter = 'none';
  } else {
    // Fallback: two passes of offset accumulation approximate a gaussian well
    // enough at quarter resolution.
    s2.setTransform(1, 0, 0, 1, 0, 0);
    s2.clearRect(0, 0, sw, sh);
    s2.globalAlpha = 0.2;
    for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-1, -1], [1, 1], [-1, 1], [1, -1]]) {
      s2.drawImage(post.small, dx, dy);
    }
    s2.globalAlpha = 1;
  }

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  // One upscale pass. A second wider tap looked marginally softer and cost a
  // second full-screen additive blit, which is not a trade the Deck's 11.1ms
  // budget can justify.
  ctx.globalAlpha = 1.05 * strength;
  ctx.drawImage(post.small2, 0, 0, post.w, post.h);
  ctx.restore();
}

let vignetteCache = null;

export function drawVignette(ctx, w, h, intensity = 0.85) {
  if (!vignetteCache || vignetteCache.w !== w || vignetteCache.h !== h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const cc = c.getContext('2d');
    const g = cc.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.28, w / 2, h / 2, Math.hypot(w, h) * 0.62);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.62, 'rgba(0,0,0,0.22)');
    g.addColorStop(1, 'rgba(0,0,0,0.78)');
    cc.fillStyle = g;
    cc.fillRect(0, 0, w, h);
    vignetteCache = { c, w, h };
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = intensity;
  ctx.drawImage(vignetteCache.c, 0, 0);
  ctx.restore();
}

// Grain hides banding in the dark gradients, which is most of what makes cheap 2D
// read as cheap. Offset per frame so it shimmers rather than looking like dirt.
let grainPattern = null;
let grainSource = null;

export function drawGrain(ctx, grainImg, w, h, time, opacity = 0.05) {
  if (!grainImg) return;
  // Rebuilding the pattern every frame showed up as real cost on the software
  // rasteriser; it only ever needs building once per image.
  if (grainSource !== grainImg) {
    grainPattern = ctx.createPattern(grainImg, 'repeat');
    grainSource = grainImg;
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = opacity;
  ctx.globalCompositeOperation = 'overlay';
  const ox = ((time * 220) | 0) % grainImg.width;
  const oy = ((time * 310) | 0) % grainImg.height;
  ctx.translate(-ox, -oy);
  ctx.fillStyle = grainPattern;
  ctx.fillRect(0, 0, w + grainImg.width, h + grainImg.height);
  ctx.restore();
}
