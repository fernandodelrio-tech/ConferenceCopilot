// Canvas2D renderer — The Ascendant Works.
//
// Reads sim state, owns interpolation and every visual decision. Never writes to
// sim state (plan §3.1).
//
// The zonal restraint rule from §3.4 is structural here, not a guideline the artist
// has to remember: the lane is drawn as an opaque machined plate laid OVER the
// backdrop, so no backdrop detail can ever sit behind a ball. All the rivets,
// filigree and gauge work live in drawChrome(), which only ever paints outside the
// 16:10 box.

import { pointAt, tangentAt } from '../sim/lane.js';
import { drawGlyph } from './glyphs.js';
import { drawVfx } from './vfx.js';
import { gaugeFraction, pressureFraction } from '../sim/sim.js';

const IRON_DARK = '#14171a';
const IRON = '#22282d';
const PLATE = '#2b3238';
const BRASS = '#b98a3c';
const BRASS_LIT = '#e8c887';
const BRASS_DIM = '#6d5326';
const VERDIGRIS = '#3f7d6e';
const EMBER = '#ff8c3a';

const CHAPTER_TINT = [
  ['#2a1f18', '#141a1e'], // Boiler Deck — soot and firelight
  ['#1d2430', '#12161c'], // Clockworks
  ['#182a2a', '#101718'], // Pneumatic Exchange
  ['#221a30', '#12101c'], // Aether Observatory
  ['#1b2530', '#0f1418'], // Airship Yards
  ['#2e1c17', '#160f0e'], // Spire Foundry
];

// ------------------------------------------------------------------- backdrop

export function drawBackdrop(ctx, fit, chapter) {
  const [top, bottom] = CHAPTER_TINT[(chapter - 1) % CHAPTER_TINT.length];
  const g = ctx.createLinearGradient(0, 0, 0, fit.viewH);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, fit.viewW, fit.viewH);

  // Large, low-contrast structural silhouettes. Big shapes only — high-frequency
  // detail belongs in the chrome, never behind the playfield.
  ctx.save();
  ctx.globalAlpha = 0.5;
  const cx = fit.viewW * 0.5;
  const cy = fit.viewH * 0.5;
  const R = Math.max(fit.viewW, fit.viewH);
  for (const [ox, oy, rad] of [[-0.42, -0.3, 0.34], [0.46, 0.34, 0.42], [0.1, -0.52, 0.26]]) {
    ctx.beginPath();
    ctx.arc(cx + ox * R, cy + oy * R, rad * R * 0.5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.022)';
    ctx.lineWidth = R * 0.05;
    ctx.stroke();
  }
  ctx.restore();
}

// --------------------------------------------------------------------- chrome
// Full steampunk detail budget: this only draws in the slack outside the box.

export function drawChrome(ctx, fit) {
  ctx.save();

  // Bezel around the playfield.
  ctx.strokeStyle = BRASS_DIM;
  ctx.lineWidth = Math.max(3, fit.scale * 7);
  ctx.strokeRect(fit.x, fit.y, fit.w, fit.h);
  ctx.strokeStyle = 'rgba(232,200,135,0.35)';
  ctx.lineWidth = Math.max(1, fit.scale * 2);
  ctx.strokeRect(fit.x + 2, fit.y + 2, fit.w - 4, fit.h - 4);

  // Rivets along the bezel — the one place high-frequency detail is welcome.
  const step = Math.max(28, fit.w / 26);
  ctx.fillStyle = 'rgba(232,200,135,0.5)';
  for (let x = fit.x + step / 2; x < fit.x + fit.w; x += step) {
    rivet(ctx, x, fit.y + 5);
    rivet(ctx, x, fit.y + fit.h - 5);
  }
  for (let y = fit.y + step / 2; y < fit.y + fit.h; y += step) {
    rivet(ctx, fit.x + 5, y);
    rivet(ctx, fit.x + fit.w - 5, y);
  }
  ctx.restore();
}

function rivet(ctx, x, y) {
  ctx.beginPath();
  ctx.arc(x, y, 2, 0, Math.PI * 2);
  ctx.fill();
}

// ----------------------------------------------------------------- lane plate

