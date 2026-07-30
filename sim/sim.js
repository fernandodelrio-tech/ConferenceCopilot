// The deterministic simulation core.
//
// Hard constraints (plan §3.1, §3.2), enforced by tests/purity.test.js:
//   - no imports from render/ or platform/
//   - no Math.random, no Date, no Math.sin/cos (use ./trig.js)
//   - fixed 120Hz timestep; the renderer interpolates, the sim never does
//   - (state, inputs) -> state', events
//
// Derived data (ball screen positions) lives on the `game` wrapper, never on
// `state`, so the state hash and the save file stay canonical.

import { seedFrom, randU32, randFloat, randInt } from './rng.js';
import { sin, cos } from './trig.js';
import { buildLane, pointAt, tangentAt } from './lane.js';
import {
  gapFlags,
  groupIndices,
  runAround,
  insertAgainst,
  compactBehind,
  shiftChain,
  comboMultiplier,
  calloutFor,
  touching,
} from './rules.js';

export const POWERUPS = ['fulminate', 'arc', 'reverse', 'governor', 'sightline'];
export const MODES = ['expedition', 'perpetual', 'overpressure'];

function flattenTuning(tuning) {
  const T = {};
  for (const key of Object.keys(tuning.global)) T[key] = tuning.global[key].v;
  return T;
}

export function createGame({ level, tuning, seed = 1, mode = 'expedition', lives = null, relaxed = 1 }) {
  const T = flattenTuning(tuning);
  const row = tuning.levels.find((r) => r.id === level.id) || tuning.levels[0];
  const geom = level.lanes.map((l) => buildLane(l.points));

  let chainSpeed = row.chainSpeed;
  let colorCount = row.colors;
  if (mode === 'overpressure') {
    chainSpeed *= T.overpressureSpeedScale;
    colorCount = Math.min(tuning.palette.colors.length, colorCount + T.overpressureColorBump);
  }

  const state = {
    tick: 0,
    rng: seedFrom(seed),
    seed: seed >>> 0,
    levelId: level.id,
    mode,
    status: 'playing',
    score: 0,
    lives: lives === null ? T.startLives : lives,
    destroyed: 0,
    gaugeTarget: mode === 'perpetual' ? Infinity : row.gaugeTarget,
    nextExtraLife: T.extraLifeEvery,
    chainSpeed,
    colorCount,
    powerupChance: row.powerupChance,
    relaxed,
    nextId: 1,
    chains: geom.map(() => ({ balls: [], comboStep: 0, comboTicks: 0 })),
    turret: { angle: -Math.PI / 2, current: 0, next: 0, cooldown: 0 },
    shots: [],
    coins: [],
    coinTimer: T.coinIntervalTicks,
    reverseTicks: 0,
    governorTicks: 0,
    sightlineTicks: 0,
    callout: null,
    calloutTicks: 0,
    events: [],
  };

  const game = { level, geom, T, row, state, pos: geom.map(() => []) };

  // Opening chain: pre-placed so the level starts already in motion.
  const D = T.ballRadius * 2;
  const perLane = Math.max(1, Math.floor(row.initialBalls / geom.length));
  for (let ci = 0; ci < geom.length; ci++) {
    const chain = state.chains[ci];
    for (let j = 0; j < perLane; j++) {
      chain.balls.push({
        id: state.nextId++,
        color: randInt(state, colorCount),
        dist: (perLane - 1 - j) * D,
        powerup: null,
      });
    }
  }

  state.turret.current = pickSpawnColor(game);
  state.turret.next = pickSpawnColor(game);
  refreshPositions(game);
  return game;
}

// ------------------------------------------------------------------- colour pool
// Colour retirement (§2.3): once a colour is gone from the track it stops being
// generated, which is what makes the endgame converge instead of dragging.

function activeColors(game) {
  const present = new Set();
  for (const chain of game.state.chains) {
    for (const b of chain.balls) if (b.color < game.state.colorCount) present.add(b.color);
  }
  if (present.size === 0) {
    const all = [];
    for (let c = 0; c < game.state.colorCount; c++) all.push(c);
    return all;
  }
  return [...present].sort((a, b) => a - b);
}

