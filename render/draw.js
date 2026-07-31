// Frame composition — The Ascendant Works.
//
// Reads sim state, owns interpolation and every visual decision; never writes to
// sim state (plan §3.1).
//
// Pipeline per frame:
//   1. blit the pre-composited static level layer (backdrop + track + furniture)
//   2. dynamic pass — shadows, balls, shots, turret, coins, VFX
//      ...simultaneously accumulating anything that EMITS light into a separate
//      emissive buffer
//   3. bloom the emissive buffer back over the frame
//   4. chrome and HUD (never bloomed — UI must stay crisp)
//   5. vignette and grain
//
// The §3.4 zonal restraint rule is structural rather than remembered: the track is
// an opaque textured plate composited over the backdrop in staticlayer.js, so no
// backdrop detail can sit behind a ball, and every high-frequency flourish lives in
// drawChrome() which only paints outside the 16:10 box.

import { pointAt } from '../sim/lane.js';
import { drawVfx } from './vfx.js';
import { gaugeFraction, pressureFraction } from '../sim/sim.js';
import { asset, ballFor, powerupFor } from './assets.js';
import { resizePost, beginEmissive, drawBloom, drawVignette, drawGrain } from './post.js';

const BRASS = '#b98a3c';
const BRASS_LIT = '#e8c887';
const BRASS_DIM = '#6d5326';
const VERDIGRIS = '#3f7d6e';
const EMBER = '#ff8c3a';

// Baked sphere occupies 92% of its sprite; see art/bakers.js.
const SPRITE_SPAN = 0.92;
const ballDrawSize = (R) => (2 * R) / SPRITE_SPAN;

// ---------------------------------------------------------------- dynamic pass