export function buildLanePaths(level) {
  return level.lanes.map((lane) => {
    const p = new Path2D();
    p.moveTo(lane.points[0][0], lane.points[0][1]);
    for (let i = 1; i < lane.points.length; i++) p.lineTo(lane.points[i][0], lane.points[i][1]);
    return p;
  });
}

export function drawLanes(ctx, game, paths) {
  const R = game.T.ballRadius;

  for (const path of paths) {
    // Opaque machined plate — this is the restraint rule made literal.
    ctx.strokeStyle = IRON_DARK;
    ctx.lineWidth = R * 2.9;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke(path);

    ctx.strokeStyle = PLATE;
    ctx.lineWidth = R * 2.45;
    ctx.stroke(path);

    // Rail edges.
    ctx.strokeStyle = 'rgba(185,138,60,0.30)';
    ctx.lineWidth = 2;
    ctx.stroke(path);
  }
}

export function drawLaneFurniture(ctx, game) {
  for (let ci = 0; ci < game.geom.length; ci++) {
    const lane = game.geom[ci];
    const R = game.T.ballRadius;

    // Escapement gate.
    const gate = pointAt(lane, 0, { x: 0, y: 0 });
    ctx.save();
    ctx.translate(gate.x, gate.y);
    ctx.fillStyle = IRON_DARK;
    ctx.beginPath();
    ctx.arc(0, 0, R * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = BRASS;
    ctx.lineWidth = 3;
    ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * R * 0.8, Math.sin(a) * R * 0.8);
      ctx.lineTo(Math.cos(a) * R * 1.4, Math.sin(a) * R * 1.4);
      ctx.stroke();
    }
    ctx.restore();

    // Furnace intake, with a needle that climbs to the redline as the chain nears.
    const out = pointAt(lane, lane.length, { x: 0, y: 0 });
    const threat = pressureFraction(game);
    ctx.save();
    ctx.translate(out.x, out.y);
    ctx.beginPath();
    ctx.arc(0, 0, R * 2.1, 0, Math.PI * 2);
    ctx.fillStyle = '#0d0f11';
    ctx.fill();
    const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, R * 2.1);
    glow.addColorStop(0, `rgba(255,120,40,${0.35 + threat * 0.6})`);
    glow.addColorStop(1, 'rgba(255,80,20,0)');
    ctx.fillStyle = glow;
    ctx.fill();
    ctx.strokeStyle = BRASS;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Redline arc + needle.
    ctx.beginPath();
    ctx.arc(0, 0, R * 1.6, Math.PI * 0.75, Math.PI * 0.75 + Math.PI * 1.5);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, R * 1.6, Math.PI * 0.75 + Math.PI * 1.2, Math.PI * 0.75 + Math.PI * 1.5);
    ctx.strokeStyle = '#d0402c';
    ctx.stroke();

    const a = Math.PI * 0.75 + Math.PI * 1.5 * threat;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * R * 1.5, Math.sin(a) * R * 1.5);
    ctx.strokeStyle = threat > 0.8 ? '#ff5a3c' : BRASS_LIT;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }
}

// ----------------------------------------------------------------------- balls

const POWERUP_MARK = {
  fulminate: '#ff6b3d',
  arc: '#7fd4ff',
  reverse: '#9ad76b',
  governor: '#c9a0ff',
  sightline: '#ffe083',
};

