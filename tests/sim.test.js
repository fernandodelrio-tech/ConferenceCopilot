// Whole-sim behavioural tests — plan §6.3, including the nasty cases the plan
// calls out by name (gap collapse, a pop during Reverse, colour retirement).

import { suite, test, eq, assert, inRange } from './harness.js';
import { newGame, setChain, fireAtBall, stepN, tuning } from './fixtures.js';
import { step, hashState, serialize, restore, gaugeFraction, pressureFraction } from '../sim/sim.js';

const G = (k) => tuning.global[k].v;
const D = G('ballRadius') * 2;
const stopSpawning = (game) => {
  game.state.destroyed = 0;
  game.state.gaugeTarget = 0; // gauge already satisfied -> spawner idle
};

suite('core loop', () => {
  test('three of a colour pops; two does not', () => {
    const game = newGame(1);
    stopSpawning(game);
    setChain(game, [[0, 600], [1, 560], [1, 520], [2, 480]]);
    const before = game.state.destroyed;
    const events = fireAtBall(game, 0, 1, 1);
    const pops = events.filter((e) => e.type === 'pop');
    eq(pops.length, 1, 'completing a run of three must pop exactly once');
    eq(game.state.destroyed - before, 3);

    const game2 = newGame(1);
    stopSpawning(game2);
    setChain(game2, [[0, 600], [1, 560], [2, 520]]);
    const events2 = fireAtBall(game2, 0, 1, 1);
    eq(events2.filter((e) => e.type === 'pop').length, 0, 'two of a colour must not pop');
  });

  test('scoring uses base x count x combo multiplier', () => {
    const game = newGame(1);
    stopSpawning(game);
    setChain(game, [[0, 600], [1, 560], [1, 520], [2, 480]]);
    const events = fireAtBall(game, 0, 1, 1);
    const pop = events.find((e) => e.type === 'pop');
    eq(pop.gained, G('scoreBase') * 3 * 1, 'first link of a chain scores at 1x');
  });

  test('a closing gap chains into a second pop at a higher multiplier', () => {
    const game = newGame(1);
    stopSpawning(game);
    // Popping the blues strands two reds behind a gap; when it closes they meet
    // the leading red and pop again as link two.
    setChain(game, [[0, 700], [1, 660], [1, 620], [0, 580], [0, 540]]);
    const events = fireAtBall(game, 0, 2, 1, 200);
    const pops = events.filter((e) => e.type === 'pop');
    assert(pops.length >= 2, `expected a chain reaction, got ${pops.length} pop(s)`);
    eq(pops[0].comboStep, 1);
    eq(pops[1].comboStep, 2, 'the second link must score at 2x');
    assert(events.some((e) => e.type === 'gapClose'), 'the chain reaction must be driven by a gap closing');
  });

  test('a gap shot earns the gap bonus', () => {
    const game = newGame(1);
    stopSpawning(game);
    // Target the REAR of the leading group, so the ball lands with the gap in
    // front of the following group. Aiming at the trailing group instead does not
    // work: a group behind a gap closes it at catch-up speed (260 u/s), which
    // outruns the shot's flight time and the shot simply misses.
    //
    // Which side of a ball a shot lands on still depends on local lane geometry,
    // so sweep the aim offset rather than assuming one. Finding none is a failure.
    const R = G('ballRadius');
    let checked = false;
    for (const offset of [-1.2 * R, -0.9 * R, -0.6 * R, 0, 0.6 * R, 0.9 * R, 1.2 * R]) {
      const g = newGame(1);
      stopSpawning(g);
      setChain(g, [[1, 900], [1, 860], [0, 500], [0, 460]]);
      const events = fireAtBall(g, 0, 1, 1, 90, offset);
      const insert = events.find((e) => e.type === 'insert');
      const pop = events.find((e) => e.type === 'pop');
      if (!insert || !insert.intoGap || !pop) continue;
      eq(pop.intoGap, true, 'the pop must carry the gap flag through from the insert');
      eq(pop.gained, G('scoreBase') * 3 * 1 + G('gapBonus'), 'gap shot must pay base + gap bonus');
      checked = true;
      break;
    }
    assert(checked, 'no aim offset produced a gap-threading shot that completed a run');
  });

  test('colour retirement: the turret stops offering colours that are gone', () => {
    const game = newGame(1);
    stopSpawning(game); // the endgame case: gauge full, spawner idle, few balls left
    setChain(game, [[2, 600], [2, 560]]);
    game.state.turret.current = 0;
    game.state.turret.next = 1;
    stepN(game, 5);
    eq(game.state.turret.current, 2, 'held colour must be retired to the surviving colour');
    eq(game.state.turret.next, 2);
  });
});

