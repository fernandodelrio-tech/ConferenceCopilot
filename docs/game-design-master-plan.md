# ASCENDANT — Master Plan

**A steampunk marble-shooter in the lineage of the genre's classics, built clean.**

**Working title:** `ASCENDANT`  *(was `TIDEWRIGHT` in v2 — a tidal name no longer fits a machine-city with no water in it)*
**Targets:** iPad Pro (M4), iPhone 16, Steam Deck OLED
**Doc owner:** TBD · **Status:** Draft v3 · **Last updated:** 2026-07-30

> **Naming discipline starts with this file.** The genre-defining title this project draws from
> is referenced in internal specs as **"REF"** and nowhere else. It does not appear in the repo,
> in code, in commit messages, in asset filenames, in the tracker, or in any internal codename.
> Internal documents naming a competitor are discoverable and read badly in a dispute, and a
> project codenamed after the thing it resembles is an own goal. Hence `ASCENDANT`, and hence
> this file is no longer named after REF either.

---

## 0. The frame

### 0.1 What we are cloning, and what we are not

Three separable layers live inside "clone REF with full fidelity":

| Layer | Copyrightable? | Our stance |
|---|---|---|
| **Rules and mechanics** — matching, insertion, gap-collapse combos, scoring math | No — game mechanics aren't protected by copyright | **Match precisely.** This is where fidelity lives |
| **Feel** — speeds, timings, easing, difficulty pacing | No | **Match precisely**, to the tolerances in §0.2 |
| **Expression** — characters, art, music, voice, level layouts, names, UI ornament | **Yes** | **Independently created.** Similar in *function*, different in *appearance* |

So: it plays like REF and looks and sounds like nothing else. A player who loved REF should
recognise the *grammar* instantly and the *presentation* not at all.

### 0.2 Fidelity tolerances (the contract)

| Dimension | Tolerance | How verified |
|---|---|---|
| Chain advance speed, per difficulty step | ±3% of REF | Frame-counted from capture (§2.2) |
| Shot projectile speed | ±3% | Frame-counted |
| Insert/settle timing | ±2 frames @60fps | Frame-counted |
| Match/pop resolution timing | ±2 frames | Frame-counted |
| Gap-collapse → combo window and rules | Exact rule match | Behavioural suite (§6.3) |
| Scoring formulas | Exact | Unit tests from captured score deltas |
| **Level difficulty profile** (was: curve geometry) | Within band, per §6.2 | Statistical + playtest equivalence |
| Power-up trigger rates | ±5% over 10k sim trials | Headless Monte-Carlo (§6.4) |
| Mode roster and progression scale | Equivalent scope | Content checklist (§3.3) |

**The row that changed from v1, and why it matters.** v1 called for tracing each REF level's
curve and diffing the geometry. Level layouts are authored creative expression — a traced curve
set would be the strongest copying evidence in the whole project, and it is also the least
necessary part of it. What players actually experience is the *difficulty profile*: how long the
lane is, how often it crosses itself, how much is visible at once, how much reaction time a
segment affords, and how all of that escalates across the roster. §6.2 now targets that profile
using **original geometry**. Fidelity of experience, not of tracing.

Cost of the change: level design becomes real design work instead of transcription. §3.3's
budget reflects it, and it is the single biggest schedule impact of the non-infringement brief.

### 0.3 Non-infringement design directive

"Similar but not identical" is not a vibe — it is this table. Every asset class gets an explicit,
recorded, reviewed divergence decision.

| Asset | REF (functional role) | ASCENDANT | Divergence rationale |
|---|---|---|---|
| **Setting** | Ancient jungle temple; carved stone and gold | **The Ascendant Works** — a vertical Victorian-industrial machine-city of boiler decks, clockworks and airship yards. Riveted brass, cast iron, verdigris, coal smoke, gaslight, aether-glass | Different era, culture, material, palette, mood. No shared iconography |
| **Shooter** | Stone frog idol that spits balls | **Brass pneumatic turret** — a riveted pressure vessel with a rotating barrel, a glass breech showing the chambered next shot, a machined aim vane, and a steam exhaust puff on each fire | Keeps the functional read (rotating head, unmistakable aim direction, visible next ball). Not an animal, not stone, not an idol |
| **Projectiles** | Glossy coloured marbles | **Gauge-globes** — brass-caged glass spheres, each with a distinct engraved glyph (spiral / cross / dot-triad / chevron / ring / bar) | Sphere-in-a-colour is functional and unavoidable; distinctiveness comes from material treatment and the always-on glyph system |
| **Lane** | Carved stone grooves in a temple floor | **Open-topped brass rail channel** — sleepers, etched distance graduations, a faint conveyor motion | Same functional legibility, entirely different object. Deliberately *not* an enclosed pneumatic tube (§3.4) |
| **Entry / exit** | Spawn hole → skull-mouth exit | **Escapement gate → furnace intake**, with a boiler pressure needle climbing toward the redline as the loss tell | The loss state must be maximally legible; the skull is REF's expression, the redlining gauge is ours — and a needle reads faster than a mouth |
| **Power-ups** | Bomb, lightning, reverse, slow, laser sight | **Fulminate, Arc, Reverse, Governor, Sightline** — icons in an instrument language (pressure gauges, valve wheels, a centrifugal governor, surveying optics) | Mechanics identical, names and iconography independent. No borrowed bolt or bomb glyph |
| **Modes** | Campaign, endless, post-campaign hard mode | **Expedition, Perpetual, Overpressure** *(pending trademark clearance)* | Generic mode concepts, original names |
| **Callouts** | Spoken barks including a distinctive title-word shout | Original callout vocabulary, written fresh, in the register of an engine-room foreman | Distinctive barks are protectable *and* are REF's brand. Never reused |
| **Music** | REF's soundtrack | Original score: low brass, mechanical percussion (ratchets, pistons, escapements), fairground calliope and music-box motifs, tension layer rising with boiler pressure | Clean-room, see §0.4 |
| **UI** | REF's frames, gauge, fonts | Instrument-panel language: etched brass plates, riveted bezels, a filling boiler pressure gauge | Function preserved (progress always readable), ornament independent |

