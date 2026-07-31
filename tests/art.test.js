// Manifest-level art checks — the half of docs/graphics-protocol.md that needs no
// image decoding, so it runs inside the dependency-free suite on every push.
//
// The pixel-level gates (contrast, lane-band detail, colour-vision separation,
// small-size legibility) need a real rasteriser and live in tools/artgates.mjs.

import { readFileSync, existsSync } from 'node:fs';
import { suite, test, assert, eq, inRange } from './harness.js';
import { tuning } from './fixtures.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const manifest = existsSync(new URL('../assets/manifest.json', import.meta.url))
  ? read('assets/manifest.json')
  : null;

const CHAPTERS = [
  'boiler-deck', 'clockworks', 'pneumatic-exchange',
  'aether-observatory', 'airship-yards', 'spire-foundry',
];
const POWERUPS = ['fulminate', 'arc', 'reverse', 'governor', 'sightline'];

// Disk budget. Decoded-memory budget is gate G5 in tools/artgates.mjs.
const DISK_BUDGET_MB = 6;
const MIN_BALL_PX = 128; // authored well above the ~34px worst case (protocol R2)

suite('art manifest', () => {
  test('assets have been baked', () => {
    assert(manifest, 'assets/manifest.json missing — run `npm run bake`');
    assert(Object.keys(manifest.assets).length >= 20, 'suspiciously few assets');
  });

  test('every palette colour has a baked ball sprite', () => {
    for (const c of tuning.palette.colors) {
      const a = manifest.assets[`ball-${c.glyph}`];
      assert(a, `no baked ball for glyph "${c.glyph}"`);
      assert(a.width >= MIN_BALL_PX, `ball-${c.glyph} baked at ${a.width}px, below the ${MIN_BALL_PX}px authoring floor`);
      eq(a.width, a.height, 'ball sprites must be square');
    }
  });

  test('every powerup has a baked ring', () => {
    for (const k of POWERUPS) assert(manifest.assets[`powerup-${k}`], `no baked ring for ${k}`);
  });

  test('every chapter has a backdrop', () => {
    for (const c of CHAPTERS) assert(manifest.assets[`backdrop-${c}`], `no backdrop for ${c}`);
    eq(new Set(CHAPTERS).size, 6);
  });

  test('scene furniture and tiles are present', () => {
    for (const n of ['turret-body', 'turret-barrel', 'gate', 'intake', 'sleeper', 'plate', 'grain']) {
      assert(manifest.assets[n], `missing ${n}`);
    }
  });

  test('tiling textures are power-of-two square', () => {
    for (const n of ['plate', 'grain']) {
      const a = manifest.assets[n];
      eq(a.width, a.height, `${n} must be square to tile`);
      assert((a.width & (a.width - 1)) === 0, `${n} is ${a.width}px, not a power of two`);
    }
  });

  test('disk budget', () => {
    const mb = Object.values(manifest.assets).reduce((n, a) => n + a.bytes, 0) / 1024 / 1024;
    assert(mb <= DISK_BUDGET_MB, `assets total ${mb.toFixed(2)} MB, budget ${DISK_BUDGET_MB} MB`);
  });

  test('no asset is suspiciously tiny (a failed bake writes a near-empty PNG)', () => {
    for (const [name, a] of Object.entries(manifest.assets)) {
      assert(a.bytes > 400, `${name} is only ${a.bytes} bytes — bake likely failed`);
    }
  });
});

suite('palette provenance', () => {
  test('the palette records that it was optimised, not hand-picked', () => {
    assert(tuning.palette._optimisedBy, 'palette must carry its optimiser provenance');
    assert(typeof tuning.palette._worstDeltaE === 'number', 'palette must record its worst-case separation');
  });

  test('every colour keeps a distinct glyph — colour is never the only channel', () => {
    const glyphs = new Set(tuning.palette.colors.map((c) => c.glyph));
    eq(glyphs.size, tuning.palette.colors.length);
  });

  test('colours are valid hex and reasonably far apart in raw sRGB', () => {
    const rgb = (hex) => {
      assert(/^#[0-9a-f]{6}$/i.test(hex), `bad hex ${hex}`);
      return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    };
    const cols = tuning.palette.colors.map((c) => rgb(c.hex));
    for (let i = 0; i < cols.length; i++) {
      for (let j = i + 1; j < cols.length; j++) {
        const d = Math.hypot(...cols[i].map((v, k) => v - cols[j][k]));
        assert(d > 40, `${tuning.palette.colors[i].key}/${tuning.palette.colors[j].key} only ${Math.round(d)} apart in sRGB`);
      }
    }
  });

  test('face calibration exists and covers every slot', () => {
    const cal = read('content/face-calibration.json');
    eq(cal.slots.length, tuning.palette.colors.length, 'calibration must cover every palette slot');
    for (const s of cal.slots) {
      inRange(s.slot, 0, tuning.palette.colors.length - 1);
      eq(s.residual.length, 3);
    }
  });
});
