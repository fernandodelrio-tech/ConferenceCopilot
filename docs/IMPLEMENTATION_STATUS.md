# Implementation status

**What was asked:** implement the master plan (`docs/game-design-master-plan.md`).
**What that plan describes:** ~10–12 months of work for 4–6 people, including human
playtest rounds, legal review, and two store submissions.

This document is the honest ledger of what actually exists in this repo, what does
not, and — importantly — which parts I *could not* do rather than merely did not.

---

## 1. The one thing that changes how you should read everything else

**Phase 0 was not executed, and could not be.** Phase 0 (§2) is the measurement pass:
capture REF at 60fps lossless, frame-count every speed and timing, and write each
constant into `content/tuning.json` with a spec reference. I have no access to the
original game, no capture, and no way to measure it.

So every constant in `content/tuning.json` is marked `DESIGN-ESTIMATE`. They were
chosen by design judgement and then tuned until the game plays well, which is a
completely different activity from matching a reference.

**Consequence: the §0.2 fidelity tolerance table is UNVERIFIED.** Not failed —
unverified. Nothing here is evidence that chain speed is within ±3% of REF, because
no measurement of REF exists to compare against. What *is* verified is that the
game is internally consistent, deterministic, and plays the genre's mechanics
correctly. Treat this as a working implementation of the plan's architecture and
mechanics, ready for Phase 0 to replace the estimates — not as a fidelity claim.

---

## 2. What is built and working

| Plan item | State | Where |
|---|---|---|
| **M0 skeleton** — sim/render/platform split, fixed 120Hz loop, determinism, replay-able state hash | **Done** | `sim/`, `render/`, `platform/` |
| **M1 vertical slice** — full loop end to end, playable on three viewports | **Done** | `game.html` |
| **M2 core mechanics** — insertion, compaction, gap-collapse chain combos, colour retirement, 5 powerups, coins, full scoring, multi-lane levels | **Done** | `sim/sim.js`, `sim/rules.js` |
| **M3 content** — 12 original levels across 6 chapters, generated + profile-checked | **Done (data)**, editor **not** built | `content/lanes/`, `tools/genlanes.js` |
| **M4 modes + meta** — Expedition, Perpetual, Overpressure, lives, extra lives, high scores, save/load, settings | **Done** | `platform/shell.js`, `platform/storage.js` |
| **M5 art/audio** — procedural steampunk render, synthesised audio, VFX | **Partial** — original and thematically complete, but procedural, not authored assets | `render/`, `platform/audio.js` |
| **§6.1–6.4 validation** — constant tests, profile bands, behavioural tables, Monte-Carlo | **Done** | `tests/` (63 tests) |
| **§3.5 multi-aspect** — one content set, 4:3 / 19.5:9 / 16:10 | **Done**, asserted in tests *and* in the browser | `render/fit.js`, `tools/verify.mjs` |
| **§3.6 input** — touch (drag-aim + tap-fire + two-finger swap), gamepad (stick aim, A/R2, X, L2 precision), keyboard | **Done** | `platform/input.js` |
| **§10 accessibility** — always-on glyphs, relaxed pace, reduce-motion, 48px targets, DOM menus for VoiceOver, playable muted | **Partial** — implemented, never tested by an affected human | `render/glyphs.js`, `game.html` |

Run it: `npm run serve`, then open `http://127.0.0.1:8123/game.html`.
Run the checks: `npm test` (63 tests) and `npm run verify` (Chromium, 3 viewports).

---

## 3. What is NOT built, and why

### Cannot be done from here at all
- **Phase 0 reference measurement** (§2) — no access to REF. See section 1.
- **L3 persona loop** (§7) — P1–P9 are nine *human* tester profiles with pass gates.
  I substituted an automated bot (`tools/simcli.js`) that proves levels are
  completable. That is a smoke test, not a playtest, and it cannot tell you whether
  the game feels right, whether onboarding lands, or whether the colours work for a
  deuteranope.
- **Real-hardware verification** — Chromium in a container says nothing about
  iPhone 16 thermals over 60 minutes, Deck OLED battery at 8W, or ProMotion at
  120Hz. The frame rates in `npm run verify` are software-rasterised and are not
  performance evidence.
- **Legal review and trademark clearance** (§0.4, §3.8) — hard blockers in the plan.
- **Store submission** (§11) — no App Store Connect or Steamworks access.

### Not done, but doable
- **Native shells.** No Capacitor iOS project, no Electron/Steamworks Linux build.
  What exists runs in a browser, which covers iPad Pro, iPhone 16 and Deck (desktop
  mode or a browser), but is not a shippable App Store or Steam artifact.
- **Level editor UI** (§3.3, M3-blocking in the plan). `tools/genlanes.js` does the
  authoring half; there is no interactive editing half.
