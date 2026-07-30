# Full-Fidelity Zuma Clone — Master Plan

**Codename:** `TEMPLE` (working title — the shipped product must not use the Zuma name or mark)
**Targets:** iPad (iPadOS 17+) and Steam Deck (native Linux, Deck Verified)
**Doc owner:** TBD · **Status:** Draft v1 · **Last updated:** 2026-07-30

---

## 0. Read this first: scope, and the one constraint that shapes everything

### 0.1 What "full fidelity" means here

Fidelity is defined as **mechanical and experiential fidelity**, verified against captured
reference footage of the original, to these tolerances:

| Dimension | Tolerance | How verified |
|---|---|---|
| Ball chain advance speed per level | ±3% of reference | Frame-counted from capture (§2.2) |
| Shot projectile speed | ±3% | Frame-counted |
| Insert/settle timing | ±2 frames @60fps | Frame-counted |
| Match/pop resolution timing | ±2 frames | Frame-counted |
| Gap-collapse → combo window | Exact rule match | Behavioural test suite (§6.3) |
| Scoring formulas | Exact | Unit tests from captured score deltas |
| Curve geometry per level | Visually indistinguishable at 1× | Overlay diff (§6.2) |
| Power-up trigger rates | ±5% over 10k sim trials | Headless Monte-Carlo (§6.4) |
| Level roster | 100% of levels + all modes | Content checklist (§3.3) |

### 0.2 The IP constraint (non-negotiable, affects every art/audio task)

Zuma is PopCap/EA property. The **mechanics, rules, and level layouts are reimplementable**;
the **name, logo, frog idol design, sprite art, music, and voice barks are not**. So:

- Ship **100% original art and audio**, produced to match *function and readability*, not
  appearance. Same silhouette-legibility, same colour-count, same read-at-a-glance — different
  visual identity (see §3.4 Art Bible: we go Mesoamerican-inspired *stone-and-jade*, not a
  copy of the original's palette).
- Original footage/screenshots are **internal reference only**. They never enter the repo, the
  build, or the store listing. Reference captures live in a private, access-controlled bucket
  (`gs://temple-ref/`, never mirrored to git — enforced by `.gitignore` + a CI secret-scan rule).
- Store listing, marketing, and metadata: no "Zuma", no "PopCap", no "like Zuma" in the title
  or subtitle. Genre descriptors only ("marble shooter", "match-3 shooter").
- **Gate:** Legal review sign-off is a hard blocker on M6 (Store Submission). Budget 2 weeks.

If the intent is instead a *licensed* remake, stop and resolve licensing before M1 — it changes
the art plan completely, and most of §3.4 becomes "port the original assets."

---

## 1. Product definition

### 1.1 Pillars

1. **The chain is a clock.** Tension comes from a visible, advancing threat you can read.
2. **Every shot is a decision** — colour, insertion point, and whether to bank a gap for a combo.
3. **Instant, honest input.** Aim latency is the whole game. Budget: ≤1 frame of input lag.
4. **Readable at arm's length** — on a Deck screen at 800p and an iPad held in two hands.

### 1.2 Definition of Done (the release gate all loops converge on)

The build ships when **all** of these hold simultaneously on both platforms:

- [ ] All modes implemented: Adventure (full level roster), Gauntlet/endless, and the
      post-Adventure hard difficulty variant.
- [ ] Every level playable start→finish, win and lose states both reachable and correct.
- [ ] Fidelity tolerance table (§0.1) passes on 100% of sampled levels.
- [ ] Zero open Sev-1/Sev-2 bugs; ≤5 open Sev-3; all Sev-4 triaged with a decision.
- [ ] Persona gates P1–P8 all PASS (§7).
- [ ] Perf budgets met on target hardware (§9) including a 60-minute soak.
- [ ] Accessibility checklist complete (§10), colourblind mode verified by an affected tester.
- [ ] Deck Verified checklist self-audit clean; iPad App Store guideline self-audit clean.
- [ ] Save/restore survives suspend, force-quit, and OS update on both platforms.
- [ ] Crash-free session rate ≥99.5% across the final beta week.

Anything not met sends the project back into the relevant loop (§8). No date-based shipping.

---

## 2. Phase 0 — Reference capture and specification (2–3 weeks)

**This phase is the single highest-leverage investment.** Fidelity cannot be achieved by memory
or by feel; it is achieved by measurement. Nothing gets implemented in Phase 2 that does not
have a spec line traceable to a capture.

### 2.1 Deliverable: the Mechanics Spec

A living document, `docs/spec/`, one file per system, each entry in the form:

```
SPEC-BALL-014  Insertion displacement
  Rule:      A shot ball inserted between chain balls i and i+1 pushes the sub-chain
             from i+1 forward along the curve by exactly one ball diameter, easing over
             N frames with curve C.
  Reference: ref/clips/insert_mid_chain_003.mp4 @ 00:04.12–00:04.38
  Measured:  N = 7 frames, ease = cubic-out (fit R²=0.994)
  Tests:     sim/tests/insert.spec.ts::displaces_subchain_one_diameter
  Status:    VERIFIED
```

Every spec entry is `DRAFT → MEASURED → IMPLEMENTED → VERIFIED`. The Phase 0 exit gate is
100% of spec entries at ≥MEASURED.

### 2.2 Capture methodology

- Record the original at **60fps lossless**, uncompressed, fixed window size, with an on-screen
  frame counter overlay. Compressed captures destroy the 1-frame measurements we need.
- For each measurable quantity, capture **3 independent takes**; use the median. Log variance —
  high variance usually means we've misidentified the variable (e.g. speed is level-indexed,
  not global).