// Contact shadows. Balls sitting in a channel with no shadow read as stickers; a
// soft offset ellipse under each one is what seats them in the track.
function drawShadows(ctx, game, positions) {
  const R = game.T.ballRadius;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  for (let ci = 0; ci < positions.length; ci++) {
    for (const p of positions[ci]) {
      ctx.beginPath();
      ctx.ellipse(p.x + R * 0.20, p.y + R * 0.26, R * 0.94, R * 0.80, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// Interpolated world positions for every visible ball, computed once and reused by
// the shadow, ball and lighting passes.
function visiblePositions(game, alpha, prevDist) {
  const R = game.T.ballRadius;
  const out = [];
  for (let ci = 0; ci < game.state.chains.length; ci++) {
    const balls = game.state.chains[ci].balls;
    const lane = game.geom[ci];
    const list = [];
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      if (b.dist < -R) continue;
      const prev = prevDist.get(b.id);
      const d = prev === undefined ? b.dist : prev + (b.dist - prev) * alpha;
      const p = pointAt(lane, d, { x: 0, y: 0 });
      list.push({ x: p.x, y: p.y, ball: b });
    }
    out.push(list);
  }
  return out;
}

function drawBalls(ctx, emis, game, palette, positions, time) {
  const R = game.T.ballRadius;
  const size = ballDrawSize(R);
  const half = size / 2;

  // Cheap dynamic lighting: the furnace throat is a warm key light, so balls
  // approaching it pick up its glow. It costs one additive draw for the few balls
  // actually near the intake, and it makes the threat legible at a glance.
  const intakes = game.geom.map((lane) => pointAt(lane, lane.length, { x: 0, y: 0 }));
  const reach = R * 9;

  for (let ci = 0; ci < positions.length; ci++) {
    const intake = intakes[ci];
    for (const p of positions[ci]) {
      const c = palette[p.ball.color] || palette[0];
      const img = ballFor(c.glyph);
      if (img) ctx.drawImage(img, p.x - half, p.y - half, size, size);

      const d = Math.hypot(p.x - intake.x, p.y - intake.y);
      if (d < reach) {
        const k = Math.pow(1 - d / reach, 2.2);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = k * 0.6;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, R * 1.1);
        g.addColorStop(0, 'rgba(255,150,60,0.9)');
        g.addColorStop(1, 'rgba(255,90,20,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, R * 1.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      if (p.ball.powerup) {
        const ring = powerupFor(p.ball.powerup);
        if (ring) {
          const pulse = 0.6 + 0.4 * Math.sin(time * 5 + p.ball.id);
          for (const target of [ctx, emis]) {
            if (!target) continue;
            target.save();
            target.globalCompositeOperation = 'lighter';
            target.globalAlpha = pulse;
            target.drawImage(ring, p.x - half, p.y - half, size, size);
            target.restore();
          }
        }
      }
    }
  }
}

function drawIntakeGlow(ctx, emis, game, time) {
  const R = game.T.ballRadius;
  const threat = pressureFraction(game);

  for (let ci = 0; ci < game.geom.length; ci++) {
    const lane = game.geom[ci];
    const p = pointAt(lane, lane.length, { x: 0, y: 0 });
    const flicker = 0.88 + 0.12 * Math.sin(time * 11 + ci) * Math.sin(time * 7.3);
    const radius = R * (2.2 + threat * 1.6);

    for (const target of [ctx, emis]) {
      if (!target) continue;
      target.save();
      target.globalCompositeOperation = 'lighter';
      const g = target.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
      const i = (0.42 + threat * 0.78) * flicker;
      g.addColorStop(0, `rgba(255,170,80,${i})`);
      g.addColorStop(0.45, `rgba(255,96,26,${i * 0.55})`);
      g.addColorStop(1, 'rgba(255,60,10,0)');
      target.fillStyle = g;
      target.beginPath();
      target.arc(p.x, p.y, radius, 0, Math.PI * 2);
      target.fill();
      target.restore();
    }

    // Boiler needle: the loss tell (§0.3). Drawn last so it stays legible on top
    // of its own glow.
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.strokeStyle = 'rgba(255,255,255,0.20)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, R * 2.0, Math.PI * 0.75, Math.PI * 0.75 + Math.PI * 1.5);
    ctx.stroke();
    ctx.strokeStyle = '#d0402c';
    ctx.beginPath();
    ctx.arc(0, 0, R * 2.0, Math.PI * 0.75 + Math.PI * 1.2, Math.PI * 0.75 + Math.PI * 1.5);
    ctx.stroke();

    const a = Math.PI * 0.75 + Math.PI * 1.5 * threat;
    ctx.strokeStyle = threat > 0.8 ? '#ff5a3c' : BRASS_LIT;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * R * 1.9, Math.sin(a) * R * 1.9);
    ctx.stroke();
    ctx.fillStyle = BRASS;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawTurret(ctx, emis, game, palette, time) {
  const s = game.state;
  const [x, y] = game.level.shooter;
  const R = game.T.ballRadius;
  const a = s.turret.angle;
  const body = asset('turret-body');
  const barrel = asset('turret-barrel');

  // Barrel under the body so the housing overlaps its root. It has to extend well
  // clear of the housing: at the first sizing the body covered all but a stub and
  // the turret read as a featureless lump with no aim direction — which is the one
  // thing this silhouette exists to communicate.
  if (barrel) {
    const len = R * 5.4;
    const h = (barrel.height / barrel.width) * len;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(len * 0.55, h * 0.34, len * 0.42, h * 0.30, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.drawImage(barrel, -R * 0.5, -h / 2, len, h);
    ctx.restore();
  }

  if (body) {
    const size = R * 4.1;
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(x + R * 0.3, y + R * 0.4, size * 0.5, size * 0.44, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.drawImage(body, x - size / 2, y - size / 2, size, size);
  }

  // Chambered next shot behind a glass breech.
  const nextC = palette[s.turret.next] || palette[0];
  const nextImg = ballFor(nextC.glyph);
  const bx = x - Math.cos(a) * R * 1.35;
  const by = y - Math.sin(a) * R * 1.35;
  ctx.save();
  ctx.fillStyle = 'rgba(8,10,11,0.9)';
  ctx.beginPath();
  ctx.arc(bx, by, R * 0.82, 0, Math.PI * 2);
  ctx.fill();
  if (nextImg) {
    const ns = ballDrawSize(R * 0.6);
    ctx.drawImage(nextImg, bx - ns / 2, by - ns / 2, ns, ns);
  }
  ctx.strokeStyle = 'rgba(232,200,135,0.75)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(bx, by, R * 0.82, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Loaded globe at the muzzle, plus a muzzle ember that feeds the bloom.
  const cur = palette[s.turret.current] || palette[0];
  const curImg = ballFor(cur.glyph);
  const mx = x + Math.cos(a) * R * 2.6;
  const my = y + Math.sin(a) * R * 2.6;

  const heat = Math.max(0, 1 - s.turret.cooldown / Math.max(1, game.T.fireCooldownTicks));
  for (const target of [ctx, emis]) {
    if (!target) continue;
    target.save();
    target.globalCompositeOperation = 'lighter';
    target.globalAlpha = 0.35 + (1 - heat) * 0.65;
    const g = target.createRadialGradient(mx, my, 0, mx, my, R * 1.8);
    g.addColorStop(0, 'rgba(255,190,110,0.65)');
    g.addColorStop(1, 'rgba(255,120,40,0)');
    target.fillStyle = g;
    target.beginPath();
    target.arc(mx, my, R * 1.8, 0, Math.PI * 2);
    target.fill();
    target.restore();
  }

  if (curImg) {
    const size = ballDrawSize(R);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(mx + R * 0.2, my + R * 0.26, R * 0.94, R * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.drawImage(curImg, mx - size / 2, my - size / 2, size, size);
  }
}

function drawShots(ctx, emis, game, palette) {
  const R = game.T.ballRadius;
  const size = ballDrawSize(R);
  for (const shot of game.state.shots) {
    const c = palette[shot.color] || palette[0];
    const img = ballFor(c.glyph);

    // Motion streak behind the shot — reads as speed without motion blur.
    const m = Math.hypot(shot.vx, shot.vy) || 1;
    const ux = shot.vx / m;
    const uy = shot.vy / m;
    for (const target of [ctx, emis]) {
      if (!target) continue;
      target.save();
      target.globalCompositeOperation = 'lighter';
      const g = target.createLinearGradient(shot.x - ux * R * 3.4, shot.y - uy * R * 3.4, shot.x, shot.y);
      g.addColorStop(0, 'rgba(255,190,120,0)');
      g.addColorStop(1, 'rgba(255,205,140,0.4)');
      target.strokeStyle = g;
      target.lineWidth = R * 0.9;
      target.lineCap = 'round';
      target.beginPath();
      target.moveTo(shot.x - ux * R * 3.4, shot.y - uy * R * 3.4);
      target.lineTo(shot.x, shot.y);
      target.stroke();
      target.restore();
    }

    if (img) ctx.drawImage(img, shot.x - size / 2, shot.y - size / 2, size, size);
  }
}

function drawCoins(ctx, emis, game, time) {
  const R = game.T.coinRadius;
  for (const coin of game.state.coins) {
    const wobble = Math.abs(Math.cos(time * 2.2 + coin.id));
    ctx.save();
    ctx.translate(coin.x, coin.y);
    ctx.scale(0.3 + wobble * 0.7, 1);
    const g = ctx.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.1, 0, 0, R);
    g.addColorStop(0, '#fff3c4');
    g.addColorStop(0.55, '#f0c14b');
    g.addColorStop(1, '#8a6a1e');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5e4713';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();

    if (emis && wobble > 0.75) {
      emis.save();
      emis.globalCompositeOperation = 'lighter';
      emis.globalAlpha = (wobble - 0.75) * 3;
      const g2 = emis.createRadialGradient(coin.x, coin.y, 0, coin.x, coin.y, R * 2.4);
      g2.addColorStop(0, 'rgba(255,225,140,0.7)');
      g2.addColorStop(1, 'rgba(255,200,80,0)');
      emis.fillStyle = g2;
      emis.beginPath();
      emis.arc(coin.x, coin.y, R * 2.4, 0, Math.PI * 2);
      emis.fill();
      emis.restore();
    }
  }
}

function drawSightline(ctx, game) {
  const s = game.state;
  if (s.sightlineTicks <= 0) return;
  const [x, y] = game.level.shooter;
  const a = s.turret.angle;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = 'rgba(255,224,131,0.32)';
  ctx.setLineDash([14, 12]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + Math.cos(a) * game.T.ballRadius * 3, y + Math.sin(a) * game.T.ballRadius * 3);
  ctx.lineTo(x + Math.cos(a) * 2600, y + Math.sin(a) * 2600);
  ctx.stroke();
  ctx.restore();
}

// --------------------------------------------------------------------- chrome

export function drawChrome(ctx, fit) {
  ctx.save();
  ctx.strokeStyle = BRASS_DIM;
  ctx.lineWidth = Math.max(3, fit.scale * 7);
  ctx.strokeRect(fit.x, fit.y, fit.w, fit.h);
  ctx.strokeStyle = 'rgba(232,200,135,0.35)';
  ctx.lineWidth = Math.max(1, fit.scale * 2);
  ctx.strokeRect(fit.x + 2, fit.y + 2, fit.w - 4, fit.h - 4);

  const step = Math.max(28, fit.w / 26);
  ctx.fillStyle = 'rgba(232,200,135,0.5)';
  const rivet = (x, y) => {
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();
  };
  for (let x = fit.x + step / 2; x < fit.x + fit.w; x += step) {
    rivet(x, fit.y + 5);
    rivet(x, fit.y + fit.h - 5);
  }
  for (let y = fit.y + step / 2; y < fit.y + fit.h; y += step) {
    rivet(fit.x + 5, y);
    rivet(fit.x + fit.w - 5, y);
  }
  ctx.restore();
}

// ------------------------------------------------------------------------ HUD
// Placed into whichever slack the device gives us (§3.5): the top band on a 4:3
// iPad, side columns on a 19.5:9 iPhone, an overlay strip on a 16:10 Deck.

export function hudLayout(fit) {
  if (fit.slackY >= 96) return 'band';
  if (fit.slackX >= 260) return 'columns';
  return 'overlay';
}

export function drawHud(ctx, game, fit, opts = {}) {
  const s = game.state;
  const mode = hudLayout(fit);
  const pad = 14;
  const scale = Math.max(0.75, Math.min(1.5, fit.w / 1100));
  const fs = (n) => `${Math.round(n * scale)}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;

  let box;
  if (mode === 'band') {
    box = { x: fit.x, y: Math.max(4, fit.y - fit.slackY / 2 - 26 * scale), w: fit.w, h: 56 * scale, vertical: false };
  } else if (mode === 'columns') {
    box = { x: pad, y: fit.y, w: Math.min(240, fit.slackX / 2 - pad * 2), h: fit.h, vertical: true };
  } else {
    box = { x: fit.x, y: fit.y, w: fit.w, h: 46 * scale, vertical: false, overlay: true };
  }

  ctx.save();
  if (box.overlay) {
    const g = ctx.createLinearGradient(0, box.y, 0, box.y + box.h);
    g.addColorStop(0, 'rgba(8,10,12,0.86)');
    g.addColorStop(1, 'rgba(8,10,12,0.30)');
    ctx.fillStyle = g;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.strokeStyle = 'rgba(185,138,60,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(box.x, box.y + box.h);
    ctx.lineTo(box.x + box.w, box.y + box.h);
    ctx.stroke();
  }

  ctx.textBaseline = 'middle';
  const midY = box.vertical ? box.y + 26 * scale : box.y + box.h / 2;

  ctx.fillStyle = BRASS_LIT;
  ctx.font = fs(20);
  ctx.textAlign = 'left';
  ctx.fillText(String(s.score).padStart(7, '0'), box.x + pad, midY);

  ctx.fillStyle = 'rgba(232,200,135,0.65)';
  ctx.font = fs(12);
  ctx.fillText(`${game.level.chapterName.toUpperCase()} — ${game.level.name}`, box.x + pad, midY + 20 * scale);

  ctx.textAlign = 'right';
  ctx.fillStyle = BRASS_LIT;
  ctx.font = fs(14);
  ctx.fillText(`◈ ${s.lives}`, box.x + box.w - pad, midY);

  const gw = box.vertical ? box.w - pad * 2 : Math.min(300 * scale, box.w * 0.34);
  const gx = box.vertical ? box.x + pad : box.x + box.w / 2 - gw / 2;
  const gy = box.vertical ? midY + 52 * scale : midY - 7 * scale;
  const gh = 14 * scale;

  ctx.fillStyle = '#0e1113';
  ctx.fillRect(gx, gy, gw, gh);
  const frac = isFinite(s.gaugeTarget) ? gaugeFraction(game) : 0;
  const grad = ctx.createLinearGradient(gx, 0, gx + gw, 0);
  grad.addColorStop(0, VERDIGRIS);
  grad.addColorStop(1, BRASS_LIT);
  ctx.fillStyle = grad;
  ctx.fillRect(gx, gy, gw * frac, gh);
  ctx.strokeStyle = BRASS_DIM;
  ctx.lineWidth = 2;
  ctx.strokeRect(gx, gy, gw, gh);
  for (let i = 1; i < 10; i++) {
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(gx + (gw * i) / 10, gy, 1, gh);
  }

  const badges = [];
  if (s.governorTicks > 0) badges.push(['GOVERNOR', '#c9a0ff']);
  if (s.reverseTicks > 0) badges.push(['REVERSE', '#9ad76b']);
  if (s.sightlineTicks > 0) badges.push(['SIGHTLINE', '#ffe083']);
  ctx.font = fs(11);
  ctx.textAlign = 'left';
  badges.forEach(([label, colour], i) => {
    const bx = box.vertical ? box.x + pad : gx + gw + 16;
    const by = box.vertical ? gy + 28 * scale + i * 16 * scale : midY - 8 * scale + i * 14 * scale;
    ctx.fillStyle = colour;
    ctx.fillText(label, bx, by);
  });
  ctx.restore();

  if (s.callout) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = Math.min(1, s.calloutTicks / 30);
    ctx.font = `${Math.round(46 * scale)}px ui-monospace, Menlo, monospace`;
    ctx.shadowColor = 'rgba(255,120,40,0.9)';
    ctx.shadowBlur = 24 * scale;
    ctx.fillStyle = EMBER;
    ctx.fillText(s.callout, fit.x + fit.w / 2, fit.y + fit.h * 0.22);
    ctx.restore();
  }

  if (opts.debug) drawDebugOverlay(ctx, game, fit, scale);
}

function drawDebugOverlay(ctx, game, fit, scale) {
  const s = game.state;
  const lines = [
    `tick ${s.tick}  ${s.mode}`,
    `balls ${s.chains.reduce((n, c) => n + c.balls.length, 0)}  shots ${s.shots.length}`,
    `destroyed ${s.destroyed}/${isFinite(s.gaugeTarget) ? s.gaugeTarget : '∞'}`,
    `pressure ${(pressureFraction(game) * 100).toFixed(0)}%`,
    `combo ${s.chains.map((c) => c.comboStep).join(',')}`,
    `fit ${fit.viewW}x${fit.viewH} aspect ${fit.aspect.toFixed(2)} hud ${hudLayout(fit)}`,
  ];
  ctx.save();
  ctx.font = `${Math.round(11 * scale)}px ui-monospace, monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(fit.x + 6, fit.y + 6, 250 * scale, lines.length * 14 * scale + 8);
  ctx.fillStyle = '#7fd4ff';
  lines.forEach((l, i) => ctx.fillText(l, fit.x + 12, fit.y + 12 + i * 14 * scale));
  ctx.restore();
}

// ------------------------------------------------------------------ full frame

export function drawFrame(ctx, game, fit, ui) {
  const { palette, staticLayer, vfx, alpha, prevDist, time, debug, post, dpr = 1, quality = {} } = ui;

  const pxW = Math.round(fit.viewW * dpr);
  const pxH = Math.round(fit.viewH * dpr);
  resizePost(post, pxW, pxH);
  const emis = quality.bloom === false ? null : beginEmissive(post);

  ctx.fillStyle = '#07080a';
  ctx.fillRect(0, 0, fit.viewW, fit.viewH);

  const shake = vfx.shake;
  const sx = shake ? (((time * 91) % 2) - 1) * shake : 0;
  const sy = shake ? (((time * 57) % 2) - 1) * shake : 0;

  // Both the visible frame and the emissive buffer use the same world transform;
  // the emissive one additionally carries the device-pixel ratio.
  const applyWorld = (target, scaleExtra = 1) => {
    target.setTransform(scaleExtra, 0, 0, scaleExtra, 0, 0);
    target.translate(fit.x + sx, fit.y + sy);
    target.scale(fit.scale, fit.scale);
  };

  ctx.save();
  ctx.translate(fit.x + sx, fit.y + sy);
  ctx.scale(fit.scale, fit.scale);
  ctx.beginPath();
  ctx.rect(0, 0, game.level.box[0], game.level.box[1]);
  ctx.clip();

  if (emis) {
    emis.save();
    applyWorld(emis, dpr);
    emis.beginPath();
    emis.rect(0, 0, game.level.box[0], game.level.box[1]);
    emis.clip();
  }

  if (staticLayer) {
    ctx.drawImage(staticLayer.canvas, 0, 0, staticLayer.w, staticLayer.h);
  }

  const positions = visiblePositions(game, alpha, prevDist);

  drawIntakeGlow(ctx, emis, game, time);
  drawCoins(ctx, emis, game, time);
  drawSightline(ctx, game);
  drawShadows(ctx, game, positions);
  drawBalls(ctx, emis, game, palette, positions, time);
  drawShots(ctx, emis, game, palette);
  drawTurret(ctx, emis, game, palette, time);

  drawVfx(ctx, vfx);
  if (emis) {
    drawVfx(emis, vfx);
    emis.restore();
  }

  ctx.restore();

  if (emis) drawBloom(ctx, post, quality.bloomStrength ?? 1);

  drawChrome(ctx, fit);
  drawHud(ctx, game, fit, { debug });

  // These two reset to identity, so they are sized in DEVICE pixels, not CSS ones.
  drawVignette(ctx, pxW, pxH, quality.vignette ?? 0.8);
  if (quality.grain !== false) drawGrain(ctx, asset('grain'), pxW, pxH, time, 0.045);

  // Restore the caller's DPR transform, which the post passes reset.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