- **Localisation** (§3.5 of M5) — English only, strings are inline.
- **Onboarding/tutorial** — the controls are explained on the title screen, which is
  exactly the "wall of text" the plan says not to ship.
- **Authored art and audio.** Everything renders procedurally. Real production needs
  the clean-room pipeline in §0.4 with an originality review per asset.
- **Cross-platform determinism CI job** — the determinism tests run on one engine
  here; the plan calls for a Linux + iOS-sim matrix comparing per-frame hashes.
- **Telemetry, crash reporting, cloud save** (§11).

---

## 4. Deviations from the plan, with reasons

**ADR-0001 (TypeScript + PixiJS + Capacitor + Electron) was not followed.** This is
plain JavaScript ES modules with a Canvas2D renderer and no dependencies at all.

Reasons: it is verifiable end-to-end in this environment; it has zero supply chain
(the only devDependency is Playwright, used by the verification script and by
nothing that ships); and at this sprite count Canvas2D is comfortably sufficient.
The `sim / render / platform` split is intact and enforced by a lint-style test, so
swapping the renderer for PixiJS later touches `render/` only. If the project wants
TypeScript and PixiJS, that is a contained migration, not a rewrite — but it *is* a
deviation and should be a conscious decision rather than an inherited default.

**PRNG is mulberry32, not PCG32** (§3.2). Same guarantee — integer ops only, so it
is bit-identical across engines — with no 64-bit emulation. `sim/rng.js` documents it.

**Trig is table-driven** (`sim/trig.js`, `content/trig.json`). The plan requires
cross-platform determinism; `Math.sin` is not specified to be bit-identical across
engines, so the sim never calls it.

---

## 5. Design decisions that Phase 0 must confirm or overturn

These are the places where I had to *decide* something the reference would have
*told* us. Each is a real fork in how the game feels:

1. **Insertion displaces the rear, not the front, and the feed pipe is finite.**
   Both obvious alternatives are demonstrably wrong (see the long comment in
   `sim/rules.js`): pushing the forward section makes level 1 unwinnable in 8
   seconds; an unbounded pipe makes junk shots entirely free. `pipeCapacityBalls`
   is a pure guess.
2. **Catch-up speed (260 u/s) for groups closing a gap.** This single number governs
   how generous chain combos are, and it also determines whether a trailing group
   can outrun a shot in flight — which it currently can.
3. **Combo window (150 ticks)** — how long a chain reaction stays "live".
4. **Powerup magnitudes** — Arc span, Fulminate radius, Governor multiplier and all
   durations. Arc and Fulminate materially inflate the gauge; early values made a
   level finishable in four seconds.
5. **A ball shot into a gap snaps to the leading group.** It could equally join the
   trailing group; that changes gap-shot strategy completely.
6. **Feed rate as the difficulty knob** rather than reaction budget — see
   `tools/derivetuning.js` for the two failed models that preceded it.

---

## 6. Defects found and fixed while building (the loops doing their job)

Recording these because they are the argument for the plan's validation machinery —
every one was caught by an automated check rather than by playing:

| Found by | Defect |
|---|---|
| First profile dump | A "figure eight traversed twice" retraced itself exactly — 256 crossings, visually two lanes in one place |
| Profile dump | Turn radii of 25 units against a 40-unit ball: the chain visually overlapped itself around corners |
| Profile dump | Hand-picked chain speeds produced a reaction-budget curve of 76, 92, 161, 209, 111, 126, 116, 162, **20**, 66, 149, 186 seconds — not a difficulty ramp |
| Derived tuning | Deriving speed from a falling reaction budget over rising lane lengths demanded 202 u/s — a feed rate of 5 balls/second |
| Bot play | Insertion pushing the rear with no pipe limit: 1478 balls stuffed into the feed pipe, level unable to end |
| Bot play | Insertion pushing the front instead: level 1 lost in 8 seconds, unwinnable |
| Bot play | Powerups inflating the gauge so hard that level 1 completed in 4 seconds |
| Behavioural test | **Colour retirement never ran once the gauge filled** — the endgame could hand you a colour that no longer existed on the track, an unwinnable state. Genuine game-breaking bug |
| Purity test | (self-inflicted) the scanner matched the very identifiers its own documentation discussed |
| Monte-Carlo test | The powerup-coverage test was measuring luck: a 15-sample run misses one of five kinds ~16% of the time |

---

## 7. Honest summary

There is a complete, playable, tested marble-shooter here: 12 original levels, three
modes, all five powerups, chain combos, a deterministic replay-able core, three
device layouts verified in a real browser, and 63 passing tests.

What there is not is any evidence about *fidelity to REF*, because the measurement
phase that the entire fidelity argument depends on requires the reference material
and a team. The plan is explicit that Phase 0 is the highest-leverage work in the
project; the right next step is to run it and replace every `DESIGN-ESTIMATE` in
`content/tuning.json` with a measurement.