function pickSpawnColor(game) {
  const pool = activeColors(game);
  return pool[randInt(game.state, pool.length)];
}

// ------------------------------------------------------------------- positions

function refreshPositions(game) {
  for (let ci = 0; ci < game.geom.length; ci++) {
    const balls = game.state.chains[ci].balls;
    const out = game.pos[ci];
    out.length = balls.length;
    for (let i = 0; i < balls.length; i++) {
      out[i] = pointAt(game.geom[ci], balls[i].dist, out[i] || { x: 0, y: 0 });
    }
  }
}

// ---------------------------------------------------------------------- scoring

function addScore(game, amount) {
  const s = game.state;
  s.score += amount;
  while (s.score >= s.nextExtraLife) {
    s.lives++;
    s.nextExtraLife += game.T.extraLifeEvery;
    s.events.push({ type: 'extraLife' });
  }
}

// --------------------------------------------------------------------- popping
// Powerups expand the removal set BEFORE anything is spliced, so no index ever
// shifts underneath us. That one ordering choice removes a whole family of
// off-by-one bugs that this mechanic is otherwise notorious for.

function popRun(game, ci, start, end, opts = {}) {
  const s = game.state;
  const chain = s.chains[ci];
  const balls = chain.balls;
  const positions = game.pos[ci];
  const T = game.T;

  const remove = new Set();
  for (let i = start; i <= end; i++) remove.add(i);

  const queue = [];
  for (let i = start; i <= end; i++) if (balls[i].powerup) queue.push({ index: i, depth: 0 });

  const triggered = [];
  while (queue.length) {
    const { index, depth } = queue.shift();
    const kind = balls[index].powerup;
    if (!kind) continue;
    triggered.push({ kind, index });

    if (depth >= T.powerupCascadeDepthCap) continue;

    if (kind === 'fulminate') {
      const centre = positions[index];
      const r2 = T.fulminateRadius * T.fulminateRadius;
      for (let j = 0; j < balls.length; j++) {
        if (remove.has(j)) continue;
        const p = positions[j];
        const dx = p.x - centre.x;
        const dy = p.y - centre.y;
        if (dx * dx + dy * dy <= r2) {
          remove.add(j);
          if (balls[j].powerup) queue.push({ index: j, depth: depth + 1 });
        }
      }
    } else if (kind === 'arc') {
      for (let j = Math.max(0, index - T.arcSpan); j <= Math.min(balls.length - 1, index + T.arcSpan); j++) {
        if (remove.has(j)) continue;
        remove.add(j);
        if (balls[j].powerup) queue.push({ index: j, depth: depth + 1 });
      }
    } else if (kind === 'reverse') {
      s.reverseTicks = T.reverseTicks;
    } else if (kind === 'governor') {
      s.governorTicks = T.governorTicks;
    } else if (kind === 'sightline') {
      s.sightlineTicks = T.sightlineTicks;
    }
  }

  chain.comboStep = chain.comboTicks > 0 ? chain.comboStep + 1 : 1;
  chain.comboTicks = T.comboWindowTicks;

  const mult = comboMultiplier(chain.comboStep, T.comboCap);
  const count = remove.size;
  let gained = T.scoreBase * count * mult;
  if (opts.intoGap) gained += T.gapBonus;

  const centre = positions[start] || { x: 0, y: 0 };
  const indices = [...remove].sort((a, b) => b - a);
  for (const i of indices) balls.splice(i, 1);

  s.destroyed += count;
  addScore(game, gained);

  const callout = calloutFor(chain.comboStep);
  if (callout) {
    s.callout = callout;
    s.calloutTicks = 90;
  }

  s.events.push({
    type: 'pop',
    lane: ci,
    count,
    comboStep: chain.comboStep,
    gained,
    intoGap: !!opts.intoGap,
    x: centre.x,
    y: centre.y,
  });
  for (const t of triggered) s.events.push({ type: 'powerup', kind: t.kind, x: centre.x, y: centre.y });

  refreshPositions(game);
  return count;
}