- Build `tools/framestep/` — a scrub tool that steps frames, marks positions with a click, and
  exports a CSV of (frame, x, y). This is how curves and speeds get digitised, and it pays for
  itself within the first two levels.
- Curve extraction: trace each level's path, fit to a Catmull-Rom spline, export control points
  to `content/curves/<level>.json`. Store an overlay screenshot for the §6.2 diff test.

### 2.3 Feature inventory to confirm and complete

Treat the list below as a **hypothesis to be verified during capture**, not as truth. Anything
observed in reference and missing here gets added; anything here not observed gets struck.
Explicitly **do not** hardcode remembered numbers — every count and rate comes from §2.2.

**Core loop:** frog idol at a fixed point, rotate-to-aim, fire coloured ball; balls flow along a
curve from a spawn hole toward a skull/exit hole; reaching the exit is a loss; match 3+ same
colour to pop; the level's progress gauge fills as balls are destroyed; when the gauge completes
the spawn stops and the level is won by clearing the remainder.

**Mechanics to spec:** ball insertion and displacement; chain compaction after a pop; gap
creation and gap-collapse combos (the chain-reaction scoring engine); colour-swap / second-ball
hold; the "cannot fire while a shot is in flight" rule (verify — may be time-gated instead);
colour retirement (colours are removed from the spawn pool as they're eliminated); ball
generation weighting; multi-lane curves with overlapping segments and correct z-ordering and
collision between overlapping lanes.

**Power-ups (spec each: spawn rate, duration, stacking rules, visual tell):** explosion/bomb,
lightning/line-clear, backwards (chain reverses), slow-down, accuracy/laser sight. Confirm the
complete set and whether rates are level-scaled.

**Scoring:** base pop value; combo/chain multipliers and their callout tiers; gap-shot bonus;
coin pickups; fruit/bonus-target spawns and values; clear-the-board ("all balls gone") bonus;
extra-life thresholds; end-of-level bonus formula.

**Meta:** Adventure progression and level→level unlock structure; temple/chapter grouping and
inter-level screens; Gauntlet/endless scaling curve; hard-mode delta after Adventure completion;
high-score tables; per-level stats.

### 2.4 Also produced in Phase 0

- **Tuning table** `content/tuning.json` — every constant, level-indexed, with a `source` field
  pointing at the spec entry. No magic numbers in code, ever. This file *is* the fidelity.
- **Input map** for touch and gamepad (§3.5).
- **Risk register** first pass (§13).

---

## 3. Phase 1 — Design (3 weeks, overlaps Phase 0 tail)

### 3.1 Architecture decision (make this call at the start of Phase 1)

**Recommendation: TypeScript + a deterministic pure-TS simulation core + PixiJS (WebGL2) renderer.**

| Option | iPad path | Deck path | Verdict |
|---|---|---|---|
| **TS + PixiJS** (recommended) | Capacitor → native App Store build | Electron/Tauri + Steamworks → native Linux | Best tooling for headless determinism testing; one codebase; team likely already fluent; WebGL2 is ample for 2D sprite counts here |
| Godot 4 | First-class iOS export | First-class Linux export, best Deck story | Strong alternative. Choose this if the team is Godot-native. Headless sim testing is more awkward |
| Unity | Mature | Mature | Heaviest; licensing overhead; overkill for a 2D sprite game |
| Native (Swift + C++/SDL) | Best iPad feel | Best Deck perf | Two codebases. Rejected — cost not justified |

**Non-negotiable architectural rule, whichever engine wins:**

```
sim/     pure, deterministic, zero rendering, zero platform APIs, fixed 120Hz timestep
         → input: (state, InputEvent[]) → output: (state', Event[])
render/  reads sim state, owns interpolation, owns all visuals
platform/ input, audio, storage, store SDKs
```

This split is what makes fidelity testable: the sim runs headless in CI at thousands of
times realtime, replays are just input logs, and every bug is reproducible from a seed +
input log. Do not let rendering leak into `sim/`. Enforce with a lint rule and a CI
dependency check that fails the build if `sim/` imports anything from `render/` or `platform/`.

### 3.2 Determinism requirements

- Fixed timestep 120Hz, render interpolated. Never step the sim off wall-clock delta.
- Seeded PRNG (PCG32) in `sim/`; `Math.random` banned in `sim/` by lint rule.
- No floating-point-order dependence across platforms: fixed iteration orders, no
  set/map iteration in physics, and a cross-platform determinism CI job that runs the same
  replay on Linux + macOS/iOS-sim and compares a state hash per frame.
- **Replay format:** `{seed, tuningHash, inputEvents[]}`. Every bug report auto-attaches one.
  This single decision cuts bug-repro time more than any other in the plan.

### 3.3 Content plan

- Level roster driven entirely by Phase 0's confirmed count. Each level = curve JSON +
  tuning row + palette + backdrop. Authoring is data, not code.
- **Level editor tool** (`tools/leveled/`) — draw/edit curves, preview flow, hot-reload into the
  game. Non-optional: hand-editing spline JSON for a full roster will not converge.
- Content checklist spreadsheet: one row per level × {implemented, curve-diff pass, playtested,
  fidelity-verified, perf-verified}. This is the burndown that tells you if you're actually done.

### 3.4 Art Bible (original assets)

- Visual identity: carved stone, jade, and gold on dark temple interiors. Distinct from the
  original by design (see §0.2) while preserving the *functional* properties that make the game
  readable.
- **Balls are the hardest art problem.** Requirements: 6 colours distinguishable at 32px, on
  every backdrop, in motion, for colourblind players. Solution: colour **plus** a distinct
  engraved glyph per colour (spiral / cross / dot-triad / chevron / ring / star), always on, not
  a toggle. This is both an accessibility win and a fidelity-of-readability win.
- Asset list: balls (6 × normal + 5 power-up overlays), shooter idol (rotation atlas), curve
  path decals, spawn/exit hole art, 6–8 backdrops, coins, bonus targets, VFX (pop, chain, bomb,
  lightning, gauge fill), full UI kit, both platforms' icons and store art.
- Resolution: author at 2× Deck native (2560×1600) so iPad Retina and Deck both downsample.
  Sprite atlases with mip-safe padding.

### 3.5 UX and input design

**iPad (touch-first):**
- Primary: **drag anywhere to aim** (the shooter tracks a continuous vector), release to fire —
  plus **tap-to-fire-at-point** as an alternative, both always active, no settings dialog needed.
- Colour-swap: two-finger tap, and an on-screen button in the safe area.
- No UI within the thumb-rest zones; respect safe areas and the home indicator.
- Support all four orientations; landscape-primary. Handle Split View / Stage Manager resizing
  without breaking the sim (resize is a render concern only — another reason for §3.1).
- 120Hz ProMotion: render at display rate, sim stays 120Hz fixed.

**Steam Deck (gamepad-first):**
- Right stick aims (with a tuned response curve + optional aim assist strength slider),
  `A`/`R2` fires, `X` swaps colour, `L2` slow-aim modifier for precision shots.
- Optional gyro aiming (off by default), optional trackpad aiming.
- Ship a **default Steam Input configuration** — a Deck Verified requirement.
- Full controller navigation of every menu; correct Xbox-style glyphs; no keyboard needed
  anywhere, ever.
- Handle suspend/resume mid-level without state loss (auto-save every settled shot).

**Both:** first-run onboarding that teaches insertion and gap-combos in-game, no wall of text.

### 3.6 Audio design

Original music (per-chapter loops + tension layer that rises as the chain nears the exit) and
SFX (fire, insert, pop tiers 3/4/5+, combo escalation stinger, power-up activations, gauge
fill, win, lose). Callout voice lines: **write original callouts**, do not reuse the original's
words if they are distinctive marks. Duck music under callouts. Full mix on Deck speakers *and*
iPad speakers — test on device, not headphones.

### 3.7 Design phase exit gate

GDD, art bible, audio bible, input maps, and the tuning table all reviewed and signed off;
tech stack decision recorded as an ADR in `docs/adr/`; level editor spec approved.

---

## 4. Phase 2 — Development milestones

Each milestone ends with a **playable build on both target devices** and a persona test round
(§7). No milestone is complete on a developer machine alone.

| # | Milestone | Contents | Exit criteria |
|---|---|---|---|
| **M0** | Skeleton | Repo, CI, sim/render/platform split, deterministic loop, replay record/playback, both platform shells booting to a black screen | Replay of 10k frames byte-identical on Linux + iOS sim |
| **M1** | Vertical slice | One level end-to-end: curve, spawn, aim, fire, insert, match, pop, compaction, win, lose. Placeholder art | A designer can play the level and it *feels* like the reference on both devices |
| **M2** | Full core mechanics | Gap combos, chain scoring, colour retirement, multi-lane curves with overlaps, all power-ups, coins, bonus targets, full scoring | Behavioural suite (§6.3) green; fidelity tolerances pass on the slice level |
| **M3** | Content complete | Level editor shipped; entire level roster authored; all chapters; Adventure progression; inter-level screens | 100% of content checklist rows at "implemented + curve-diff pass" |
| **M4** | Modes + meta | Gauntlet/endless, hard mode, high scores, per-level stats, save/load, settings, cloud save | All modes reachable and completable; save survives kill -9 |
| **M5** | Art/audio complete + polish | Final art and audio in, VFX, screen shake, juice pass, localisation (EN + 6), onboarding | No placeholder assets remain; localisation QA pass |
| **M6** | Platform hardening | Perf optimisation to budget, Deck Verified audit, App Store audit, store assets, legal sign-off, Steamworks + Game Center integration | §9 budgets met; both platform checklists clean |
| **M7** | Beta | Closed beta (Steam playtest + TestFlight), telemetry, crash reporting | Crash-free ≥99.5%, no open Sev-1/2 |
| **M8** | Release | 1.0 ship both stores | §1.2 Definition of Done fully satisfied |

**Rough schedule:** ~9–11 months at 4–6 people (2 eng, 1 designer, 1 artist, part-time audio,
part-time QA lead + rotating persona testers). Compress by cutting content breadth, never by
cutting Phase 0 or the loops.

---

## 5. Engineering practices that carry the fidelity goal

- **Tuning hot-reload.** `tuning.json` reloads live in dev builds. Fidelity tuning is an
  iterative feel-matching activity; a 30-second rebuild loop kills it.
- **Side-by-side harness.** A dev tool that plays reference footage next to the live game,
  frame-locked and scrubbable. Fastest way to close the last 5% of feel.
- **Debug overlay:** curve control points, ball indices, collision radii, chain gap state,
  spawn-pool contents, current tuning row, frame timing graph. Toggled in dev builds.
- **Headless sim CLI:** `temple-sim --level 7 --seed 42 --replay r.json --assert-hash …` —
  the backbone of §6 and of CI.
- **Every fixed bug gets a replay-based regression test.** No exceptions. The regression corpus
  is the asset that lets the loops in §8 actually terminate.
- **Trunk-based, feature-flagged, CI on every push:** typecheck, lint (incl. the sim-purity and
  no-`Math.random` rules), unit, behavioural, determinism cross-platform, curve-diff, perf smoke,
  build both platforms.

---

## 6. Fidelity validation methodology

### 6.1 Constant verification
Unit-test every derived constant against its captured measurement, with the tolerance from
§0.1. A tuning change that breaks a tolerance fails CI — you cannot "feel-tune" your way out
of spec silently.

### 6.2 Curve overlay diff
For each level, render the authored curve and diff it against the traced reference overlay.
Fail if max deviation >1.5 ball radii or if topology (crossings, lane count) differs.

### 6.3 Behavioural test suite
Table-driven rule tests in the headless sim: for a given board state + shot, assert the exact
resulting board, score delta, and event sequence. Every §2.3 mechanic gets a table, including
the nasty ones: simultaneous multi-gap collapse, insertion into a gap, pop during a
backwards power-up, power-up expiring mid-chain-reaction, colour retirement racing a pop.
**This suite is where the "full fidelity" claim actually lives.**

### 6.4 Monte-Carlo statistical checks
10k headless runs per level: assert power-up spawn rates, colour distribution, average level
duration, and win-rate-under-random-play all sit inside reference-derived bands. Catches
distribution bugs no hand-test will ever find.

### 6.5 Human feel review
Two designers independently play reference and build blind (§7 P2 persona) and rate 10 feel
dimensions. Disagreement >1 point triggers a §2.2 re-measurement of that dimension — feel
complaints get converted into measurements, not into arguments.

---

## 7. Persona-driven iterative testing

Each persona is a defined tester profile with a **script**, a **rubric**, and a **PASS gate**.
Personas run at every milestone from M1 on; the gate must pass before the milestone closes.
Recruit real humans for P1–P6 (5–8 per persona); P7/P8 are specialist/automated.

| ID | Persona | Who | Looking for | PASS gate |
|---|---|---|---|---|
| **P1** | **Nostalgic returning fan** | Played the original heavily | "Does this feel like the game I remember?" | ≥8/10 median feel score; no "this is wrong" callout unresolved |
| **P2** | **Fidelity auditor** | Designer with reference access | Frame-level divergence, rule mismatches | Zero unresolved divergences outside §0.1 tolerance |
| **P3** | **Complete newcomer** | Never played a marble shooter | Onboarding clarity, discoverability of insertion/combos | ≥80% clear level 1 unaided; can explain gap-combos after 15 min |
| **P4** | **Expert / high-score chaser** | Competitive puzzle player | Depth, exploits, scoring degeneracies, input ceiling | No score exploit; can express intent at max chain speed |
| **P5** | **Touch-only iPad player** | Casual, plays on couch/bed | Ergonomics, aim precision, thumb occlusion, one-handed | ≥90% of shots land on intended target in a calibration task |
| **P6** | **Steam Deck / gamepad player** | Handheld PC gamer | Stick aim feel, glyphs, suspend/resume, battery, text legibility at 800p | Completes a chapter with controller only; no legibility complaints |
| **P7** | **Accessibility tester** | Colourblind (deutan/protan/tritan), low-vision, motor-impaired, HoH | Colour discrimination, target sizes, timing pressure, captioning | All 6 colours distinguished by all CVD types; §10 checklist clean |
| **P8** | **Adversarial QA / soak** | QA engineer + automation | Crashes, state corruption, edge cases, backgrounding, network loss, storage full | 60-min soak clean; fuzz + monkey-test suite clean |

**Additional rounds:** localisation testers per language at M5; a 10-year-old and a 60-year-old
tester at M5 for age-range readability; performance testers on the oldest supported iPad.

**Session protocol:** think-aloud, screen + face recording (with consent), no facilitator help
for the first 10 minutes, structured rubric afterward. Every session auto-captures replays, so
"it did something weird" becomes a reproducible test case instead of a shrug.

---

## 8. The loops (this is the mechanism that gets us to "fully functional")

Five nested loops. **Each has an explicit exit condition, and the project cannot advance past
a loop until its condition holds.** Time does not exit a loop; only the criteria do.

### L1 — Daily build loop (every push)
`code → CI (typecheck, lint, unit, behavioural, determinism, curve-diff, perf smoke, both
platform builds) → red build blocks merge`
**Exit:** trunk green. Always.

### L2 — Fidelity tuning loop (continuous, M1→M6)
`measure reference (§2.2) → set tuning → §6.1/6.2/6.3/6.4 checks → §6.5 feel review →
divergence? → re-measure or re-tune`
**Exit:** every spec entry at VERIFIED; all §0.1 tolerances pass; P2 reports zero unresolved
divergences.

### L3 — Persona playtest loop (every milestone)
`build to devices → run P1–P8 → log findings with replays → triage (§8.1) → fix → re-test the
same personas on the new build`
**Exit:** all eight persona gates PASS **on the same build**. A fix that breaks another
persona's gate re-opens the loop — this is why the gates must be re-run together, not
individually signed off across different builds.

### L4 — Bug convergence loop (M6→M8, runs until release)
`triage → fix → regression test added → full regression suite → re-verify persona gates
affected → measure open-bug burndown`
**Exit:** zero Sev-1/Sev-2; ≤5 Sev-3; all Sev-4 dispositioned; **and** the last two weeks show
a *declining* find-rate. A flat or rising find-rate means the build is not converging —
extend the loop, do not ship. If three consecutive iterations fail to reduce Sev-2 count,
escalate: stop feature work entirely and run a dedicated stabilisation sprint.

### L5 — Beta/telemetry loop (M7, then post-launch)
`release to beta cohort → telemetry + crash + funnel analysis → fix → re-release`
**Exit:** crash-free ≥99.5%; level-completion funnel shows no unintended difficulty cliff
(no level where >40% of players stall for >10 attempts unless reference indicates it should);
no Sev-1/2 from the field for 7 consecutive days.

### 8.1 Triage rules

| Sev | Definition | SLA |
|---|---|---|
| **1** | Crash, save corruption, progression blocker, sim desync | Fix immediately, hotfix if live |
| **2** | Mechanic wrong vs. spec, scoring wrong, level unwinnable, input broken on a platform | Fix before milestone close |
| **3** | Visual/audio defect, minor UX friction, non-blocking edge case | Fix before release if capacity allows |
| **4** | Polish, nice-to-have, cosmetic nit | Explicit ship/cut decision recorded |

All bugs land in one tracker with: platform, build, replay attachment, seed, persona source,
severity, spec reference. **Any bug tagged "fidelity" must cite a spec entry or reference clip
timestamp** — otherwise it's a feel opinion and goes through §6.5 instead.

---

## 9. Performance budgets and platform hardening

**Steam Deck (LCD 1280×800 @60Hz; also validate OLED 1280×800 @90Hz):**
frame budget 16.6ms (11.1ms at 90Hz) with ≥30% headroom; ≥60fps sustained with zero dropped
frames during max-chain-reaction VFX; TDP target ≤8W for ~4h+ battery; load-to-playable <5s;
suspend/resume <1s with no state loss; text ≥ Deck-legible minimum sizes.

**iPad (baseline: oldest supported device, not the newest):**
60fps floor, 120fps on ProMotion; thermals stable over a 60-min soak (no throttle-induced
stutter); memory well under the jetsam limit; cold launch <3s; background/foreground and
call-interrupt safe; battery drain benchmarked and reported.

**Both:** deterministic sim cost measured separately from render cost; automated perf smoke in
CI on a fixed replay with a regression threshold, so perf can't silently rot.

---

## 10. Accessibility (designed in, not bolted on)

- Colourblind-safe by default via colour **+ always-on glyph** per ball (§3.4) — verified by P7
  testers, not just by a simulator.
- Adjustable game speed / "relaxed mode" (chain advance multiplier 0.5×–1×) as an accessibility
  option, clearly separated from the fidelity-accurate default so it never muddies §6 testing.
- Remappable controls; adjustable aim sensitivity and aim assist; no required rapid input;
  no essential timing under 500ms outside core gameplay.
- Scalable UI text, high-contrast mode, reduce-motion / reduce-flash options (screen shake and
  flash effects individually disableable — important for photosensitivity).
- Full captions/visual indicators for every audio cue; game fully playable muted.
- iPadOS: VoiceOver on all menus, Dynamic Type respected in UI chrome.

---

## 11. Release

**Steam:** store page, capsule art, trailer, Deck Verified submission (allow review time),
Steam Input default config, cloud saves, achievements, depot/branch setup, launch a demo
(first chapter) — demos measurably drive wishlist conversion for this genre.

**iPad:** App Store Connect, TestFlight beta, age rating, privacy manifest and nutrition label,
IAP decision (recommendation: **paid, no ads, no IAP** — matches the genre's premium
expectation and avoids a second monetisation design problem), Game Center leaderboards,
iCloud save sync, screenshots for every required device class.

**Both:** press/creator kit, launch-day monitoring rota, hotfix pipeline rehearsed *before*
launch (practice shipping a trivial patch through both stores during M6 — Apple review latency
must be a known quantity, not a launch-day surprise), day-1 patch branch ready.

**Post-launch:** 30/60/90-day loop of telemetry review → patch; then optional content
expansions (new chapters, daily challenge) as data warrants.

---

## 12. Repo layout

```
/sim/            deterministic core (no rendering, no platform)
/render/         PixiJS renderer, VFX, interpolation
/platform/       ios/ deck/ shared/ — input, audio, storage, store SDKs
/content/        curves/, tuning.json, levels/, palettes/, i18n/
/assets/         art/, audio/ (originals; source files in LFS)
/tools/          framestep/, leveled/, sidebyside/, simcli/
/tests/          unit/, behavioural/, determinism/, curvediff/, perf/, replays/
/docs/           spec/, adr/, gdd.md, artbible.md, personas.md, this plan
/.github/        CI workflows
```

Reference captures: **never in this repo** (§0.2).

---

## 13. Risk register

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| IP/legal challenge | Fatal | Medium | §0.2 original assets, legal gate at M6, no marks anywhere |
| Fidelity can't be measured precisely enough | High | Medium | Phase 0 tooling investment; §6.5 converts feel into measurement |
| Curve authoring underestimated for full roster | High | **High** | Level editor is M3-blocking; budget 2–3 days/level, not hours |
| Touch aim precision insufficient on iPad | High | Medium | Prototype both aim schemes in M1; P5 gate at every milestone |
| Deck Verified rejection | Medium | Medium | Self-audit from M2, not M6; default Steam Input config early |
| Sim non-determinism across platforms | High | Medium | Cross-platform determinism CI from M0 |
| Scope creep from "full fidelity" ambiguity | High | High | §0.1 tolerance table is the contract; anything outside it is out of scope |
| L4 never converges | High | Low | Declining-find-rate rule + forced stabilisation sprint (§8) |
| Perf collapse during max chain reactions | Medium | Medium | Perf smoke in CI on a worst-case replay from M2 |
| Key-person dependency on the spec | Medium | Medium | Spec is written, reviewed, and in-repo — never tribal knowledge |

---

## 14. Immediate next actions

1. **Decide:** clone-with-original-assets (§0.2) vs. pursue a licence. Blocks the art plan.
2. **Decide:** TS+PixiJS vs. Godot 4 — record as ADR-0001.
3. Confirm target device floor (which iPad generation? Deck LCD and/or OLED?).
4. Stand up the repo skeleton, CI, and the `sim/render/platform` split (M0).
5. Start Phase 0 capture — build `tools/framestep/` first, then digitise level 1's curve and
   measure the four core speeds. That first end-to-end pass through capture → spec → tuning →
   test will expose whatever is wrong with this plan while it's still cheap to fix.
