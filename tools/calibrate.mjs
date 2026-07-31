#!/usr/bin/env node
// Runs the palette calibration loop to convergence.
//
//   bake -> measure residuals -> re-optimise -> bake -> ...
//
// One pass is not enough: the residual between the analytic model and the real bake
// depends on the colour being baked, so optimising against round N's residuals
// moves the palette and invalidates them. Two or three rounds settle it.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const run = (script, args = []) =>
  execFileSync('node', [script, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

const ROUNDS = Number(process.argv[2] || 3);

for (let r = 1; r <= ROUNDS; r++) {
  run('tools/bake.mjs');
  run('tools/measurefaces.mjs');
  const out = run('tools/palette.mjs', ['--write']);
  const worst = out.match(/deltaE ([\d.]+)/)?.[1];
  const cal = JSON.parse(readFileSync('content/face-calibration.json', 'utf8'));
  const drift = Math.max(...cal.slots.flatMap((s) => s.residual.map(Math.abs)));
  console.log(`round ${r}: predicted worst-case deltaE ${worst}, max residual ${drift.toFixed(1)}`);
}

run('tools/bake.mjs');
console.log('\nfinal palette:');
const tuning = JSON.parse(readFileSync('content/tuning.json', 'utf8'));
for (const c of tuning.palette.colors) console.log(`  ${c.key.padEnd(10)} ${c.hex}  ${c.glyph}`);