function tryPopAt(game, ci, index, opts) {
  const balls = game.state.chains[ci].balls;
  if (index < 0 || index >= balls.length) return 0;
  const D = game.T.ballRadius * 2;
  const run = runAround(balls, index, D);
  if (!run || run.count < game.T.minMatch) return 0;
  return popRun(game, ci, run.start, run.end, opts);
}

// ------------------------------------------------------------------------ input

function applyInput(game, ev) {
  const s = game.state;
  if (ev.type === 'aim') {
    // Quantised so a touch drag, a stick deflection and a replay all agree.
    s.turret.angle = Math.round(ev.angle * 4096) / 4096;
  } else if (ev.type === 'swap') {
    const c = s.turret.current;
    s.turret.current = s.turret.next;
    s.turret.next = c;
    s.events.push({ type: 'swap' });
  } else if (ev.type === 'fire') {
    if (s.status !== 'playing' || s.turret.cooldown > 0) return;
    const sp = game.T.shotSpeed;
    s.shots.push({
      id: s.nextId++,
      x: game.level.shooter[0],
      y: game.level.shooter[1],
      vx: cos(s.turret.angle) * sp,
      vy: sin(s.turret.angle) * sp,
      color: s.turret.current,
    });
    s.turret.current = s.turret.next;
    s.turret.next = pickSpawnColor(game);
    s.turret.cooldown = game.T.fireCooldownTicks;
    s.events.push({ type: 'fire' });
  }
}

// ------------------------------------------------------------------------- step

export function step(game, inputs) {
  const s = game.state;
  const T = game.T;
  const D = T.ballRadius * 2;
  const dt = 1 / T.tickHz;
  s.events = [];

  if (inputs) for (const ev of inputs) applyInput(game, ev);
  if (s.status !== 'playing') return s.events;

  s.tick++;
  if (s.turret.cooldown > 0) s.turret.cooldown--;
  if (s.reverseTicks > 0) s.reverseTicks--;
  if (s.governorTicks > 0) s.governorTicks--;
  if (s.sightlineTicks > 0) s.sightlineTicks--;
  if (s.calloutTicks > 0 && --s.calloutTicks === 0) s.callout = null;
  for (const chain of s.chains) if (chain.comboTicks > 0 && --chain.comboTicks === 0) chain.comboStep = 0;

  moveShots(game, dt, D);
  advanceChains(game, dt, D);
  spawnBalls(game, D);
  retireTurretColors(game);
  updateCoins(game, dt);
  checkEndConditions(game);

  refreshPositions(game);
  return s.events;
}

function moveShots(game, dt, D) {
  const s = game.state;
  const box = game.level.box;
  const hitR2 = D * D;

  for (let i = s.shots.length - 1; i >= 0; i--) {
    const shot = s.shots[i];
    shot.x += shot.vx * dt;
    shot.y += shot.vy * dt;

    // Coins first — a shot that clips a bonus token still carries on to the track.
    for (let c = s.coins.length - 1; c >= 0; c--) {
      const coin = s.coins[c];
      const dx = coin.x - shot.x;
      const dy = coin.y - shot.y;
      const r = game.T.coinRadius + game.T.ballRadius;
      if (dx * dx + dy * dy <= r * r) {
        s.coins.splice(c, 1);
        addScore(game, game.T.coinScore);
        s.events.push({ type: 'coin', x: coin.x, y: coin.y });
      }
    }

    let best = null;
    for (let ci = 0; ci < s.chains.length; ci++) {
      const balls = s.chains[ci].balls;
      const positions = game.pos[ci];
      for (let bi = 0; bi < balls.length; bi++) {
        if (balls[bi].dist < 0) continue; // still inside the feed pipe
        const p = positions[bi];
        const dx = p.x - shot.x;
        const dy = p.y - shot.y;
        const d2 = dx * dx + dy * dy;
        if (d2 <= hitR2 && (!best || d2 < best.d2)) best = { ci, bi, d2, p };
      }
    }

    if (best) {
      s.shots.splice(i, 1);
      const tan = tangentAt(game.geom[best.ci], s.chains[best.ci].balls[best.bi].dist);
      const ahead = (shot.x - best.p.x) * tan.x + (shot.y - best.p.y) * tan.y > 0;
      const ball = { id: s.nextId++, color: shot.color, dist: 0, powerup: null };
      const pipeDepth = game.T.pipeCapacityBalls * D;
      const { index, intoGap } = insertAgainst(s.chains[best.ci].balls, best.bi, ahead, ball, D, pipeDepth);
      refreshPositions(game);
      s.events.push({ type: 'insert', lane: best.ci, x: best.p.x, y: best.p.y, intoGap });
      tryPopAt(game, best.ci, index, { intoGap });
      continue;
    }

    const m = 80;
    if (shot.x < -m || shot.y < -m || shot.x > box[0] + m || shot.y > box[1] + m) s.shots.splice(i, 1);
  }
}

