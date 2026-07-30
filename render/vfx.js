// Particle VFX — plan §3.4 corollary.
//
// Everything here draws with globalCompositeOperation = 'lighter'. That is a hard
// rule, not a style choice: steam and smoke are the theme's signature and its worst
// occlusion hazard, and a plume that hides a ball for four frames is a Sev-2 bug,
// not art. Additive marks can only ever brighten what is underneath, so a ball
// stays readable through them.

const MAX = 420;

export function createVfx() {
  return { parts: [], shake: 0 };
}

function emit(vfx, p) {
  if (vfx.parts.length >= MAX) vfx.parts.shift();
  vfx.parts.push(p);
}

export function feedEvents(vfx, events, opts = {}) {
  const reduceMotion = !!opts.reduceMotion;

  for (const e of events) {
    switch (e.type) {
      case 'pop': {
        const n = Math.min(26, 8 + e.count * 2);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + e.count;
          emit(vfx, {
            kind: 'spark',
            x: e.x, y: e.y,
            vx: Math.cos(a) * (90 + (i % 5) * 40),
            vy: Math.sin(a) * (90 + (i % 5) * 40),
            life: 1, decay: 1.7 + (i % 3) * 0.3,
            r: 3 + (i % 3), hue: e.comboStep > 1 ? 'combo' : 'hot',
          });
        }
        if (!reduceMotion) vfx.shake = Math.min(9, vfx.shake + 1.6 + e.count * 0.35);
        break;
      }
      case 'powerup':
        for (let i = 0; i < 22; i++) {
          const a = (i / 22) * Math.PI * 2;
          emit(vfx, {
            kind: 'ring', x: e.x, y: e.y,
            vx: Math.cos(a) * 230, vy: Math.sin(a) * 230,
            life: 1, decay: 1.2, r: 4, hue: 'power',
          });
        }
        if (!reduceMotion) vfx.shake = Math.min(12, vfx.shake + 4);
        break;

      case 'fire':
        // Exhaust vents at the turret, which sits clear of the track by
        // construction (genlanes places it for maximum clearance).
        for (let i = 0; i < 5; i++) {
          emit(vfx, {
            kind: 'steam', x: e.x || 0, y: e.y || 0,
            vx: (i - 2) * 22, vy: -40 - i * 10,
            life: 1, decay: 2.4, r: 7 + i * 2, hue: 'steam',
          });
        }
        break;

      case 'coin':
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2;
          emit(vfx, {
            kind: 'spark', x: e.x, y: e.y,
            vx: Math.cos(a) * 150, vy: Math.sin(a) * 150,
            life: 1, decay: 1.5, r: 3, hue: 'gold',
          });
        }
        break;
      default:
        break;
    }
  }
}

export function updateVfx(vfx, dt) {
  const parts = vfx.parts;
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= p.decay * dt;
    if (p.life <= 0) {
      parts.splice(i, 1);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.93;
    p.vy *= 0.93;
    if (p.kind === 'steam') p.vy -= 30 * dt;
  }
  vfx.shake = Math.max(0, vfx.shake - dt * 26);
}

const HUES = {
  hot: [255, 176, 82],
  combo: [255, 232, 150],
  power: [130, 220, 255],
  gold: [255, 206, 92],
  steam: [150, 170, 180],
};

export function drawVfx(ctx, vfx) {
  if (!vfx.parts.length) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of vfx.parts) {
    const [r, g, b] = HUES[p.hue] || HUES.hot;
    const alpha = p.kind === 'steam' ? p.life * 0.16 : p.life * 0.85;
    const radius = p.kind === 'steam' ? p.r * (2.2 - p.life) : p.r * p.life;
    ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.5, radius), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