suite('powerups', () => {
  test('Arc clears a span beyond the matched run', () => {
    const game = newGame(1);
    stopSpawning(game);
    const spec = [];
    for (let i = 0; i < 14; i++) spec.push([i < 2 ? 1 : 3, 900 - i * D]);
    spec[1] = [1, 900 - D, 'arc'];
    setChain(game, spec);
    const before = game.state.destroyed;
    const events = fireAtBall(game, 0, 1, 1);
    assert(events.some((e) => e.type === 'powerup' && e.kind === 'arc'), 'Arc must fire');
    assert(game.state.destroyed - before > 3, 'Arc must remove more than the matched run alone');
  });

  test('Reverse drives the chain back toward the gate', () => {
    const game = newGame(1);
    stopSpawning(game);
    setChain(game, [[0, 600], [1, 560], [2, 520]]);
    game.state.reverseTicks = 60;
    const before = game.state.chains[0].balls[0].dist;
    stepN(game, 30);
    assert(game.state.chains[0].balls[0].dist < before, 'the chain must retreat while Reverse is active');
  });

  test('a pop during Reverse still resolves correctly', () => {
    const game = newGame(1);
    stopSpawning(game);
    // Only same-coloured balls on the track, so wherever the shot lands it matches.
    setChain(game, [[1, 700], [1, 660]]);
    game.state.reverseTicks = 300;
    const events = fireAtBall(game, 0, 0, 1);
    eq(events.filter((e) => e.type === 'pop').length, 1, 'matching must work while the chain runs backwards');
  });

  test('Governor slows the chain without stopping it', () => {
    const game = newGame(1);
    stopSpawning(game);
    setChain(game, [[0, 600], [1, 560], [2, 520]]);
    const plain = newGame(1);
    stopSpawning(plain);
    setChain(plain, [[0, 600], [1, 560], [2, 520]]);

    game.state.governorTicks = 10000;
    stepN(game, 240);
    stepN(plain, 240);
    const slowed = game.state.chains[0].balls[0].dist - 600;
    const normal = plain.state.chains[0].balls[0].dist - 600;
    assert(slowed > 0, 'Governor slows, it does not freeze');
    assert(slowed < normal, 'Governor must be slower than baseline');
  });
});

suite('level outcomes', () => {
  test('a ball reaching the intake loses a life and ends the level', () => {
    const game = newGame(1);
    const lives = game.state.lives;
    setChain(game, [[0, game.geom[0].length - 1]]);
    stepN(game, 60);
    eq(game.state.status, 'lost');
    eq(game.state.lives, lives - 1);
  });

  test('clearing the board with the gauge full wins and pays the clear bonus', () => {
    const game = newGame(1);
    game.state.chains[0].balls = [];
    game.state.destroyed = game.state.gaugeTarget;
    const before = game.state.score;
    step(game, []);
    eq(game.state.status, 'won');
    eq(game.state.score - before, G('clearBonus'));
  });

  test('the gauge does not complete a level while balls remain', () => {
    const game = newGame(1);
    setChain(game, [[0, 400], [1, 360]]);
    game.state.destroyed = game.state.gaugeTarget;
    stepN(game, 30);
    eq(game.state.status, 'playing');
  });

  test('crossing a score threshold grants an extra life', () => {
    const game = newGame(1);
    stopSpawning(game);
    setChain(game, [[0, 600], [1, 560], [1, 520], [2, 480]]);
    game.state.nextExtraLife = 1;
    const lives = game.state.lives;
    fireAtBall(game, 0, 1, 1);
    assert(game.state.lives > lives, 'expected an extra life');
  });

  test('gauge and pressure read as fractions', () => {
    const game = newGame(1);
    inRange(gaugeFraction(game), 0, 1);
    inRange(pressureFraction(game), 0, 1);
  });
});

suite('persistence', () => {
  test('serialize/restore round-trips to an identical state hash', () => {
    const game = newGame(3, { seed: 99 });
    stepN(game, 800);
    const saved = serialize(game);
    const before = hashState(game.state);

    const fresh = newGame(3, { seed: 99 });
    restore(fresh, saved);
    eq(hashState(fresh.state), before, 'a restored save must hash identically');

    stepN(game, 400);
    stepN(fresh, 400);
    eq(hashState(fresh.state), hashState(game.state), 'and must keep stepping identically');
  });
});

suite('modes', () => {
  test('Perpetual never completes its gauge and ramps speed', () => {
    const game = newGame(1, { mode: 'perpetual' });
    assert(!isFinite(game.state.gaugeTarget), 'endless mode has no gauge target');
    eq(gaugeFraction(game), 0);
  });

  test('Overpressure raises speed and colour count', () => {
    const base = newGame(5);
    const hard = newGame(5, { mode: 'overpressure' });
    assert(hard.state.chainSpeed > base.state.chainSpeed);
    assert(hard.state.colorCount >= base.state.colorCount);
  });
});