function drawBall(ctx, x, y, colorHex, glyph, r, powerup, t) {
  // Glass body.
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, mix(colorHex, '#ffffff', 0.55));
  g.addColorStop(0.55, colorHex);
  g.addColorStop(1, mix(colorHex, '#000000', 0.45));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  // Brass cage — a thin bezel only. It must never eat the coloured glass area,
  // which is the signal the player is actually reading.
  ctx.strokeStyle = BRASS_DIM;
  ctx.lineWidth = Math.max(1.2, r * 0.13);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(232,200,135,0.5)';
  ctx.lineWidth = Math.max(0.8, r * 0.06);
  ctx.stroke();

  // Engraved glyph — always on (§3.4, §10).
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = 'rgba(12,14,16,0.72)';
  drawGlyph(ctx, glyph, r);
  ctx.restore();

  // Specular.
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.32, y - r * 0.38, r * 0.22, r * 0.15, -0.6, 0, Math.PI * 2);
  ctx.fill();

  if (powerup) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const pulse = 0.55 + 0.45 * Math.sin(t * 6);
    ctx.strokeStyle = POWERUP_MARK[powerup] || '#fff';
    ctx.globalAlpha = pulse;
    ctx.lineWidth = Math.max(1.5, r * 0.18);
    ctx.beginPath();
    ctx.arc(x, y, r * 1.16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

export function drawBalls(ctx, game, palette, alpha, prevDist, t) {
  const R = game.T.ballRadius;
  const scratch = { x: 0, y: 0 };

  for (let ci = 0; ci < game.state.chains.length; ci++) {
    const balls = game.state.chains[ci].balls;
    const lane = game.geom[ci];
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      if (b.dist < -R) continue; // inside the feed pipe
      // Interpolate between sim ticks so 90Hz and 120Hz displays stay smooth.
      const prev = prevDist.get(b.id);
      const d = prev === undefined ? b.dist : prev + (b.dist - prev) * alpha;
      const p = pointAt(lane, d, scratch);
      const c = palette[b.color] || palette[0];
      drawBall(ctx, p.x, p.y, c.hex, c.glyph, R, b.powerup, t);
    }
  }
}

// ---------------------------------------------------------------------- turret

