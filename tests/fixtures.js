import { readFileSync } from 'node:fs';
import { initTrig } from '../sim/trig.js';
import { createGame, step } from '../sim/sim.js';
import { tangentAt } from '../sim/lane.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));

export const tuning = read('content/tuning.json');
export const trig = read('content/trig.json');
initTrig(trig);

export const loadLevel = (id) => read(`content/lanes/${String(id).padStart(2, '0')}.json`);
export const levelIndex = read('content/lanes/index.json');

export function newGame(levelId = 1, opts = {}) {
  return createGame({ level: loadLevel(levelId), tuning, seed: 1, ...opts });
}

// Replace the board with an exact chain so a rule can be tested in isolation.
// `spec` is [[color, dist], ...] front-first.
export function setChain(game, spec, ci = 0) {
  game.state.chains[ci].balls = spec.map(([color, dist, powerup = null], i) => ({
    id: 1000 + i,
    color,
    dist,
    powerup,
  }));
  step(game, []); // one tick to refresh derived positions
  return game.state.chains[ci].balls;
}

// Fire `color` at the ball at index i. Returns every event seen over `ticks`.
// `offset` shifts the aim point along the lane tangent: positive aims at the
// intake side of the ball (so the shot lands AHEAD of it), negative aims behind.
export function fireAtBall(game, ci, i, color, ticks = 90, offset = 0) {
  const base = game.pos[ci][i];
  const tan = tangentAt(game.geom[ci], game.state.chains[ci].balls[i].dist);
  const p = { x: base.x + tan.x * offset, y: base.y + tan.y * offset };
  const angle = Math.atan2(p.y - game.level.shooter[1], p.x - game.level.shooter[0]);
  game.state.turret.current = color;
  game.state.turret.cooldown = 0;

  const seen = [];
  seen.push(...step(game, [{ type: 'aim', angle }, { type: 'fire' }]));
  for (let t = 0; t < ticks; t++) seen.push(...step(game, []));
  return seen;
}

export const stepN = (game, n, inputs = []) => {
  const seen = [];
  for (let i = 0; i < n; i++) seen.push(...step(game, inputs));
  return seen;
};
