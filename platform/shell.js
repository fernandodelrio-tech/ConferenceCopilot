// Application shell: content loading, the fixed-timestep loop, screens, and the
// bridge between sim events and audio/VFX.
//
// The loop is the plan's §3.1/§3.2 contract in code — the sim advances in fixed
// 120Hz ticks regardless of display rate, and the renderer interpolates. That is
// what lets one build feel identical at 60Hz (iPhone 16), 90Hz (Deck OLED) and
// 120Hz (iPad Pro) without three sets of tuning.

import { initTrig } from '../sim/trig.js';
import { createGame, step, hashState, pressureFraction } from '../sim/sim.js';
import { computeFit } from '../render/fit.js';
import { drawFrame } from '../render/draw.js';
import { loadAssets } from '../render/assets.js';
import { buildStaticLayer } from '../render/staticlayer.js';
import { createPost } from '../render/post.js';
import { createVfx, feedEvents, updateVfx } from '../render/vfx.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import * as storage from './storage.js';

const TICK_HZ = 120;
const DT = 1 / TICK_HZ;
const MAX_FRAME = 0.25;
const DPR_CAP = 2; // iPhone is 3x natively; 2x is visually identical here and much cheaper

export async function boot() {
  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d', { alpha: false });

  const [tuning, trig, index, assetInfo] = await Promise.all([
    fetch('content/tuning.json').then((r) => r.json()),
    fetch('content/trig.json').then((r) => r.json()),
    fetch('content/lanes/index.json').then((r) => r.json()),
    loadAssets(),
  ]);
  initTrig(trig);

  const levelCache = new Map();
  const loadLevel = async (id) => {
    if (!levelCache.has(id)) {
      levelCache.set(id, await fetch(`content/lanes/${String(id).padStart(2, '0')}.json`).then((r) => r.json()));
    }
    return levelCache.get(id);
  };

  const palette = tuning.palette.colors;
  const app = {
    tuning,
    index,
    save: storage.load(),
    screen: 'title',
    game: null,
    staticLayer: null,
    post: createPost(),
    dpr: 1,
    assetInfo,
    vfx: createVfx(),
    prevDist: new Map(),
    runLives: null,
    mode: 'expedition',
    fit: computeFit(1, 1, [1600, 1000]),
    time: 0,
    fps: 0,
  };

  const audio = createAudio();
  const input = createInput(canvas, () => (app.game ? { fit: app.fit, shooter: app.game.level.shooter } : null));

  // ---------------------------------------------------------------- viewport

  function resize() {
    const dpr = Math.min(DPR_CAP, window.devicePixelRatio || 1);
    app.dpr = dpr;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    app.fit = computeFit(w, h, app.game ? app.game.level.box : [1600, 1000]);
    document.body.dataset.orientation = h > w ? 'portrait' : 'landscape';
  }
  window.addEventListener('resize', resize);
  window.visualViewport?.addEventListener('resize', resize);
  screen.orientation?.addEventListener?.('change', () => setTimeout(resize, 120));

  // ------------------------------------------------------------------ screens

  const ui = {
    title: document.getElementById('screen-title'),
    levels: document.getElementById('screen-levels'),
    pause: document.getElementById('screen-pause'),
    result: document.getElementById('screen-result'),
    hudButtons: document.getElementById('hud-buttons'),
  };

  function show(name) {
    app.screen = name;
    for (const [key, el] of Object.entries(ui)) {
      if (key === 'hudButtons') continue;
      el.hidden = key !== name;
    }
    ui.hudButtons.hidden = name !== 'playing';
    if (name === 'levels') renderLevelGrid();
  }

  function renderLevelGrid() {
    const grid = document.getElementById('level-grid');
    grid.innerHTML = '';
    for (const lv of index.levels) {
      const locked = lv.id > app.save.unlocked;
      const b = document.createElement('button');
      b.className = 'level-card' + (locked ? ' locked' : '');
      b.disabled = locked;
      b.setAttribute('aria-label', `Level ${lv.id}, ${lv.name}, ${lv.chapterName}${locked ? ', locked' : ''}`);
      const best = app.save.best[lv.id];
      b.innerHTML =
        `<span class="lv-num">${String(lv.id).padStart(2, '0')}</span>` +
        `<span class="lv-name">${lv.name}</span>` +
        `<span class="lv-chapter">${lv.chapterName}</span>` +
        `<span class="lv-best">${locked ? '🔒 locked' : best ? `best ${best.toLocaleString()}` : 'unplayed'}</span>`;
      b.addEventListener('click', () => startLevel(lv.id));
      grid.appendChild(b);
    }
  }

  async function startLevel(id, keepLives = false) {
    const level = await loadLevel(id);
    if (!keepLives || app.runLives === null) app.runLives = tuning.global.startLives.v;

    app.game = createGame({
      level,
      tuning,
      seed: (id * 7919 + app.save.totalScore) >>> 0,
      mode: app.mode,
      lives: app.runLives,
      relaxed: app.save.settings.relaxed,
    });
    // Composite the level's static layer once (§ render/staticlayer.js). Slightly
    // above 1:1 so it stays sharp when the iPad scales the box up.
    app.staticLayer = buildStaticLayer(app.game, 1.6);
    app.prevDist.clear();
    app.vfx = createVfx();
    resize();
    audio.resume();
    show('playing');
  }

  function endLevel(won) {
    const g = app.game;
    app.runLives = g.state.lives;
    storage.recordResult(app.save, g.state.levelId, g.state.score, won);

    const title = document.getElementById('result-title');
    const body = document.getElementById('result-body');
    const next = document.getElementById('btn-next');
    const retry = document.getElementById('btn-retry');

    const outOfLives = !won && app.runLives <= 0;
    title.textContent = won ? 'PRESSURE HELD' : outOfLives ? 'WORKS SHUT DOWN' : 'INTAKE BREACHED';
    body.innerHTML =
      `<div class="stat"><span>Score</span><b>${g.state.score.toLocaleString()}</b></div>` +
      `<div class="stat"><span>Destroyed</span><b>${g.state.destroyed}</b></div>` +
      `<div class="stat"><span>Lives</span><b>${Math.max(0, app.runLives)}</b></div>`;

    next.hidden = !won || g.state.levelId >= index.levels.length;
    retry.hidden = outOfLives;
    if (outOfLives) app.runLives = null;
    show('result');
  }

  // -------------------------------------------------------------------- loop

  let last = performance.now();
  let acc = 0;
  let fpsAcc = 0;
  let fpsFrames = 0;

  function frame(now) {
    const dt = Math.min(MAX_FRAME, (now - last) / 1000);
    last = now;
    app.time += dt;

    fpsAcc += dt;
    fpsFrames++;
    if (fpsAcc >= 0.5) {
      app.fps = Math.round(fpsFrames / fpsAcc);
      fpsAcc = 0;
      fpsFrames = 0;
    }

    input.pollGamepad(dt);
    if (input.takePause()) {
      if (app.screen === 'playing') show('pause');
      else if (app.screen === 'pause') show('playing');
    }

    if (app.screen === 'playing' && app.game) {
      acc += dt;
      let guard = 0;
      while (acc >= DT && guard++ < 8) {
        // Snapshot pre-step distances for render interpolation.
        app.prevDist.clear();
        for (const chain of app.game.state.chains) {
          for (const b of chain.balls) app.prevDist.set(b.id, b.dist);
        }

        const events = step(app.game, input.drain());
        if (events.length) {
          // Give the turret's exhaust a position; the sim has no concept of one.
          for (const e of events) {
            if (e.type === 'fire') {
              e.x = app.game.level.shooter[0];
              e.y = app.game.level.shooter[1];
            }
          }
          feedEvents(app.vfx, events, { reduceMotion: app.save.settings.reduceMotion });
          audio.handle(events);
        }
        acc -= DT;
      }
      if (guard >= 8) acc = 0; // fell behind (tab was hidden); resync rather than spiral

      audio.setTension(pressureFraction(app.game));

      const status = app.game.state.status;
      if (status === 'won' || status === 'lost') endLevel(status === 'won');
    }

    updateVfx(app.vfx, dt);

    if (app.game) {
      drawFrame(ctx, app.game, app.fit, {
        palette,
        staticLayer: app.staticLayer,
        post: app.post,
        dpr: app.dpr,
        vfx: app.vfx,
        alpha: Math.max(0, Math.min(1, acc / DT)),
        prevDist: app.prevDist,
        time: app.time,
        debug: app.save.settings.debug,
        quality: {
          bloom: app.save.settings.effects !== false,
          grain: app.save.settings.effects !== false,
        },
      });
      if (app.save.settings.debug) {
        ctx.save();
        ctx.fillStyle = '#7fd4ff';
        ctx.font = '12px ui-monospace, monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`${app.fps} fps  hash ${hashState(app.game.state)}`, app.fit.viewW - 10, 16);
        ctx.restore();
      }
    } else {
      ctx.fillStyle = '#14171a';
      ctx.fillRect(0, 0, app.fit.viewW, app.fit.viewH);
    }

    requestAnimationFrame(frame);
  }

  // -------------------------------------------------------------------- wiring

  const on = (id, fn) => document.getElementById(id).addEventListener('click', fn);

  on('btn-play', () => {
    app.mode = 'expedition';
    app.runLives = null;
    show('levels');
  });
  on('btn-perpetual', () => {
    app.mode = 'perpetual';
    app.runLives = null;
    startLevel(Math.min(app.save.unlocked, index.levels.length));
  });
  on('btn-overpressure', () => {
    app.mode = 'overpressure';
    app.runLives = null;
    show('levels');
  });
  on('btn-levels-back', () => show('title'));
  on('btn-resume', () => show('playing'));
  on('btn-quit', () => {
    app.game = null;
    show('title');
  });
  on('btn-next', () => startLevel(Math.min(app.game.state.levelId + 1, index.levels.length), true));
  on('btn-retry', () => startLevel(app.game.state.levelId, true));
  on('btn-result-menu', () => {
    app.game = null;
    show('title');
  });
  on('btn-pause', () => show('pause'));
  on('btn-swap', () => input.queueSwap());

  // Settings
  const bindToggle = (id, key, onChange) => {
    const el = document.getElementById(id);
    el.checked = !!app.save.settings[key];
    el.addEventListener('change', () => {
      app.save.settings[key] = el.checked;
      storage.save(app.save);
      onChange?.(el.checked);
    });
  };
  bindToggle('opt-sound', 'sound', (v) => audio.setEnabled(v));
  bindToggle('opt-reduce-motion', 'reduceMotion');
  bindToggle('opt-effects', 'effects');
  bindToggle('opt-debug', 'debug');

  const relaxed = document.getElementById('opt-relaxed');
  relaxed.value = String(app.save.settings.relaxed);
  document.getElementById('opt-relaxed-value').textContent = `${Number(relaxed.value).toFixed(2)}x`;
  relaxed.addEventListener('input', () => {
    app.save.settings.relaxed = Number(relaxed.value);
    document.getElementById('opt-relaxed-value').textContent = `${app.save.settings.relaxed.toFixed(2)}x`;
    storage.save(app.save);
    if (app.game) app.game.state.relaxed = app.save.settings.relaxed;
  });

  audio.setEnabled(app.save.settings.sound);

  // Suspend/resume: the Deck suspends mid-level and iOS backgrounds on a call.
  // Pausing on hide is the difference between "resumes cleanly" and "lost a life
  // while in your pocket".
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && app.screen === 'playing') show('pause');
    if (document.hidden && app.game) {
      app.save.inProgress = { levelId: app.game.state.levelId, mode: app.mode, state: app.game.state };
      storage.save(app.save);
    }
  });

  resize();
  show('title');
  requestAnimationFrame(frame);

  // Exposed for the automated verification pass in tools/verify.mjs.
  window.__ascendant = { app, startLevel, input, show };
}
