# ASCENDANT — The Ascendant Works

A steampunk marble-shooter. One build targets **iPad Pro M4**, **iPhone 16**, and
**Steam Deck OLED**.

    npm run serve      # then open http://127.0.0.1:8123/game.html
    npm test           # 63 tests, zero dependencies
    npm run verify     # loads the real game in Chromium at all three viewports
    npm run content    # regenerate lanes, trig table and derived tuning
    npm run bot -- --level 7 --seed 3    # headless bot play

## Layout

    sim/         deterministic core — no rendering, no platform, no wall clock
    render/      Canvas2D renderer, VFX, aspect fit
    platform/    input, synthesised audio, storage, app shell
    content/     lanes, difficulty profiles, tuning.json, trig table
    tools/       lane generator, tuning deriver, headless sim CLI, browser verifier
    tests/       purity, rules, behavioural, determinism, profile bands, monte-carlo
    docs/        the master plan, and the implementation status ledger

`sim/` is a pure function of `(state, inputs)` at a fixed 120Hz. It may not import
from `render/` or `platform/`, may not call `Math.random`, and may not call engine
trig — all three are enforced by `tests/purity.test.js`. That boundary is what makes
the game replay-able from `{seed, inputs}` and identical at 60Hz, 90Hz and 120Hz.

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
