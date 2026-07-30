// Emits content/trig.json — a fixed sine table used by sim/trig.js.
//
// Why this exists: Math.sin/Math.cos are not bit-identical across JS engines, and
// the sim must produce identical state hashes on Linux (CI/Deck) and iOS (§3.2).
// Baking the table into data means the sim only ever does mul/add, which IS
// IEEE-754 deterministic. Run once; the output is committed.

import { writeFileSync, mkdirSync } from 'node:fs';

const N = 1024; // quarter-cycle resolution; sinLerp() interpolates between entries
const table = [];
for (let i = 0; i <= N; i++) table.push(Math.sin((i / N) * (Math.PI / 2)));

mkdirSync('content', { recursive: true });
writeFileSync(
  'content/trig.json',
  JSON.stringify({ _generated: 'tools/gentrig.js', quarterSteps: N, sinQuarter: table }),
);
console.log(`content/trig.json: ${table.length} entries`);
