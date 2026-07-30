// Behavioural rule tables — plan §6.3. Given a board and an action, assert the
// exact resulting board. These are the tests the fidelity claim actually rests on.

import { suite, test, eq, assert, near } from './harness.js';
import { runAround, insertAgainst, compactBehind, gapFlags, groupIndices, touching, comboMultiplier, calloutFor } from '../sim/rules.js';

const D = 40;
const chain = (spec) => spec.map(([color, dist], i) => ({ id: i + 1, color, dist, powerup: null }));
const dists = (balls) => balls.map((b) => Math.round(b.dist * 100) / 100);
const colors = (balls) => balls.map((b) => b.color);

suite('chain rules', () => {
  test('touching respects the contact epsilon', () => {
    eq(touching({ dist: 100 }, { dist: 60 }, D), true, 'exactly one diameter apart is touching');
    eq(touching({ dist: 100 }, { dist: 20 }, D), false, 'two diameters apart is a gap');
  });

  test('gapFlags marks only real gaps', () => {
    const balls = chain([[0, 200], [0, 160], [1, 80], [1, 40]]);
    eq(JSON.stringify(gapFlags(balls, D)), JSON.stringify([false, false, true, false]));
  });

  test('groupIndices partitions the chain at gaps', () => {
    const balls = chain([[0, 200], [0, 160], [1, 80], [1, 40]]);
    eq(JSON.stringify(groupIndices(balls, D).groups), JSON.stringify([0, 0, 1, 1]));
  });

  test('a run stops at a gap even when the colour continues', () => {
    // Three reds, but the third is across a gap: NOT a match.
    const balls = chain([[0, 200], [0, 160], [0, 80]]);
    const run = runAround(balls, 0, D);
    eq(run.count, 2, 'colour alone must not bridge a gap');
  });

  test('a run spans contiguous same-colour balls', () => {
    const balls = chain([[1, 240], [0, 200], [0, 160], [0, 120], [1, 80]]);
    const run = runAround(balls, 2, D);
    eq(run.start, 1);
    eq(run.end, 3);
    eq(run.count, 3);
  });

  test('insertion displaces the REAR backwards, never the front', () => {
    const balls = chain([[0, 200], [1, 160], [2, 120]]);
    const frontBefore = balls[0].dist;
    insertAgainst(balls, 1, false, { id: 99, color: 3, dist: 0, powerup: null }, D, Infinity);
    eq(balls.length, 4);
    eq(balls[0].dist, frontBefore, 'the frontmost ball must not move on insertion');
    eq(JSON.stringify(dists(balls)), JSON.stringify([200, 160, 120, 80]));
    eq(JSON.stringify(colors(balls)), JSON.stringify([0, 1, 3, 2]));
  });

  test('insertion ahead of the frontmost ball extends toward the intake', () => {
    const balls = chain([[0, 200], [1, 160]]);
    insertAgainst(balls, 0, true, { id: 99, color: 2, dist: 0, powerup: null }, D, Infinity);
    eq(balls[0].dist, 240, 'attaching in front is the one way a shot loses you ground');
    eq(balls[0].color, 2);
  });

  test('threading a gap is flagged for the gap bonus', () => {
    const balls = chain([[0, 300], [1, 200], [2, 160]]);
    const plain = insertAgainst(chain([[0, 200], [1, 160]]), 0, false, { id: 9, color: 5, dist: 0, powerup: null }, D, Infinity);
    eq(plain.intoGap, false, 'a shot into a packed chain is not a gap shot');
    const gapped = insertAgainst(balls, 1, true, { id: 9, color: 5, dist: 0, powerup: null }, D, Infinity);
    eq(gapped.intoGap, true, 'a shot landing between two separated groups is a gap shot');
  });

  test('the feed pipe is finite: overflow transfers to the forward section', () => {
    // Pipe holds 2 diameters. Rear already at the gate, so insertion must overflow.
    const balls = chain([[0, 40], [1, 0]]);
    const pipeDepth = 2 * D;
    insertAgainst(balls, 1, false, { id: 9, color: 2, dist: 0, powerup: null }, D, pipeDepth);
    eq(balls.length, 3);
    eq(balls[balls.length - 1].dist >= -pipeDepth - 0.001, true, 'rear must not exceed pipe depth');
    eq(balls[0].dist, 40, 'within pipe capacity the front still does not move');

    const packed = chain([[0, 40], [1, 0], [2, -40], [3, -80]]);
    const frontBefore = packed[0].dist;
    insertAgainst(packed, 3, false, { id: 9, color: 4, dist: 0, powerup: null }, D, pipeDepth);
    assert(packed[0].dist > frontBefore, 'once the pipe is packed, further insertion must cost ground');
  });

  test('compactBehind never leaves an overlap', () => {
    const balls = chain([[0, 200], [1, 190], [2, 185]]);
    compactBehind(balls, 0, D);
    for (let i = 1; i < balls.length; i++) {
      assert(balls[i - 1].dist - balls[i].dist >= D - 1e-9, `overlap at index ${i}`);
    }
  });

  test('combo multiplier saturates at the cap', () => {
    eq(comboMultiplier(1, 8), 1);
    eq(comboMultiplier(5, 8), 5);
    eq(comboMultiplier(12, 8), 8);
  });

  test('callouts start at the second link, not the first', () => {
    eq(calloutFor(1), null, 'a plain match is not a combo');
    assert(typeof calloutFor(2) === 'string');
    assert(typeof calloutFor(9) === 'string');
  });
});