function chainSpeedNow(game) {
  const s = game.state;
  let speed = s.chainSpeed * s.relaxed;
  if (s.governorTicks > 0) speed *= game.T.governorMultiplier;
  if (s.mode === 'perpetual') {
    const minutes = s.tick / (game.T.tickHz * 60);
    speed *= 1 + minutes * game.T.perpetualRampPerMinute;
  }
  return speed;
}

function advanceChains(game, dt, D) {
  const s = game.state;
  const speed = chainSpeedNow(game);

  for (let ci = 0; ci < s.chains.length; ci++) {
    const balls = s.chains[ci].balls;
    if (balls.length === 0) continue;

    if (s.reverseTicks > 0) {
      const back = game.T.reverseSpeed * dt;
      for (const b of balls) b.dist -= back;
      continue;
    }

    const { groups, flags } = groupIndices(balls, D);
    const base = speed * dt;
    const catchUp = game.T.catchUpSpeed * dt;
    for (let i = 0; i < balls.length; i++) balls[i].dist += base + (groups[i] > 0 ? catchUp : 0);

    // Resolve contacts front-to-back; a gap that closes this tick is a junction,
    // and a junction is where chain combos are born.
    const junctions = [];
    for (let i = 1; i < balls.length; i++) {
      const maxDist = balls[i - 1].dist - D;
      if (balls[i].dist > maxDist) {
        balls[i].dist = maxDist;
        if (flags[i]) junctions.push(i);
      }
    }

    if (junctions.length) {
      refreshPositions(game);
      // Descending, so splices never invalidate a lower junction index.
      for (let k = junctions.length - 1; k >= 0; k--) {
        const idx = junctions[k];
        if (idx < s.chains[ci].balls.length) {
          s.events.push({ type: 'gapClose', lane: ci });
          tryPopAt(game, ci, idx, {});
        }
      }
    }
  }
}

function spawnBalls(game, D) {
  const s = game.state;
  if (s.destroyed >= s.gaugeTarget || s.reverseTicks > 0) return;

  for (let ci = 0; ci < s.chains.length; ci++) {
    const balls = s.chains[ci].balls;
    const rear = balls[balls.length - 1];
    if (balls.length > 0 && rear.dist < D) continue;

    const color = pickSpawnColor(game);
    const powerup = randFloat(s) < s.powerupChance ? POWERUPS[randInt(s, POWERUPS.length)] : null;
    balls.push({ id: s.nextId++, color, dist: 0, powerup });
    s.events.push({ type: 'spawn', lane: ci, powerup });
  }
}

// Retire turret colours that no longer exist on the track. This runs every tick,
// deliberately outside spawnBalls: it matters MOST once the gauge is full and the
// spawner has stopped, because that is the endgame where being handed a colour that
// cannot possibly match is an unwinnable state rather than a nuisance.
function retireTurretColors(game) {
  const s = game.state;
  const pool = activeColors(game);
  if (!pool.length) return;
  if (!pool.includes(s.turret.current)) s.turret.current = pool[randInt(s, pool.length)];
  if (!pool.includes(s.turret.next)) s.turret.next = pool[randInt(s, pool.length)];
}

