#!/usr/bin/env node
// asc-sim — headless simulation CLI (plan §5).
//
//   node tools/simcli.js profile
//   node tools/simcli.js play    --level 7 --seed 42 [--ticks 60000] [--mode expedition]
//   node tools/simcli.js hash    --level 3 --seed 1 --ticks 20000
//   node tools/simcli.js monte   --level 5 --trials 400
//
// A bot player drives `play` so levels can be exercised without a human. It is a
// crude bot (nearest same-colour target) — good enough to prove a level is
// completable and to shake out state bugs, nowhere near good enough to replace
// the persona rounds in §7.

import { readFileSync, readdirSync } from 'node:fs';
import { initTrig } from '../sim/trig.js';
import { createGame, step, hashState, gaugeFraction, pressureFraction } from '../sim/sim.js';
import { tangentAt } from '../sim/lane.js';
import { profileFor } from '../sim/profile.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));

export const tuning = read('content/tuning.json');
initTrig(read('content/trig.json'));

export function loadLevel(id) {
  return read(`content/lanes/${String(id).padStart(2, '0')}.json`);
}

export function levelIds() {
  return readdirSync(new URL('../content/lanes', import.meta.url))
    .filter((f) => /^\d+\.json$/.test(f))
    .map((f) => parseInt(f, 10))
    .sort((a, b) => a - b);
}

function arg(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : dflt;
}

// ------------------------------------------------------------------- the bot

// Deterministic: derives its own aim from state only, never from Math.random.
// Crude on purpose — it exists to prove levels are completable and to shake out
// state bugs in long runs. It is not a substitute for the persona rounds in §7.
//
// The line-of-sight check below is not optional. Without it the bot aimed at a
// ball's centre and ignored whatever the shot passed through on the way; on the
// coil lanes (which cross themselves up to 11 times) most shots hit the wrong ball
// and the chain drowned in junk insertions. That looked like a level being
// unwinnable when it was only the bot being blind.
export function botInputs(game, tick) {
  const s = game.state;
  if (s.turret.cooldown > 0) return [];

  const shot = planShot(game, s.turret.current);
  if (!shot) {
    // Nothing reachable for the held colour: swap if the next one has a shot.
    return planShot(game, s.turret.next) ? [{ type: 'swap' }] : [];
  }
  return [{ type: 'aim', angle: shot.angle }, { type: 'fire' }];
}

function candidates(game, color) {
  const out = [];
  for (let ci = 0; ci < game.state.chains.length; ci++) {
    const balls = game.state.chains[ci].balls;
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      if (b.dist < 0 || b.color !== color) continue;
      const pairs =
        (i > 0 && balls[i - 1].color === color ? 1 : 0) +
        (i < balls.length - 1 && balls[i + 1].color === color ? 1 : 0);
      out.push({ ci, i, pairs, dist: b.dist, p: game.pos[ci][i] });
    }
  }
  // Completing a run first; then whatever is closest to the intake.
  out.sort((a, b) => b.pairs - a.pairs || b.dist - a.dist);
  return out.slice(0, 16);
}

// March the ray and report the first ball it would strike.
function firstHit(game, angle) {
  const D = game.T.ballRadius * 2;
  const step = game.T.ballRadius;
  const ox = game.level.shooter[0];
  const oy = game.level.shooter[1];
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  for (let t = step; t < 2600; t += step) {
    const x = ox + dx * t;
    const y = oy + dy * t;
    for (let ci = 0; ci < game.state.chains.length; ci++) {
      const balls = game.state.chains[ci].balls;
      for (let i = 0; i < balls.length; i++) {
        if (balls[i].dist < 0) continue;
        const p = game.pos[ci][i];
        const ex = p.x - x;
        const ey = p.y - y;
        if (ex * ex + ey * ey <= D * D) return { ci, i };
      }
    }
  }
  return null;
}

