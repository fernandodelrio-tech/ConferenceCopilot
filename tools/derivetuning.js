// Derives per-level chainSpeed and gaugeTarget from designed curves, and writes
// them into content/tuning.json.
//
// The difficulty model, after two wrong turns worth documenting:
//
//   Attempt 1 — hand-pick chainSpeed. Produced a reaction-budget curve of
//   76,92,161,209,111,126,116,162,20,66,149,186 seconds. Not a difficulty ramp.
//
//   Attempt 2 — derive chainSpeed from a monotonically FALLING reaction budget.
//   But lane length rises 5x across the roster, so short budgets on long lanes
//   demanded 202 units/s, i.e. a feed rate of 5 balls per second and chains
//   hundreds of balls long. Chain speed and feed rate are the same knob: one ball
//   enters per ball-diameter of advance.
//
//   Attempt 3 (this file) — the knob that actually sets pressure is FEED RATE, in
//   balls per second. It ramps gently. Reaction budget then falls out of lane
//   length and varies widely, which is correct: a long lane genuinely does give you
//   more thinking time, and its difficulty comes from ball count, colour count and
//   screen density instead. Reaction budget is band-checked against a playability
//   FLOOR rather than forced to be monotone.

import { readFileSync, writeFileSync } from 'node:fs';
import { buildLane } from '../sim/lane.js';

// Balls entering the track per second.
export const FEED_RATE = [0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1.0, 1.06, 1.12, 1.2];
// Intended time to fill the gauge with tidy play.
export const TARGET_DURATION_SEC = [95, 100, 105, 110, 115, 120, 125, 130, 135, 140, 145, 150];
// Balls destroyed per ball fed — above 1 because the player's own inserted balls
// and multi-ball pops both count toward the gauge.
const DESTROY_RATIO = 1.25;
export const REACTION_FLOOR_SEC = 45;

const tuning = JSON.parse(readFileSync('content/tuning.json', 'utf8'));
const D = tuning.global.ballRadius.v * 2;
const rows = [];

for (const row of tuning.levels) {
  const i = row.id - 1;
  const level = JSON.parse(readFileSync(`content/lanes/${String(row.id).padStart(2, '0')}.json`, 'utf8'));
  const longest = Math.max(...level.lanes.map((l) => buildLane(l.points).length));

  row.chainSpeed = Math.round(FEED_RATE[i] * D * 10) / 10;
  row.gaugeTarget = Math.round(FEED_RATE[i] * TARGET_DURATION_SEC[i] * DESTROY_RATIO);
  row.derivedFrom = `feedRate=${FEED_RATE[i]}/s targetDuration=${TARGET_DURATION_SEC[i]}s`;
  delete row.initialBalls_note;

  rows.push({ id: row.id, chainSpeed: row.chainSpeed, gauge: row.gaugeTarget, reaction: Math.round(longest / row.chainSpeed) });
}

writeFileSync('content/tuning.json', JSON.stringify(tuning, null, 2) + '\n');
for (const r of rows) {
  const flag = r.reaction < REACTION_FLOOR_SEC ? '  <-- BELOW FLOOR' : '';
  console.log(`L${String(r.id).padStart(2)}  chainSpeed=${String(r.chainSpeed).padStart(5)}  gauge=${String(r.gauge).padStart(4)}  reactionBudget=${String(r.reaction).padStart(4)}s${flag}`);
}