**Ball palette caveat — do not over-diverge.** Six maximally distinguishable hues is a
*functional* requirement and the set of good ones is small, so our palette will land near REF's.
That is fine: colour alone isn't protectable expression, and distinctiveness comes from material
rendering and glyphs. **Never degrade colour readability in the name of divergence.** This is the
one place where trying harder to look different would make the game worse.

**Why steampunk helps the legal position.** Victorian industrial is about as far from
Mesoamerican temple as a setting can get while still supporting the genre's functional needs — a
mechanical shooter, a channelled track, a gauge that fills, an intake that punishes failure all
have obvious period-appropriate forms. The divergence is structural rather than cosmetic, which
is exactly what makes it defensible. The cost is a real production risk, not a legal one: see
§3.4's restraint rule and the corresponding row in §13.

### 0.4 Clean-room process (structural, not advisory)

Two tracks, deliberately separated:

- **Measured room (engineering).** Has REF access. Produces **numbers only** — spec entries,
  tuning rows, timing measurements. Never produces art or audio.
- **Clean room (art, audio, level design).** **Never sees or hears REF.** Works only from written
  functional briefs ("a rotating shooter whose aim direction is readable in a 200ms glance, with
  the next ball visible in a chamber"). Composers especially: genre, mood and instrumentation
  briefs only, contractually barred from listening to REF's score. Access plus similarity is what
  loses these cases; genuine lack of access is the cheapest defence available.
- **Originality review gate.** A reviewer *with* REF access compares each finished asset against
  REF and signs off in writing that it diverges, with rationale. The creators never see that
  comparison. Failing assets go back to the clean room with a revised brief.

Further safeguards: trademark clearance on `ASCENDANT` and all mode names before lock; store
metadata never names REF nor says "like REF"; captures live in a private access-controlled bucket
(`gs://asc-ref/`, `.gitignore`d, plus a CI secret-scan rule failing the build if a capture or REF's
actual name lands in the repo); legal review is a hard blocker at M6 **and** before art production.

### 0.5 Target devices (locked)

| | iPad Pro M4 | iPhone 16 | Steam Deck OLED |
|---|---|---|---|
| Resolution | 2752×2064 (13") / 2420×1668 (11") | 2556×1179 | 1280×800 |
| Aspect | ~4:3 | ~19.5:9 | 16:10 |
| Refresh | 120Hz ProMotion | **60Hz** (base 16 has no ProMotion) | **90Hz** |
| GPU class | Vast headroom | Ample (A18) | Van Gogh — modest, and TDP matters |
| Input | Touch, Pencil hover, trackpad | Touch only | Gamepad, trackpads, gyro |
| Perf role | Showcase | **Thermal floor** | **Frame-budget floor** |
| Store | iOS universal SKU | same SKU | Steam |

Two different worst cases, and neither is the iPad: **iPhone 16** is the thermal/sustain
constraint (small chassis, 60Hz cap — a dropped frame is very visible), and **Deck OLED** is the
frame-budget and battery constraint at 90Hz. Optimise against those two and the M4 comes free.

**Three aspect ratios is the real UX problem introduced by this device list** — see §3.5.

### 0.6 Definition of Done

Ships when all of these hold simultaneously **on all three devices**:

- [ ] All modes implemented: Expedition (full roster), Perpetual (endless), Overpressure (hard).
- [ ] Every level completable; win and lose states correct.
- [ ] §0.2 tolerances pass on 100% of sampled levels.
- [ ] Persona gates P1–P9 all PASS on the same build (§7).
- [ ] Zero open Sev-1/Sev-2; ≤5 Sev-3; all Sev-4 dispositioned.
- [ ] Perf budgets met per device (§9), including a 60-minute soak.
- [ ] Accessibility checklist complete (§10); colourblind mode verified by affected testers.
- [ ] Originality review signed off on 100% of shipped assets (§0.4); legal sign-off complete.
- [ ] Deck Verified self-audit clean; App Store self-audit clean for **both** iPhone and iPad
      device classes.
- [ ] Save/restore survives suspend, force-quit and OS update; iCloud sync correct iPhone↔iPad.
- [ ] Crash-free session rate ≥99.5% across the final beta week, per device.

No date-based shipping. Unmet criteria send the project back into the relevant loop (§8).

---

## 1. Pillars

1. **The chain is a clock.** Tension from a visible, readable, advancing threat.
2. **Every shot is a decision** — colour, insertion point, whether to bank a gap for a combo.
3. **Instant, honest input.** ≤1 frame of added aim latency, on every device.
4. **Readable on a 6.1" phone at arm's length.** The hardest legibility bar in the device list,
   so it *sets* the art direction rather than being retrofitted into it.

---

## 2. Phase 0 — Reference measurement and specification (2–3 weeks)

The highest-leverage phase in the plan. Fidelity is measured, never remembered. Nothing gets
implemented in Phase 2 without a spec line traceable to a measurement.

### 2.1 The Mechanics Spec

`docs/spec/`, one file per system, entries shaped like:

```
SPEC-BALL-014  Insertion displacement
  Rule:      A shot inserted between chain balls i and i+1 pushes the sub-chain from
             i+1 forward along the lane by exactly one ball diameter, easing over N
             frames with curve C.
  Reference: ref/clips/insert_mid_chain_003.mp4 @ 00:04.12–00:04.38
  Measured:  N = 7 frames, ease = cubic-out (fit R²=0.994)
  Tests:     sim/tests/insert.spec.ts::displaces_subchain_one_diameter
  Status:    VERIFIED
```

Lifecycle `DRAFT → MEASURED → IMPLEMENTED → VERIFIED`. Phase 0 exits when 100% of entries are
at ≥MEASURED.

### 2.2 Capture methodology

- 60fps **lossless**, fixed window, on-screen frame counter. Compressed capture destroys the
  1-frame measurements the whole tolerance table depends on.
- 3 independent takes per quantity; take the median and **log the variance** — high variance
  usually means we've misidentified the variable (e.g. a speed that's level-indexed, not global).
