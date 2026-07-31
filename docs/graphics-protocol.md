# Graphics Production Protocol

**Status:** active · **Owner:** TBD · **Applies to:** every shipped visual asset
**Companion to:** `docs/game-design-master-plan.md` §3.4 (Art Bible) and §10 (Accessibility)

---

## 0. Why this document exists

A first pass at this game shipped visuals made of runtime `createRadialGradient` calls
and stroked paths. It ran, it obeyed the composition rules, and it looked rudimentary
— because "draw a circle with a gradient" is not an asset, it is a placeholder that
never got replaced.

This protocol exists so that never happens by default. It defines how assets are
produced, what "good" means in numbers rather than adjectives, and which gates block
a build.

Its central claim: **the things that most reliably make 2D look cheap are measurable.**
Flat lighting, desaturated colour, banding, backdrop noise competing with gameplay,
and unreadable small sizes are all quantities. So they get gates, not opinions.

---

## 1. The pipeline

```
  art/lib/shade.js      physically-motivated shading library (authoring only)
  art/bakers.js         one baker per asset — pure functions of (params) -> pixels
  tools/bake.mjs        runs the bakers in Chromium, writes assets/generated/*.png
  tools/measurefaces.mjs  measures what the bake ACTUALLY produced
  tools/palette.mjs     optimises the ball palette against measured output
  tools/calibrate.mjs   runs bake -> measure -> optimise to a fixed point
  tools/artgates.mjs    the blocking quality gates
  render/               blits the baked result; no per-pixel work at runtime
```

Four rules govern it.

**R1 — Assets are authored, then baked, never computed per frame.**
Shading costs whatever it costs at bake time and nothing at runtime. This is what
lets the ball carry a real environment probe, a refracted interior and a bevelled
engraving while still fitting the iPhone 16 thermal budget (§9). Anything in
`render/` that computes per-pixel appearance is a bug.

**R2 — Author at 8x the largest shipped size.**
Balls bake at 192px for a ~34px worst case. Backdrops are the exception and bake at
half the reference box: they are entirely low-frequency, and baking them at full
size cost 3 MB each in PNG for detail no one can resolve.

**R3 — One lighting rig, fixed, for every asset.**
`art/lib/shade.js` defines KEY (warm gaslight, upper-left), FILL (cool bounce,
lower-right), RIM (cold backlight) and an environment probe. Every baker uses it
unmodified. Assets lit by different rigs read as a collage no matter how good each
one is in isolation.

**R4 — The gates run on rendered pixels, not on source values.**
See §3. This is the rule that was learned the hard way.

---

## 2. Quality bar, per asset class

| Class | Requirement |
|---|---|
| **Balls** | Real sphere normal, key/fill/rim, environment probe, refracted interior with a caustic, thin brass cage never covering more than the outer 12% of radius, glyph engraved with a three-pass bevel (lit far edge, groove, occluded near lip) |
| **Track** | Textured plate, ambient occlusion halo, inner-shadow channel, rotated sleepers, rail rivets — all pre-composited once per level, never per frame |
| **Backdrops** | Large low-frequency forms only; volumetric shafts and gaslight pools for depth; contrast kept far below the balls |
| **Furniture** | Gate and intake carry their own material, soot and bolt detail; emissive parts are left to the runtime so they land in the bloom pass |
| **Frame** | Bloom driven by a dedicated emissive buffer, vignette, film grain. Grain is not decoration — it is what hides banding in dark gradients |
| **UI** | Never bloomed, never grained. Chrome must stay crisp |

---

## 3. The lesson that shaped this protocol

**Optimising source colours is worthless. Optimise what reaches the screen.**

The ball palette must keep six colours mutually distinguishable for players with
normal colour vision and for protanopes, deuteranopes and tritanopes. Hand-picked
colours failed immediately — gate G3 measured cobalt and violet at ΔE 9.6 under
protanopia, and the obvious fix (lighten the violet) collapsed it against gold under
tritanopia instead. Hue is precisely the channel dichromats lose, so the palette has
to be spread in **lightness** too, and balancing six colours across four vision
models is a search problem, not a judgement call. Hence `tools/palette.mjs`.

Then the search produced a palette with worst-case separation of ΔE 34 — and the
gate, measuring the baked balls, reported **ΔE 5**.

The shading pipeline was the culprit. An ACES-style filmic tonemap compresses each
channel independently and begins compressing early, so saturated colours desaturate
toward grey; a near-neutral swatch (`#807864`) rendered *lighter* than its own albedo
(`#b0a992`). A caustic term running at 3.4x blew a near-white hotspot across a third
of every face. An additive, colour-independent environment reflection pulled every
hue toward a common point.

Three fixes followed, each of which is now a rule:

1. **Soft-knee tonemap.** Linear through the mid-tones where a ball's face lives,
   compressing only highlights.
2. **`envScale` on dielectrics.** Metals want a full environment reflection — it is
   most of what makes brass look like brass. Coloured glass wants a third of it.
3. **Colour-preserving interior.** The depth and caustic terms multiply albedo, so
   they deepen a ball's own colour instead of washing toward white.

Even after those fixes the palette took three attempts, and the two failures are
worth recording because both looked reasonable:

1. **Optimise source hexes** (`tools/palette.mjs`). Promised worst-case ΔE 34;
   the gate measured ΔE 5 on the baked balls. The forward model was the problem, not
   the optimiser.
2. **Optimise against an analytic model, corrected by a measured per-slot residual**
   (`tools/measurefaces.mjs` + `tools/calibrate.mjs`). The assumption was that the
   residual is a per-slot constant, since palette slot *i* always carries glyph *i*.
   It is not — the residual is strongly colour-dependent, so the loop optimised
   confidently against a wrong model and **diverged**, converging on a palette with
   orange and red separated by ΔE 1.3 under deuteranopia. Worse than the start.
3. **Hill-climb on measured pixels** (`tools/palettesearch.mjs`). Every evaluation
   bakes the six balls and measures them, at roughly three seconds a step. Slower per
   evaluation and correct by construction, because it optimises the number the gate
   reports. Seeded from the published Okabe-Ito CVD-safe palette rather than from
   random, so the search starts inside a good basin.

The rule that survives all three: **never optimise against a model of your renderer
when you can measure the renderer.** Both failures were silent — the images looked
fine, and only the gate could tell.

None of this is visible on a single ball. All of it is visible to a deuteranope
under time pressure.

---

## 4. The gates

`npm run gates` (`tools/artgates.mjs`). Blocking. Run in CI on every push.

| ID | Gate | Threshold | Rationale |
|---|---|---|---|
| **G1** | Ball-to-track contrast | ≥ 3.0:1 | Below this a ball fades into the scene at speed |
| **G2** | Lane-band local luminance σ | ≤ 26 | The §3.4 restraint rule, measured. Above this the track competes with the balls |
| **G3** | Colour separation, worst pair, across normal/protan/deutan/tritan | ΔE ≥ 18 | The palette must not depend on hue alone |
| **G4** | Same, after downscaling to 24px; plus glyph luminance modulation | ΔE ≥ 16, σ ≥ 12 | 24px is a ball on an iPhone 16 at the tightest fit |
| **G5** | Decoded texture memory | ≤ 32 MB | Thermal and jetsam headroom |

Manifest-level checks (asset presence, dimensions, disk budget) live in
`tests/art.test.js` and run in the dependency-free suite.

### Measuring correctly is half the gate

Two gate bugs are worth recording, because both reported art defects that did not
exist:

- **G2 sampled a square window.** A ball's footprint is a disc; the square's corners
  reached past the clean corridor into the rails and inner shadow, so a flat bed
  (plate tile σ measured 0.6) was reported at σ 27. It samples a disc now.
- **G2 sampled through the gate and intake.** Those are functional landmarks and are
  *meant* to be detailed. A few very high-variance windows dominated the mean. The
  furniture zone is excluded now.

Investigating the first of those found a genuine art defect underneath: the clean
corridor punched through the sleepers was **narrower than a ball**, so sleepers ran
under the outer edge of every ball on the track.

---

## 5. Working practice

1. **Change a baker → re-bake → run the gates.** Never eyeball a shading change; it
   is exactly the class of change whose damage is invisible per-object and obvious in
   aggregate.
2. **Touch the palette → run `tools/calibrate.mjs`,** not `tools/palette.mjs` alone.
3. **Adding an asset class** means adding its baker, its manifest entry, its
   `tests/art.test.js` expectation, and — if it can occlude gameplay — a G2-style
   gate. An asset with no gate will drift.
4. **Contact-sheet review** (`npm run sheet`) before any visual sign-off: every asset
   at authoring size plus every ball at 48/32/24/16px.
5. **Thresholds are negotiable; changing one silently is not.** If a gate is wrong,
   fix the gate and write down why in this document, as §4 does. Loosening a
   threshold to make a build pass is the one prohibited move.

---

## 6. What this protocol does not cover

Under the plan's §0.4 clean-room process, shipped art is meant to be produced by
artists who have never seen the reference, with an originality review per asset.
Everything in this repo is procedurally authored instead. That is a legitimate way to
build a strong, coherent, original look — and it is not a substitute for an art team.

Specifically out of scope here: hand-authored illustration, character work, animation,
a full VFX library, and the originality review gate itself. What this protocol
guarantees is that whatever art arrives, its quality is measured rather than asserted.
