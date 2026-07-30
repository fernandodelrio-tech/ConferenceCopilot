// Difficulty-profile bands (§6.2), the §3.5 aspect-fit rule, and the Monte-Carlo
// distribution checks (§6.4).
//
// These bands are DESIGN INTENT, not REF measurements — Phase 0 has not been run.
// They still do real work: every band here was violated by a build of the roster,
// and each violation was a genuine defect (a lane traced over itself, corners
// tighter than a ball, a 20-second reaction budget next to a 209-second one).

import { suite, test, assert, eq, inRange } from './harness.js';
import { tuning, loadLevel } from './fixtures.js';
import { profileFor } from '../sim/profile.js';
import { newGame } from './fixtures.js';
import { step } from '../sim/sim.js';

const globals = {};
for (const k of Object.keys(tuning.global)) globals[k] = tuning.global[k].v;

const BALL_D = globals.ballRadius * 2;
const IDS = tuning.levels.map((r) => r.id);
const profiles = IDS.map((id) => profileFor(loadLevel(id), tuning.levels.find((r) => r.id === id), globals));

// Bands
const REACTION_FLOOR_SEC = 45;   // below this a level is a death sentence, not a puzzle
const MIN_TURN_RADIUS = 60;      // 1.5 ball diameters; tighter and the chain overlaps itself
const MAX_CROSSINGS = 12;        // above this a lane is unreadable (and hints at a retrace)
const MIN_TURRET_CLEARANCE = 90; // turret must not sit on the track
const MIN_LENGTH_DIAMETERS = 40;

suite('level geometry bands', () => {
  for (const p of profiles) {
    test(`L${p.id} ${p.name}`, () => {
      eq(p.insideBoxFraction, 1, '§3.5: all gameplay geometry must sit inside the 16:10 box');
      assert(p.tightestTurnRadius >= MIN_TURN_RADIUS, `turn radius ${p.tightestTurnRadius} < ${MIN_TURN_RADIUS}`);
      assert(p.crossings <= MAX_CROSSINGS, `${p.crossings} crossings is unreadable / suggests a retraced lane`);
      assert(p.shooterClearance >= MIN_TURRET_CLEARANCE, `turret clearance ${p.shooterClearance}`);
      assert(p.lengthInDiameters >= MIN_LENGTH_DIAMETERS, `lane holds only ${p.lengthInDiameters} balls`);
      assert(p.reactionBudgetSec >= REACTION_FLOOR_SEC, `reaction budget ${p.reactionBudgetSec}s is below the floor`);
    });
  }
});

suite('difficulty ramp', () => {
  test('feed rate rises monotonically across the roster', () => {
    let prev = 0;
    for (const row of tuning.levels) {
      const feed = row.chainSpeed / BALL_D;
      assert(feed > prev, `L${row.id} feed rate ${feed} did not rise above ${prev}`);
      prev = feed;
    }
  });

  test('gauge target rises monotonically', () => {
    let prev = 0;
    for (const row of tuning.levels) {
      assert(row.gaugeTarget > prev, `L${row.id} gauge ${row.gaugeTarget} did not rise above ${prev}`);
      prev = row.gaugeTarget;
    }
  });

  test('colour count is non-decreasing and within the palette', () => {
    let prev = 0;
    for (const row of tuning.levels) {
      assert(row.colors >= prev, `L${row.id} colour count went backwards`);
      assert(row.colors <= tuning.palette.colors.length, `L${row.id} wants more colours than the palette has`);
      prev = row.colors;
    }
  });

  test('every level has a distinct name and a chapter', () => {
    const names = new Set();
    for (const p of profiles) {
      assert(!names.has(p.name), `duplicate level name ${p.name}`);
      names.add(p.name);
      inRange(p.chapter, 1, 6);
    }
  });

  test('the roster covers every chapter', () => {
    eq(new Set(profiles.map((p) => p.chapter)).size, 6);
  });
});

suite('palette', () => {
  test('every colour carries a distinct glyph (§3.4 — colour is never the only channel)', () => {
    const glyphs = new Set(tuning.palette.colors.map((c) => c.glyph));
    eq(glyphs.size, tuning.palette.colors.length, 'glyphs must be unique per colour');
  });

  test('no two ball colours are near-identical in sRGB', () => {
    const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const cols = tuning.palette.colors.map((c) => rgb(c.hex));
    for (let i = 0; i < cols.length; i++) {
      for (let j = i + 1; j < cols.length; j++) {
        const d = Math.hypot(cols[i][0] - cols[j][0], cols[i][1] - cols[j][1], cols[i][2] - cols[j][2]);
        assert(d > 60, `${tuning.palette.colors[i].key} and ${tuning.palette.colors[j].key} are too close (${Math.round(d)})`);
      }
    }
  });
});

suite('monte-carlo distributions', () => {
  test('powerup spawn rate matches its tuned probability', () => {
    // Pooled across levels; asserted against binomial noise rather than a made-up
    // tolerance, so the test neither flakes nor sleeps through a real regression.
    let spawns = 0;
    let powerups = 0;
    let expected = 0;

    for (const id of [1, 5, 9, 12]) {
      const row = tuning.levels.find((r) => r.id === id);
      const game = newGame(id, { seed: 4242 + id });
      for (let t = 0; t < 40000; t++) {
        if (game.state.status !== 'playing') break;
        for (const e of step(game, [])) {
          if (e.type === 'spawn') {
            spawns++;
            expected += row.powerupChance;
            if (e.powerup) powerups++;
          }
        }
      }
    }

    assert(spawns > 300, `only ${spawns} spawns observed — sample too small to mean anything`);
    const p = expected / spawns;
    const sigma = Math.sqrt((p * (1 - p)) / spawns);
    const observed = powerups / spawns;
    assert(
      Math.abs(observed - p) <= 4 * sigma + 0.005,
      `powerup rate ${observed.toFixed(4)} vs expected ${p.toFixed(4)} (4 sigma = ${(4 * sigma).toFixed(4)})`,
    );
  });

  test('every powerup kind actually occurs', () => {
    // Pooled across seeds. A single run yields ~15 powerups, and at that sample
    // size missing one of five kinds by chance is a ~16% event — the first version
    // of this test was measuring luck, not coverage.
    const seen = new Set();
    let sample = 0;
    for (let seed = 0; seed < 8; seed++) {
      const game = newGame(12, { seed: 31337 + seed * 101 });
      for (let t = 0; t < 40000; t++) {
        if (game.state.status !== 'playing') break;
        for (const e of step(game, [])) {
          if (e.type === 'spawn' && e.powerup) {
            seen.add(e.powerup);
            sample++;
          }
        }
      }
    }
    assert(sample > 60, `sample of ${sample} powerups is too small to conclude anything`);
    eq(seen.size, 5, `only saw ${[...seen].join(', ')} across ${sample} powerups`);
  });
});