- Build `tools/framestep/` first: frame stepping, click-to-mark positions, CSV export of
  (frame, x, y). It pays for itself inside the first two levels.
- **Lane analysis, not lane tracing** (per §0.2). For each REF level extract *metrics*: total
  length in ball diameters, self-crossing count, on-screen visible fraction, tightest turn radius,
  per-segment reaction-time budget, colour count, spawn rate, gauge target. These become
  `content/profiles/<n>.json` — the design targets our original levels must hit. The traced
  geometry itself is deliberately **not retained**.

### 2.3 Feature inventory — a hypothesis to verify, not a fact to trust

Anything observed in capture and missing below gets added; anything below not observed gets
struck. **Do not hardcode remembered numbers** — every count, rate and threshold comes from §2.2.

**Core loop:** shooter at a fixed point, rotate to aim, fire a coloured ball; balls flow along a
lane from entry toward exit; reaching the exit loses; 3+ same colour pops; a progress gauge fills
as balls are destroyed; gauge complete → spawn stops → clear the remainder to win.

**To spec:** insertion and displacement; compaction after a pop; gap creation and gap-collapse
combo chains (the scoring engine, and the deepest system in the game); colour swap / held second
ball; fire-rate gating (verify whether it's "one shot in flight" or time-based); colour retirement
from the spawn pool as colours are eliminated; spawn weighting; multi-lane layouts with
overlapping segments — z-order and cross-lane collision rules.

**Power-ups** (spawn rate, duration, stacking, visual tell, level scaling): Fulminate, Arc,
Reverse, Governor, Sightline. Confirm the set is complete.

**Scoring:** base pop; combo/chain multipliers and callout tiers; gap-shot bonus; coin pickups;
bonus-target spawns and values; board-clear bonus; extra-life thresholds; end-of-level formula.

**Meta:** Expedition progression and unlock structure; chapter grouping and inter-level screens;
Perpetual scaling curve; Overpressure difficulty delta; score tables; per-level stats.

### 2.4 Also produced in Phase 0

`content/tuning.json` — every constant, level-indexed, each with a `source` field pointing at its
spec entry. **No magic numbers in code, ever.** This file *is* the fidelity. Plus the input maps
(§3.6) and the first-pass risk register (§13).

---

## 3. Phase 1 — Design (3 weeks, overlapping Phase 0's tail)

### 3.1 Architecture — decided

**TypeScript + a pure deterministic simulation core + PixiJS (WebGL2) renderer**, per the v1
recommendation, now locked as **ADR-0001**. Godot 4 stays the fallback if the team turns out to be
Godot-native — surface that in week 1, not month 3.

```
sim/       pure, deterministic, zero rendering, zero platform APIs, fixed 120Hz
           (state, InputEvent[]) → (state', Event[])
render/    reads sim state, owns interpolation and all visuals
platform/  ios/ deck/ — input, audio, storage, store SDKs
```

Enforced by a lint rule **and** a CI dependency check that fails if `sim/` imports from `render/`
or `platform/`. This split is what makes fidelity testable: headless sim in CI at thousands of
times realtime, replays that are just input logs, every bug reproducible from a seed.

**Platform shells:** Capacitor → native iOS universal app (iPhone + iPad, one SKU);
Electron + Steamworks → native Linux build for Deck.

**One known trap:** WKWebView audio latency on iOS is bad enough to hurt a game whose feel depends
on shot and pop response. **Bridge SFX to native audio** (AVAudioEngine) instead of routing
through WebAudio; music can stay in WebAudio. Spike this at M0 — if the latency can't be fixed,
that's the signal to revisit ADR-0001 while switching is still cheap.

### 3.2 Determinism requirements

Fixed 120Hz timestep with interpolated render — which is also precisely what lets one sim serve
60Hz (iPhone), 90Hz (Deck) and 120Hz (iPad) without three tunings. Never step off wall-clock
delta. Seeded PCG32 in `sim/`; `Math.random` banned there by lint. No float-order dependence:
fixed iteration orders, no set/map iteration in physics, and a cross-platform determinism CI job
replaying identical input on Linux and iOS-sim, comparing a per-frame state hash.

**Replay format:** `{seed, tuningHash, inputEvents[]}`, auto-attached to every bug report. This
one decision cuts repro time more than anything else in the plan.

### 3.3 Content plan

- **Original levels hitting REF's difficulty profiles** (§2.2, §6.2). Each level = lane spline +
  tuning row + palette + backdrop. Authoring is data, not code.
- **`tools/leveled/` is M3-blocking**: draw and edit lanes, live profile readout (length,
  crossings, visible fraction, reaction budget vs. target band), flow preview, hot-reload.
  Without the live readout, hitting difficulty bands is guesswork.
- Budget **3–5 days per level** (up from v1's 2–3): these are designed, not traced, and each needs
  playtesting against its band.
- Content checklist: one row per level × {implemented, profile-band pass, playtested,
  fidelity-verified, perf-verified on all 3 devices}. This burndown is what says whether we're
  actually done.

### 3.4 Art bible — replaces v1's direction

*v1 specified carved stone, jade and temple interiors. That is REF's own setting. Struck.*

**The Ascendant Works — Victorian industrial steampunk.** A vertical machine-city climbed from
its foundations to its spires: riveted brass and blackened cast iron, verdigris and oil sheen,
coal smoke and gaslight, aether-glass glowing where the engineering gets speculative. Warm
metal, cold air. Cluttered, purposeful, *lived-in machinery* — never a clean sci-fi interior, and
never fantasy. Mood: magnificent contraption under pressure.

**Chapters double as backdrops**, giving the roster a natural climb: Boiler Deck → Clockworks →
Pneumatic Exchange → Aether Observatory → Airship Yards → Spire Foundry. Escalating altitude and
escalating difficulty read as the same progression, which is free narrative for zero mechanical
cost.

### The restraint rule (read this before drawing anything)

**Steampunk's failure mode is visual noise, and this genre cannot afford any.** The aesthetic
rewards dense greebling — rivets, pipework, gauges, gears, exhaust — and every one of those is
high-frequency luminance detail directly competing with the one thing the player must read
instantly: which colour is which ball. On a 6.1" phone at ~24px per ball, a busy brass backdrop
will lose us the game. So the theme is **zonally rationed**:

| Zone | Detail budget | Content |
|---|---|---|
| **Lane band** (anywhere a ball can travel, plus one ball-diameter margin) | **Minimal.** Low-frequency, desaturated, high-contrast-against-all-six-hues | Flat machined plate, soft gradients, no rivets, no pipework, no moving background parts |
| **Playfield surround** | Moderate | Structural forms, large silhouettes, slow parallax |
| **Chrome and frame** (outer thirds, HUD bezel) | **Full steampunk.** This is where the theme spends its budget | Rivets, gauges, brass filigree, pipework, working gear animations |

Two automated checks in CI enforce this rather than trusting review:
1. **Contrast floor** — every one of the six ball colours against every backdrop region a ball can
   pass over (already planned in v2).
2. **Detail-frequency ceiling** — fail the atlas if local luminance variance inside the lane band
   exceeds a threshold. This is the check that stops the theme eating the gameplay, and it is new
   with the steampunk direction.

**VFX corollary:** steam and smoke are the theme's signature and its biggest occlusion hazard.
Rule — steam vents *away* from the playfield, and anything drawn over the lane band must be
additive/light-emitting (sparks, glow, heat shimmer), never opaque particles. A gorgeous smoke
plume that hides a ball for four frames is a Sev-2 bug, not art.

### Remaining art notes

- **Balls are still the hardest problem, and the phone still sets the bar.** Six colours
  distinguishable at ~24 physical px, over every backdrop, in motion, for colourblind players.
  Colour **plus** an always-on engraved glyph (spiral / cross / dot-triad / chevron / ring / bar).
  The brass cage must be a thin bezel only — it cannot eat the coloured glass area, which is the
  whole signal.
- **Typography:** a Victorian display face for headings and chapter titles; a clean, plain face
  for every number, HUD readout and body string. Decorative type at Deck 800p or in a phone HUD
  is unreadable, and ornate faces routinely lack extended-Latin coverage — which would break six
  localisations at M5. Check glyph coverage *before* licensing a display face.
- Asset list: balls (6 base + 5 power-up overlays), pneumatic turret (rotation atlas + glass
  breech + exhaust puff), lane channel and sleeper decals, escapement gate, furnace intake with
  redlining pressure needle, 6 chapter backdrops (+1–2 spare), coins, bonus targets, VFX (pop,
  chain escalation, Fulminate, Arc, gauge fill, sparks, heat shimmer), full UI kit, icons and
  store art for both stores.
- Author at **2× Deck native (2560×1600)**: iPad Pro takes it near-native, iPhone and Deck
  downsample. Atlases with mip-safe padding.
- Every asset carries an originality-review record (§0.4) before it ships.

### 3.5 Multi-aspect framing — 4:3, 19.5:9 and 16:10 from one content set

The central new constraint, and it must be solved in design rather than patched in code later:

- Author every lane inside a **16:10 reference box** (Deck-native, the middle aspect).
- **Hard rule: no gameplay-relevant geometry — lane, shooter, entry, exit, bonus targets — ever
  sits outside that common box.** Difficulty must be identical on all three devices. Everything
  outside it is backdrop and chrome only.
- **iPad Pro (4:3):** box fits by width; surplus vertical space becomes backdrop and a top
  instrument bar. Never widen the playfield — that would change visible-fraction, and therefore
  difficulty.
- **iPhone 16 (19.5:9):** box fits by height; surplus horizontal space is backdrop plus side UI.
  **Landscape-locked on phone** — a portrait playfield cannot hold these lanes without changing
  the game. iPad supports both orientations.
- **Deck OLED (16:10):** exact fit.
- Scale by *physical* size so the ball-to-lane ratio stays constant. Balls are physically smaller
  on the phone; that's a target-acquisition question, not a difficulty question, and P9 tests it.
- Safe areas: iPhone 16 in landscape puts the Dynamic Island on one side and the home indicator at
  the bottom — no interactive UI in either, and no lane geometry under the island. iPad: Stage
  Manager and Split View can resize at any moment; resize is a **render-only** concern (another
  dividend of §3.1) and must never perturb the sim.

### 3.6 Input design

**Touch (iPhone + iPad)** — both schemes always live, no settings dialog: drag anywhere to aim
continuously and release to fire, or tap a point to fire at it. Colour swap: two-finger tap plus an
on-screen button. Aim origin is offset from the finger so the target is never under the thumb.
Phone-specific: nothing interactive in the bottom corners (thumb rests), and a larger swap-button
hit target than iPad's. iPad extras: trackpad support, and Pencil hover aiming *if* it falls out
cheaply — not scheduled work.

**Steam Deck OLED (gamepad-first):** right stick aims with a tuned response curve plus an optional
aim-assist slider; `A`/`R2` fires; `X` swaps; `L2` is a slow-aim modifier for precision shots.
Optional gyro (off by default) and trackpad aiming. Ship a **default Steam Input config** (a Deck
Verified requirement). Full controller navigation of every menu, Xbox-style glyphs, never a
keyboard prompt. Suspend/resume mid-level with no state loss — auto-save on every settled shot.

**All devices:** in-game onboarding that teaches insertion and gap-combos by doing, not by text.

### 3.7 Audio design

Original score: per-chapter loops built from low brass, mechanical percussion (ratchets, pistons,
escapements as rhythm), and fairground calliope or music-box motifs for the lighter chapters —
with a tension layer that rises as the boiler pressure needle climbs toward the redline. SFX:
pneumatic fire *thunk* plus exhaust hiss, glass insert click, pop tiers (3 / 4 / 5+) as
escalating shatter-and-clank, combo stinger, each power-up, gauge fill, win, loss.

**One acoustic trap the theme creates:** continuous steam hiss is broadband noise, and it sits
directly on top of the transients the player needs for shot and pop feedback. Keep ambient hiss
low, band-limited, and out of the frequency range the core SFX occupy — and mix it *last*, after
gameplay SFX are locked, so it can never mask them. Verify on the smallest speaker (iPhone 16).

Original callout vocabulary (§0.3). Music ducks under callouts. Mix verified on
**Deck OLED speakers, iPhone 16 speakers and iPad Pro speakers** — on device, not headphones.
Composer works clean-room (§0.4).

### 3.8 Design exit gate

GDD, art bible, audio bible, input maps and tuning table signed off; ADR-0001 recorded; level
editor spec approved; **§0.3 divergence table reviewed by legal counsel before art production
begins** — a divergence problem discovered at M5 costs the entire art budget twice.

---

## 4. Phase 2 — Milestones

Each milestone ends with a **playable build on all three physical devices** plus a persona round
(§7). Never complete on a dev machine alone.

| # | Milestone | Contents | Exit criteria |
|---|---|---|---|
| **M0** | Skeleton | Repo, CI, sim/render/platform split, deterministic loop, replay record/playback, all three shells booting; **native audio-latency spike (§3.1)** | 10k-frame replay byte-identical on Linux + iOS; measured SFX latency acceptable |
| **M1** | Vertical slice | One level end-to-end: lane, spawn, aim, fire, insert, match, pop, compaction, win, lose. Placeholder art. Both touch schemes + gamepad | A designer plays it and it *feels* like REF on all three devices |
| **M2** | Full core mechanics | Gap combos, chain scoring, colour retirement, multi-lane overlaps, all 5 power-ups, coins, bonus targets, full scoring | Behavioural suite (§6.3) green; §0.2 tolerances pass on the slice |
| **M3** | Content complete | Level editor shipped; full original roster authored to profile bands; chapters; Expedition progression; inter-level screens | 100% of checklist rows at "implemented + profile-band pass" |
| **M4** | Modes + meta | Perpetual, Overpressure, score tables, per-level stats, save/load, settings, iCloud + Steam Cloud | All modes completable; save survives `kill -9`; iPhone↔iPad sync correct |
| **M5** | Art/audio complete + polish | Final assets (originality-reviewed), VFX, juice pass, localisation (EN + 6), onboarding | Zero placeholders; localisation QA pass; 100% originality sign-off |
| **M6** | Platform hardening | Perf to budget on iPhone + Deck, Deck Verified audit, App Store audit both device classes, store assets, **legal sign-off**, Steamworks + Game Center | §9 budgets met; both checklists clean; legal cleared |
| **M7** | Beta | Steam playtest + TestFlight (separate iPhone and iPad cohorts), telemetry, crash reporting | Crash-free ≥99.5% per device; no open Sev-1/2 |
| **M8** | Release | 1.0 on both stores | §0.6 fully satisfied |

**Rough schedule:** ~10–12 months at 4–6 people (2 eng, 1 designer, 1 artist, part-time audio, QA
lead plus rotating persona testers). Longer than v1 for two concrete reasons: original level design
(§3.3) and a third device. Compress by cutting **content breadth** — never Phase 0, never the loops.

---

## 5. Engineering practices that carry the fidelity goal

- **Tuning hot-reload.** `tuning.json` reloads live in dev builds. Feel-matching is iterative; a
  30-second rebuild loop kills it.
- **Side-by-side harness.** Frame-locked, scrubbable REF footage next to the live game. Fastest way
  to close the last 5% of feel. Measured-room tool only, never shipped.
- **Debug overlay:** lane control points, ball indices, collision radii, gap state, spawn pool,
  active tuning row, frame-time graph, and the **current aspect-fit box** (§3.5).
- **Headless sim CLI:** `asc-sim --level 7 --seed 42 --replay r.json --assert-hash …`
- **Every fixed bug gets a replay-based regression test.** No exceptions. This corpus is what makes
  §8's loops terminate instead of oscillating.
- **Trunk-based, feature-flagged, CI on every push:** typecheck, lint (incl. sim-purity and
  no-`Math.random`), unit, behavioural, cross-platform determinism, profile-band check,
  ball/backdrop contrast check, perf smoke, build all three targets.

---

## 6. Fidelity validation

### 6.1 Constant verification
Unit-test every constant against its captured measurement at §0.2 tolerance. A tuning change that
breaks a tolerance fails CI — no silent feel-drift.

### 6.2 Level difficulty-profile equivalence (replaces geometry diff)
For each authored level, the editor and CI compute: length in ball diameters, self-crossing count,
on-screen visible fraction, tightest turn radius, per-segment reaction-time budget, colour count,
spawn rate, gauge target. **Fail if any metric falls outside its REF-derived band (§2.2).** Then
confirm with humans: P1 and P4 rate perceived difficulty, and the level's position in the
difficulty curve must match its intended slot. Original geometry, equivalent experience.

### 6.3 Behavioural suite
Table-driven rule tests in the headless sim: given a board state and a shot, assert the exact
resulting board, score delta and event sequence. Every §2.3 mechanic, including the nasty ones:
simultaneous multi-gap collapse, insertion into a gap, a pop during Reverse, a power-up expiring
mid-chain-reaction, colour retirement racing a pop. **This suite is where the fidelity claim
actually lives.**

### 6.4 Monte-Carlo checks
10k headless runs per level asserting power-up rates, colour distribution, mean duration and
win-rate-under-random-play all inside REF-derived bands. Catches distribution bugs no hand-test
will ever find.

### 6.5 Human feel review
Two designers play REF and the build blind, rating 10 feel dimensions independently. Disagreement
>1 point triggers **re-measurement** (§2.2) of that dimension. Feel complaints become measurements
rather than arguments.

---

## 7. Persona-driven iterative testing

Each persona has a script, a rubric and a PASS gate. Run at every milestone from M1. Recruit real
humans for P1, P3–P7 and P9 (5–8 each); P2 is internal, P8 specialist/automated.

| ID | Persona | Looking for | PASS gate |
|---|---|---|---|
| **P1** | **Genre veteran** (played REF heavily) | "Does this play like the game I remember?" | ≥8/10 median feel; no unresolved "this is wrong" |
| **P2** | **Fidelity auditor** (designer, REF access) | Frame-level divergence, rule mismatches | Zero divergences outside §0.2 tolerance |
| **P3** | **Complete newcomer** | Onboarding clarity; do they discover insertion and gap-combos? | ≥80% clear level 1 unaided; can explain gap-combos after 15 min |
| **P4** | **Expert / score chaser** | Depth, exploits, scoring degeneracies, input ceiling | No score exploit; intent expressible at max chain speed |
| **P5** | **iPad Pro M4 player** (couch, two hands) | Ergonomics, aim precision, 4:3 framing, Stage Manager resize, 120Hz feel | ≥90% of shots on intended target in a calibration task |
| **P6** | **Steam Deck OLED player** | Stick aim feel, glyphs, suspend/resume, battery, 800p legibility, 90Hz smoothness, HDR sanity | Completes a chapter controller-only; no legibility complaints |
| **P7** | **Accessibility tester** (deutan/protan/tritan, low-vision, motor-impaired, HoH) | Colour discrimination, target sizes, timing pressure, captioning | All 6 colours distinguished by all CVD types; §10 clean |
| **P8** | **Adversarial QA / soak** | Crashes, state corruption, backgrounding, calls, storage full, thermal throttle | 60-min soak clean **per device**; fuzz + monkey suites clean |
| **P9** | **iPhone 16 commuter** (one hand where possible, short sessions, bright and dim light) | Thumb occlusion, ball legibility at 6.1", 19.5:9 framing, resumability, interruption handling | ≥85% calibration accuracy; identifies all 6 colours at a glance; no thumb-occlusion complaints; resumes cleanly after a call |

**Additional rounds:** localisation testers per language at M5; a 10-year-old and a 60-year-old at
M5 for age-range readability; an outdoor-sunlight legibility test on iPhone and Deck OLED (their
brightness and HDR behaviour differ sharply, so test both, not one).

**Protocol:** think-aloud, screen and face recording with consent, no facilitator help for the
first 10 minutes, structured rubric afterward. Sessions auto-capture replays, so "it did something
weird" becomes a reproducible test case instead of a shrug.

---

## 8. The loops — the mechanism that produces "fully functional"

Five nested loops, each with an **explicit exit condition**. The project cannot advance past a loop
until its condition holds. Time does not exit a loop; only criteria do.

### L1 — Build loop (every push)
`code → CI (typecheck, lint, unit, behavioural, determinism, profile-band, contrast, perf smoke,
3 platform builds) → red blocks merge`
**Exit:** trunk green. Always.

### L2 — Fidelity tuning loop (continuous, M1→M6)
`measure REF (§2.2) → set tuning → §6.1–6.4 checks → §6.5 feel review → divergence? re-measure or
re-tune`
**Exit:** all spec entries VERIFIED; all §0.2 tolerances pass; P2 reports zero unresolved
divergences.

### L3 — Persona loop (every milestone)
`build to all 3 devices → run P1–P9 → log findings with replays → triage (§8.1) → fix → re-test the
same personas on the new build`
**Exit:** all nine gates PASS **on one single build**. A fix that breaks another persona's gate
re-opens the loop — which is exactly why gates are re-run together rather than signed off piecemeal
across different builds. With three devices this matters more than in v1: an iPhone thumb-occlusion
fix can easily regress the iPad layout.

### L4 — Bug convergence loop (M6→M8)
`triage → fix → add regression test → full regression suite → re-verify affected persona gates →
measure burndown`
**Exit:** zero Sev-1/Sev-2; ≤5 Sev-3; all Sev-4 dispositioned; **and** a *declining* find-rate over
the trailing two weeks. Flat or rising means the build is not converging — extend the loop, do not
ship. Three consecutive iterations failing to reduce the Sev-2 count → stop all feature work and
run a dedicated stabilisation sprint.

### L5 — Beta / telemetry loop (M7, then post-launch)
`ship to beta cohorts → telemetry, crash, funnel analysis → fix → re-ship`
**Exit:** crash-free ≥99.5% per device; no unintended difficulty cliff (no level where >40% of
players stall for >10 attempts unless the REF profile says it should); no field Sev-1/2 for 7
consecutive days.

### 8.1 Triage

| Sev | Definition | SLA |
|---|---|---|
| **1** | Crash, save corruption, progression blocker, sim desync | Immediately; hotfix if live |
| **2** | Mechanic/scoring wrong vs. spec, level unwinnable, input broken on a device | Before milestone close |
| **3** | Visual/audio defect, minor UX friction, non-blocking edge case | Before release if capacity allows |
| **4** | Polish, cosmetic | Explicit ship/cut decision, recorded |

One tracker. Every bug carries device, build, replay attachment, seed, persona source, severity and
spec reference. **A bug tagged "fidelity" must cite a spec entry or capture timestamp** — otherwise
it is a feel opinion and goes through §6.5 instead.

---

## 9. Performance budgets

**iPhone 16 — the thermal floor.** 60fps locked (60Hz panel, so a dropped frame is very visible);
≥40% frame-budget headroom at baseline to survive throttling; the real test is a **60-minute soak
with no throttle-induced stutter**, not a 2-minute benchmark; cold launch <3s; memory well under
jetsam; safe through backgrounding, calls and Low Power Mode; battery drain benchmarked and
reported.

**Steam Deck OLED — the frame-budget floor.** 90Hz target → **11.1ms** budget with ≥30% headroom;
zero dropped frames during max chain-reaction VFX; TDP ≤8W for 4h+ on the OLED's 50Wh battery;
load-to-playable <5s; suspend/resume <1s with no state loss; text at or above Deck-legible minimums;
HDR output either correct or cleanly opted out.

**iPad Pro M4.** 120fps ProMotion; verify the sim doesn't become the bottleneck at 120Hz render;
Stage Manager resize without hitches; external-display sanity.

**All:** sim cost measured separately from render cost; CI perf smoke on a fixed worst-case replay
with a regression threshold so perf can't silently rot; per-device perf rows in the content
checklist.

---

## 10. Accessibility (designed in)

- Colourblind-safe by default: colour **plus** always-on glyph (§3.4), verified by P7 humans and
  not merely by a simulator.
- Relaxed mode (chain speed 0.5×–1×), clearly separated from the fidelity-accurate default so it
  never contaminates §6 testing.
- Remappable controls; aim sensitivity and aim-assist sliders; no required rapid input; no essential
  timing under 500ms outside core play.
- Scalable UI text, high-contrast mode, and **individually** disableable screen shake and flash
  (photosensitivity).
- Full captions or visual indicators for every audio cue; fully playable muted.
- iOS: VoiceOver across all menus, Dynamic Type respected in UI chrome, Reduce Motion honoured.

---

## 11. Release

**iOS — one universal SKU covering iPhone 16 and iPad Pro M4.** App Store Connect; TestFlight with
separate iPhone and iPad cohorts; screenshots for **both** device classes; age rating; privacy
manifest and nutrition label; Game Center leaderboards; iCloud save sync across devices.
**Monetisation recommendation: paid, no ads, no IAP** — matches premium genre expectation and avoids
opening a second design problem.

**Steam — Deck OLED.** Store page, capsule art, trailer, **Deck Verified submission with review lead
time budgeted**, default Steam Input config, Steam Cloud, achievements, depots and branches, plus a
first-chapter demo (demos measurably drive wishlist conversion in this genre).

**Both.** Press/creator kit; launch-day monitoring rota; **hotfix pipeline rehearsed before launch**
— push a trivial patch through both stores during M6 so Apple review latency is a known quantity
rather than a launch-day surprise; day-1 patch branch ready.

Cross-save between Steam and iOS: out of scope for 1.0, noted as a post-launch candidate.

**Post-launch:** 30/60/90-day telemetry→patch loop, then optional content expansions (new chapters,
daily challenge) as the data warrants.

---

## 12. Repo layout

```
/sim/            deterministic core (no rendering, no platform)
/render/         PixiJS renderer, VFX, interpolation, aspect-fit
/platform/       ios/ deck/ shared/ — input, audio (native SFX bridge), storage, store SDKs
/content/        lanes/, profiles/, tuning.json, palettes/, i18n/
/assets/         art/, audio/ (source in LFS; each with an originality-review record)
/tools/          framestep/, leveled/, sidebyside/, simcli/
/tests/          unit/, behavioural/, determinism/, profiles/, contrast/, perf/, replays/
/docs/           spec/, adr/, gdd.md, artbible.md, personas.md, this plan
/.github/        CI workflows
```

REF captures never enter this repo (§0.4).

---

## 13. Risk register

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Infringement claim | Fatal | **Low now** (was Medium) | §0.3 divergence table, §0.4 clean room + originality gate, naming discipline, legal gates before art production and at M6 |
| Original levels don't reproduce REF's difficulty feel | High | **High** | §6.2 profile bands + P1/P4 gates every milestone; editor shows band compliance live |
| Level authoring underestimated | High | High | Editor is M3-blocking; 3–5 days/level budgeted |
| iOS WebView audio latency hurts feel | High | Medium | Native SFX bridge, spiked at M0; explicit ADR-0001 revisit trigger |
| Ball legibility fails on the 6.1" phone | High | Medium | Phone sets the art bar (§1, §3.4); automated contrast check; P9 gate |
| **Steampunk visual density eats ball legibility** | High | **High** | §3.4 zonal restraint rule; CI detail-frequency ceiling on the lane band; additive-only VFX over the lane; P7/P9 gates every milestone |
| Ornate display typeface breaks localisation or 800p legibility | Medium | Medium | Plain face for all numerics/HUD; verify glyph coverage before licensing (§3.4) |
| Three aspect ratios leak into difficulty differences | High | Medium | §3.5 hard rule: no gameplay geometry outside the 16:10 box; CI aspect-fit test |
| iPhone thermal throttling in long sessions | Medium | Medium | 40% headroom target; 60-min soak in P8 from M2, not M6 |
| Deck Verified rejection | Medium | Medium | Self-audit from M2; default Steam Input config early |
| Cross-platform sim non-determinism | High | Medium | Determinism CI from M0 |
| Scope creep from "full fidelity" | High | High | §0.2 is the contract; anything outside it is out of scope |
| L4 never converges | High | Low | Declining-find-rate rule + forced stabilisation sprint (§8) |
| Perf collapse during max chain reactions | Medium | Medium | CI perf smoke on a worst-case replay from M2, on both floor devices |

---

## 14. Immediate next actions

1. **Confirm ADR-0001** (TS + PixiJS) with the team in week 1 — or switch to Godot 4 now, not later.
2. Legal counsel reviews the §0.3 divergence table and the §0.4 clean-room process **before any art
   is produced**.
3. Trademark clearance on `ASCENDANT` and the three mode names — `ASCENDANT` is a common word in
   games and software, so expect this one to need a fallback; have two alternates ready.
4. Stand up M0: repo skeleton, CI, sim/render/platform split, and the **iOS native-audio latency
   spike** — that spike is the one remaining thing that could invalidate the architecture.
5. Start Phase 0: build `tools/framestep/`, then measure the four core speeds and extract level 1's
   difficulty profile. That first end-to-end pass through capture → spec → tuning → test will expose
   whatever is wrong with this plan while it is still cheap to fix.
