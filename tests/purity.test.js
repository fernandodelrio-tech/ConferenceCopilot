// Enforces the architectural boundary from plan §3.1/§3.2 mechanically, because a
// boundary that is only written down in a design doc is a boundary that erodes.

import { readdirSync, readFileSync } from 'node:fs';
import { suite, test, assert } from './harness.js';

const dir = new URL('../sim/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.js'));

const BANNED = [
  { re: /\bMath\.random\b/, why: 'sim must use the seeded PRNG in sim/rng.js' },
  { re: /\bMath\.(sin|cos|tan|atan2)\b/, why: 'sim must use the table in sim/trig.js (engine trig is not bit-identical)' },
  { re: /\bnew Date\b|\bDate\.now\b/, why: 'sim must be a pure function of (state, inputs)' },
  { re: /\bperformance\.now\b/, why: 'sim runs on a fixed timestep, never wall clock' },
  { re: /from\s+['"]\.\.\/(render|platform)\//, why: 'sim must not depend on rendering or platform code' },
];

suite('sim purity', () => {
  for (const file of files) {
    test(`sim/${file} obeys the boundary`, () => {
      // Strip comments first: the modules discuss these very identifiers in their
      // header notes, and a scanner that reads prose reports its own documentation.
      const src = readFileSync(new URL(file, dir), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
      for (const rule of BANNED) {
        const m = src.match(rule.re);
        assert(!m, `sim/${file} contains ${m && m[0]} — ${rule.why}`);
      }
    });
  }

  test('sim/ exists and is non-trivial', () => {
    assert(files.length >= 5, `expected the sim to be split into modules, found ${files.length}`);
  });
});