function planShot(game, color) {
  const R = game.T.ballRadius;
  for (const c of candidates(game, color)) {
    // Aim slightly to the REAR of the target so the ball lands behind it. Landing
    // in front of the frontmost ball shoves that ball toward the intake, which is
    // exactly the wrong move during the endgame scramble.
    const tan = tangentAt(game.geom[c.ci], game.state.chains[c.ci].balls[c.i].dist);
    for (const offset of [-0.7 * R, 0, 0.7 * R]) {
      const tx = c.p.x + tan.x * offset;
      const ty = c.p.y + tan.y * offset;
      const angle = Math.atan2(ty - game.level.shooter[1], tx - game.level.shooter[0]);
      const hit = firstHit(game, angle);
      if (hit && hit.ci === c.ci && game.state.chains[hit.ci].balls[hit.i].color === color) {
        return { angle };
      }
    }
  }
  return null;
}

export function runBot(levelId, seed, maxTicks, mode = 'expedition') {
  const game = createGame({ level: loadLevel(levelId), tuning, seed, mode });
  for (let t = 0; t < maxTicks && game.state.status === 'playing'; t++) {
    step(game, botInputs(game, t));
  }
  return game;
}

// ---------------------------------------------------------------- subcommands

function cmdProfile() {
  const globals = {};
  for (const k of Object.keys(tuning.global)) globals[k] = tuning.global[k].v;
  const rows = levelIds().map((id) =>
    profileFor(loadLevel(id), tuning.levels.find((r) => r.id === id), globals),
  );
  const cols = ['id', 'name', 'laneCount', 'lengthInDiameters', 'reactionBudgetSec', 'crossings', 'tightestTurnRadius', 'insideBoxFraction', 'shooterClearance'];
  console.log(cols.join('\t'));
  for (const r of rows) console.log(cols.map((c) => r[c]).join('\t'));
  return rows;
}

function cmdPlay() {
  const id = parseInt(arg('level', '1'), 10);
  const seed = parseInt(arg('seed', '1'), 10);
  const ticks = parseInt(arg('ticks', '90000'), 10);
  const mode = arg('mode', 'expedition');
  const game = runBot(id, seed, ticks, mode);
  const s = game.state;
  console.log(
    JSON.stringify(
      {
        level: id,
        seed,
        mode,
        status: s.status,
        ticks: s.tick,
        seconds: Math.round(s.tick / 120),
        score: s.score,
        destroyed: s.destroyed,
        gauge: Math.round(gaugeFraction(game) * 100) + '%',
        pressure: Math.round(pressureFraction(game) * 100) + '%',
        ballsLeft: s.chains.reduce((n, c) => n + c.balls.length, 0),
        hash: hashState(s),
      },
      null,
      2,
    ),
  );
}

function cmdHash() {
  const id = parseInt(arg('level', '1'), 10);
  const seed = parseInt(arg('seed', '1'), 10);
  const ticks = parseInt(arg('ticks', '20000'), 10);
  const game = createGame({ level: loadLevel(id), tuning, seed });
  for (let t = 0; t < ticks; t++) step(game, botInputs(game, t));
  console.log(hashState(game.state));
}

function cmdMonte() {
  const id = parseInt(arg('level', '1'), 10);
  const trials = parseInt(arg('trials', '200'), 10);
  let wins = 0;
  let totalSecs = 0;
  let powerups = 0;
  let spawns = 0;
  for (let i = 0; i < trials; i++) {
    const game = createGame({ level: loadLevel(id), tuning, seed: 1000 + i });
    for (let t = 0; t < 120000 && game.state.status === 'playing'; t++) {
      const evs = step(game, botInputs(game, t));
      for (const e of evs) if (e.type === 'spawn') spawns++;
    }
    for (const chain of game.state.chains) for (const b of chain.balls) if (b.powerup) powerups++;
    if (game.state.status === 'won') wins++;
    totalSecs += game.state.tick / 120;
  }
  console.log(
    JSON.stringify(
      { level: id, trials, winRate: wins / trials, meanSeconds: Math.round(totalSecs / trials) },
      null,
      2,
    ),
  );
}

const cmd = process.argv[2];
if (import.meta.url === `file://${process.argv[1]}`) {
  if (cmd === 'profile') cmdProfile();
  else if (cmd === 'play') cmdPlay();
  else if (cmd === 'hash') cmdHash();
  else if (cmd === 'monte') cmdMonte();
  else console.error('usage: simcli.js <profile|play|hash|monte> [--level N] [--seed N] [--ticks N]');
}
