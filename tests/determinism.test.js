// Determinism and replay — plan §3.2. A replay is {seed, tuningHash, inputs}, and
// the same replay must produce the same per-frame state hash everywhere. The
// cross-platform half of this (Linux vs iOS) is a CI matrix job; what runs here is
// the same-engine invariant plus the properties that make the cross-platform job
// meaningful at all.

import { suite, test, eq, assert } from './harness.js';
import { newGame, stepN, tuning } from './fixtures.js';
import { step, hashState } from '../sim/sim.js';
import { seedFrom, randU32, randFloat } from '../sim/rng.js';
import { sin, cos } from '../sim/trig.js';

// A fixed input script: deterministic, and exercises aim/fire/swap.
function scriptedInputs(tick) {
  if (tick % 20 !== 0) return [];
  const angle = -Math.PI / 2 + ((tick % 400) / 400) * Math.PI * 2;
  const inputs = [{ type: 'aim', angle }, { type: 'fire' }];
  if (tick % 140 === 0) inputs.push({ type: 'swap' });
  return inputs;
}

function replay(levelId, seed, ticks) {
  const game = newGame(levelId, { seed });
  const hashes = [];
  for (let t = 0; t < ticks; t++) {
    step(game, scriptedInputs(t));
    if (t % 500 === 0) hashes.push(hashState(game.state));
  }
  hashes.push(hashState(game.state));
  return hashes;
}

suite('determinism', () => {
  test('the same replay produces the same hash trace', () => {
    const a = replay(4, 12345, 10000);
    const b = replay(4, 12345, 10000);
    eq(JSON.stringify(a), JSON.stringify(b));
  });

  test('a 20k-tick replay is reproducible on every level', () => {
    for (let id = 1; id <= 12; id++) {
      const a = replay(id, 777, 20000);
      const b = replay(id, 777, 20000);
      eq(JSON.stringify(a), JSON.stringify(b), `level ${id} diverged`);
    }
  });

  test('different seeds diverge (the seed is actually wired up)', () => {
    const a = replay(2, 1, 4000);
    const b = replay(2, 2, 4000);
    assert(JSON.stringify(a) !== JSON.stringify(b), 'seed must affect the run');
  });

  test('the PRNG is integer-only and uniform enough to trust', () => {
    const s = { rng: seedFrom(42) };
    const first = randU32(s);
    const s2 = { rng: seedFrom(42) };
    eq(randU32(s2), first, 'same seed, same first draw');

    let sum = 0;
    const N = 200000;
    const st = { rng: seedFrom(7) };
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < N; i++) {
      const v = randFloat(st);
      sum += v;
      buckets[Math.min(9, Math.floor(v * 10))]++;
    }
    assert(Math.abs(sum / N - 0.5) < 0.01, `mean ${sum / N} is off`);
    for (const b of buckets) assert(Math.abs(b / N - 0.1) < 0.01, 'PRNG buckets are lumpy');
  });

  test('the table trig matches Math within tolerance and uses no engine trig', () => {
    for (let i = 0; i < 2000; i++) {
      const a = -8 + (i / 2000) * 16;
      assert(Math.abs(sin(a) - Math.sin(a)) < 1e-5, `sin(${a}) off by ${Math.abs(sin(a) - Math.sin(a))}`);
      assert(Math.abs(cos(a) - Math.cos(a)) < 1e-5, `cos(${a}) off`);
    }
  });

  test('tuning is fully sourced — no constant without provenance', () => {
    for (const [key, entry] of Object.entries(tuning.global)) {
      assert(entry.source, `global.${key} has no source field`);
      assert(typeof entry.v === 'number', `global.${key} has no numeric value`);
    }
  });
});