function updateCoins(game, dt) {
  const s = game.state;
  const box = game.level.box;

  for (let i = s.coins.length - 1; i >= 0; i--) {
    const coin = s.coins[i];
    coin.x += coin.vx * dt;
    coin.y += coin.vy * dt;
    if (--coin.life <= 0) s.coins.splice(i, 1);
  }

  if (--s.coinTimer <= 0) {
    s.coinTimer = game.T.coinIntervalTicks;
    const margin = 160;
    s.coins.push({
      id: s.nextId++,
      x: margin + randFloat(s) * (box[0] - margin * 2),
      y: margin + randFloat(s) * (box[1] - margin * 2),
      vx: (randFloat(s) - 0.5) * 40,
      vy: (randFloat(s) - 0.5) * 40,
      life: game.T.coinLifeTicks,
    });
  }
}

function checkEndConditions(game) {
  const s = game.state;

  for (let ci = 0; ci < s.chains.length; ci++) {
    const balls = s.chains[ci].balls;
    if (balls.length && balls[0].dist >= game.geom[ci].length) {
      s.status = 'lost';
      s.lives--;
      s.events.push({ type: 'lose', lane: ci });
      return;
    }
  }

  if (s.destroyed >= s.gaugeTarget) {
    const empty = s.chains.every((c) => c.balls.length === 0);
    if (empty) {
      addScore(game, game.T.clearBonus);
      s.status = 'won';
      s.events.push({ type: 'win' });
    }
  }
}

// ---------------------------------------------------------------- introspection

export function gaugeFraction(game) {
  const s = game.state;
  if (!isFinite(s.gaugeTarget)) return 0;
  return Math.max(0, Math.min(1, s.destroyed / s.gaugeTarget));
}

// Threat level: how close the frontmost ball is to the intake, across all lanes.
// Drives the boiler needle and the audio tension layer (§3.7).
export function pressureFraction(game) {
  let worst = 0;
  for (let ci = 0; ci < game.state.chains.length; ci++) {
    const balls = game.state.chains[ci].balls;
    if (!balls.length) continue;
    worst = Math.max(worst, balls[0].dist / game.geom[ci].length);
  }
  return Math.max(0, Math.min(1, worst));
}

const q = (v) => Math.round(v * 1000) | 0;

export function hashState(state) {
  let h = 0x811c9dc5;
  const mix = (n) => {
    h ^= n | 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  };
  mix(state.tick);
  mix(state.rng);
  mix(state.score);
  mix(state.destroyed);
  mix(state.lives);
  mix(state.status.length);
  mix(state.reverseTicks);
  mix(state.governorTicks);
  mix(state.sightlineTicks);
  mix(q(state.turret.angle));
  mix(state.turret.current);
  mix(state.turret.next);
  mix(state.turret.cooldown);
  for (const chain of state.chains) {
    mix(chain.comboStep);
    mix(chain.comboTicks);
    for (const b of chain.balls) {
      mix(b.id);
      mix(b.color);
      mix(q(b.dist));
      mix(b.powerup ? b.powerup.length : 0);
    }
  }
  for (const shot of state.shots) {
    mix(shot.id);
    mix(q(shot.x));
    mix(q(shot.y));
  }
  for (const coin of state.coins) {
    mix(coin.id);
    mix(q(coin.x));
    mix(q(coin.y));
  }
  return h >>> 0;
}

export function serialize(game) {
  return JSON.stringify(game.state);
}

export function restore(game, json) {
  const parsed = typeof json === 'string' ? JSON.parse(json) : json;
  if (!isFinite(parsed.gaugeTarget)) parsed.gaugeTarget = Infinity;
  game.state = parsed;
  refreshPositions(game);
  return game;
}
