// Chain manipulation rules. Pure array operations — no state, no geometry, no RNG,
// which is what makes them cheap to table-test (§6.3).
//
// Convention throughout: a chain is an array of balls sorted DESCENDING by `dist`,
// so index 0 is the frontmost ball (nearest the furnace intake) and the last index
// is the rearmost (nearest the escapement gate).

export const TOUCH_EPS = 0.5;

export function touching(front, back, D) {
  return front.dist - back.dist <= D + TOUCH_EPS;
}

// gapBefore[i] === true means there is open track between ball i-1 and ball i.
export function gapFlags(balls, D) {
  const flags = new Array(balls.length).fill(false);
  for (let i = 1; i < balls.length; i++) flags[i] = !touching(balls[i - 1], balls[i], D);
  return flags;
}

export function groupIndices(balls, D) {
  const flags = gapFlags(balls, D);
  const groups = new Array(balls.length).fill(0);
  for (let i = 1; i < balls.length; i++) groups[i] = groups[i - 1] + (flags[i] ? 1 : 0);
  return { groups, flags };
}

// Push the rear of the chain backwards so nothing overlaps. Balls shoved past the
// gate take negative dist and sit in the feed pipe.
export function compactBehind(balls, fromIndex, D) {
  for (let j = Math.max(fromIndex + 1, 1); j < balls.length; j++) {
    const maxDist = balls[j - 1].dist - D;
    if (balls[j].dist > maxDist) balls[j].dist = maxDist;
  }
}

// Shift an entire chain along the track. Used for feed-pipe overflow.
export function shiftChain(balls, delta) {
  for (const b of balls) b.dist += delta;
}

// The run of same-coloured balls in unbroken contact with balls[index].
// Contact matters: same colour either side of a gap is NOT a match.
export function runAround(balls, index, D) {
  if (index < 0 || index >= balls.length) return null;
  const color = balls[index].color;
  let start = index;
  let end = index;
  while (start > 0 && balls[start - 1].color === color && touching(balls[start - 1], balls[start], D)) start--;
  while (end < balls.length - 1 && balls[end + 1].color === color && touching(balls[end], balls[end + 1], D)) end++;
  return { start, end, count: end - start + 1, color };
}

// Insert `ball` against balls[hitIndex]. `ahead` means the shot arrived on the
// furnace side of that ball. Returns where it landed and whether the shot threaded
// an existing gap (which earns the gap bonus, §0.3 scoring).
// Which way insertion displaces the chain is the single most consequential rule in
// the game, and both obvious answers are wrong:
//
//   - Push the FORWARD section toward the intake, and every shot costs a ball
//     diameter of ground. 50-odd shots then cross a whole lane regardless of chain
//     speed, and the level is unwinnable. Measured: level 1 lost in 8 seconds.
//   - Push the REAR back with an unbounded feed pipe, and shots are entirely free.
//     A bot stuffed 1478 balls into the pipe and the level could never end.
//
// The threat in this genre is TIME — the front advances at chain speed, and rear
// length does not move it. So insertion shoves the rear back toward the gate, but
// the pipe is finite: once packed, further displacement transfers to the forward
// section, so a player who fires junk indefinitely does eventually pay for it.
//
// `pipeDepth` is DESIGN-ESTIMATE and is exactly the kind of constant Phase 0 (§2.2)
// exists to replace with a measurement.
export function insertAgainst(balls, hitIndex, ahead, ball, D, pipeDepth = Infinity) {
  let k;
  let intoGap = false;

  if (ahead) {
    k = hitIndex;
    if (k === 0) {
      ball.dist = balls[0].dist + D;
    } else {
      intoGap = !touching(balls[k - 1], balls[k], D);
      ball.dist = balls[k - 1].dist - D;
    }
  } else {
    k = hitIndex + 1;
    if (k < balls.length) intoGap = !touching(balls[hitIndex], balls[k], D);
    ball.dist = balls[hitIndex].dist - D;
  }

  balls.splice(k, 0, ball);
  compactBehind(balls, k, D);

  const overflow = -balls[balls.length - 1].dist - pipeDepth;
  if (overflow > 0) shiftChain(balls, overflow);

  return { index: k, intoGap };
}

export function comboMultiplier(step, cap) {
  return Math.min(Math.max(step, 1), cap);
}

// Callout tiers for §3.7 audio and the HUD. Original vocabulary (§0.3).
export function calloutFor(step) {
  if (step <= 1) return null;
  if (step === 2) return 'DOUBLE FIRING';
  if (step === 3) return 'TRIPLE FIRING';
  if (step === 4) return 'CASCADE';
  if (step === 5) return 'OVERDRIVE';
  return 'FULL PRESSURE';
}
