# ASCENDANT — The Ascendant Works

A steampunk marble-shooter. One build targets **iPad Pro M4**, **iPhone 16**, and
**Steam Deck OLED**.

    npm run serve      # then open http://127.0.0.1:8123/game.html
    npm run bundle     # build dist/ascendant.html — one file, no server needed
    npm test           # 63 tests, zero dependencies
    npm run verify     # loads the real game in Chromium at all three viewports
    npm run content    # regenerate lanes, trig table and derived tuning
    npm run bake       # re-bake art assets from art/bakers.js
    npm run gates      # blocking art quality gates
    npm run calibrate  # palette optimisation loop (bake -> measure -> optimise)
    npm run sheet      # contact sheet for visual review
    npm run bot -- --level 7 --seed 3    # headless bot play

## Playing it without a server

`npm run bundle` produces **`dist/ascendant.html`**: a single ~3.7 MB file with every
module, all content JSON and all 24 baked PNGs inlined. Open it directly — double-click,
drag into a browser, AirDrop it to an iPad, copy it to a Deck. No server, no install,
no network; `npm run verify:offline` asserts it makes zero external requests.

The served version at `game.html` is the one to develop against: it loads real modules
and real files, so edits are a refresh away rather than a rebuild.

## Layout

    sim/         deterministic core — no rendering, no platform, no wall clock
    art/         asset AUTHORING: shading library and procedural bakers (offline only)
    assets/      baked PNGs + manifest — what the game actually blits
    render/      Canvas2D renderer, static level layer, bloom/vignette/grain, aspect fit
    platform/    input, synthesised audio, storage, app shell
    content/     lanes, difficulty profiles, tuning.json, trig table
    tools/       lane generator, tuning deriver, headless sim CLI, browser verifier
    tests/       purity, rules, behavioural, determinism, profile bands, monte-carlo
    dist/        single-file offline build (generated)
    docs/        the master plan, and the implementation status ledger

`sim/` is a pure function of `(state, inputs)` at a fixed 120Hz. It may not import
from `render/` or `platform/`, may not call `Math.random`, and may not call engine
trig — all three are enforced by `tests/purity.test.js`. That boundary is what makes
the game replay-able from `{seed, inputs}` and identical at 60Hz, 90Hz and 120Hz.

## Graphics

Assets are procedurally authored in `art/`, baked to PNG offline, and only blitted at
runtime. `docs/graphics-protocol.md` is the production protocol: the pipeline, the
quality bar per asset class, and five blocking gates that measure contrast, backdrop
interference, colour-vision separation, small-size legibility and texture budget on
real pixels. Read §3 of it before touching the shading — the palette has to be
optimised against what reaches the screen, not against source hex values.

## Read this before judging the fidelity

`docs/IMPLEMENTATION_STATUS.md` is the honest ledger of what is built, what is not,
and what could not be. The short version: **Phase 0 of the plan — measuring the
reference — was not executed and could not be here**, so every constant in
`content/tuning.json` is a `DESIGN-ESTIMATE` and the fidelity tolerances in the plan
are *unverified*. The game is complete, tested and plays well; that is a different
claim from matching a reference.

## Controls

| | |
|---|---|
| Touch | Drag anywhere to aim, release to fire. Tap to fire at a point. Two-finger tap swaps. |
| Gamepad | Right stick aims, A/R2 fires, X swaps, L2 precision aim, Start pauses. |
| Keyboard | Mouse aims, Space fires, X swaps, Esc pauses. |

## Note on `index.html`

The `index.html` at the repo root is an unrelated earlier project (a knitted block
game) and has been left untouched. This game's entry point is `game.html`.