export function drawTurret(ctx, game, palette, t) {
  const s = game.state;
  const [x, y] = game.level.shooter;
  const R = game.T.ballRadius;
  const a = s.turret.angle;

  ctx.save();
  ctx.translate(x, y);

  // Pressure vessel.
  const body = ctx.createRadialGradient(-R * 0.5, -R * 0.6, R * 0.2, 0, 0, R * 2.2);
  body.addColorStop(0, '#8e6f38');
  body.addColorStop(0.6, BRASS_DIM);
  body.addColorStop(1, '#3a2d16');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(0, 0, R * 2.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = BRASS_LIT;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  for (let i = 0; i < 10; i++) {
    const ra = (i / 10) * Math.PI * 2;
    ctx.fillStyle = 'rgba(240,215,160,0.55)';
    ctx.beginPath();
    ctx.arc(Math.cos(ra) * R * 1.72, Math.sin(ra) * R * 1.72, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Barrel + aim vane.
  ctx.save();
  ctx.rotate(a);
  ctx.fillStyle = '#4a3a1c';
  ctx.fillRect(0, -R * 0.62, R * 3.0, R * 1.24);
  ctx.strokeStyle = BRASS_LIT;
  ctx.lineWidth = 2;
  ctx.strokeRect(0, -R * 0.62, R * 3.0, R * 1.24);
  ctx.fillStyle = BRASS;
  ctx.fillRect(R * 2.5, -R * 0.85, R * 0.4, R * 1.7);
  ctx.restore();

  // Chambered next shot, visible through the glass breech.
  const nextC = palette[s.turret.next] || palette[0];
  ctx.save();
  ctx.translate(-R * 1.05, 0);
  ctx.fillStyle = '#101315';
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.72, 0, Math.PI * 2);
  ctx.fill();
  drawBall(ctx, 0, 0, nextC.hex, nextC.glyph, R * 0.55, null, t);
  ctx.strokeStyle = 'rgba(232,200,135,0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.72, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  ctx.restore();

  // Loaded ball riding at the muzzle.
  const cur = palette[s.turret.current] || palette[0];
  drawBall(ctx, x + Math.cos(a) * R * 2.2, y + Math.sin(a) * R * 2.2, cur.hex, cur.glyph, R, null, t);
}

export function drawSightline(ctx, game) {
  const s = game.state;
  if (s.sightlineTicks <= 0) return;
  const [x, y] = game.level.shooter;
  const a = s.turret.angle;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = 'rgba(255,224,131,0.35)';
  ctx.setLineDash([14, 12]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + Math.cos(a) * game.T.ballRadius * 2.4, y + Math.sin(a) * game.T.ballRadius * 2.4);
  ctx.lineTo(x + Math.cos(a) * 2600, y + Math.sin(a) * 2600);
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- shots, coins

export function drawShots(ctx, game, palette, t) {
  const R = game.T.ballRadius;
  for (const shot of game.state.shots) {
    const c = palette[shot.color] || palette[0];
    drawBall(ctx, shot.x, shot.y, c.hex, c.glyph, R, null, t);
  }
}

export function drawCoins(ctx, game, t) {
  const R = game.T.coinRadius;
  for (const coin of game.state.coins) {
    const wobble = Math.abs(Math.cos(t * 2.2 + coin.id));
    ctx.save();
    ctx.translate(coin.x, coin.y);
    ctx.scale(0.35 + wobble * 0.65, 1);
    ctx.fillStyle = '#f0c14b';
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8a6a1e';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }
}

// -------------------------------------------------------------------- the HUD
// Placed into whichever slack the device gives us (§3.5): the top band on a 4:3
// iPad, the side columns on a 19.5:9 iPhone, and an overlay strip on a 16:10 Deck
// where there is no slack at all.

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
    ctx.fillStyle = 'rgba(10,12,14,0.62)';
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.strokeStyle = 'rgba(185,138,60,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(box.x, box.y, box.w, box.h);
  }

  ctx.textBaseline = 'middle';
  const midY = box.vertical ? box.y + 26 * scale : box.y + box.h / 2;

  // Score + level.
  ctx.fillStyle = BRASS_LIT;
  ctx.font = fs(20);
  ctx.textAlign = 'left';
  ctx.fillText(String(s.score).padStart(7, '0'), box.x + pad, midY);

  ctx.fillStyle = 'rgba(232,200,135,0.65)';
  ctx.font = fs(12);
  ctx.fillText(`${game.level.chapterName.toUpperCase()} — ${game.level.name}`, box.x + pad, midY + 20 * scale);

  // Lives.
  ctx.textAlign = 'right';
  ctx.fillStyle = BRASS_LIT;
  ctx.font = fs(14);
  ctx.fillText(`◈ ${s.lives}`, box.x + box.w - pad, midY);

  // Boiler gauge.
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

  // Active effects.
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

  // Combo callout, centred over the playfield.
  if (s.callout) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const a = Math.min(1, s.calloutTicks / 30);
    ctx.globalAlpha = a;
    ctx.font = `${Math.round(46 * scale)}px ui-monospace, Menlo, monospace`;
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
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(fit.x + 6, fit.y + 6, 250 * scale, lines.length * 14 * scale + 8);
  ctx.fillStyle = '#7fd4ff';
  lines.forEach((l, i) => ctx.fillText(l, fit.x + 12, fit.y + 12 + i * 14 * scale));
  ctx.restore();
}

// ------------------------------------------------------------------ full frame

export function drawFrame(ctx, game, fit, ui) {
  const { palette, paths, vfx, alpha, prevDist, time, debug } = ui;

  drawBackdrop(ctx, fit, game.level.chapter);

  ctx.save();
  const shake = vfx.shake;
  const sx = shake ? (((time * 91) % 2) - 1) * shake : 0;
  const sy = shake ? (((time * 57) % 2) - 1) * shake : 0;
  ctx.translate(fit.x + sx, fit.y + sy);
  ctx.scale(fit.scale, fit.scale);

  ctx.beginPath();
  ctx.rect(0, 0, game.level.box[0], game.level.box[1]);
  ctx.clip();

  drawLanes(ctx, game, paths);
  drawLaneFurniture(ctx, game);
  drawCoins(ctx, game, time);
  drawSightline(ctx, game);
  drawBalls(ctx, game, palette, alpha, prevDist, time);
  drawShots(ctx, game, palette, time);
  drawTurret(ctx, game, palette, time);
  drawVfx(ctx, vfx);

  ctx.restore();

  drawChrome(ctx, fit);
  drawHud(ctx, game, fit, { debug });
}

// ---------------------------------------------------------------------- colour

function mix(hex, other, amount) {
  const a = parseHex(hex);
  const b = parseHex(other);
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * amount));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function parseHex(hex) {
  if (hex.startsWith('rgb')) return hex.match(/\d+/g).slice(0, 3).map(Number);
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}
