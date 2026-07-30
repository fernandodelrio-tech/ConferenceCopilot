// Input — plan §3.6. Touch (iPhone/iPad) and gamepad (Steam Deck) are both
// first-class and both always live; there is no "control scheme" setting to find.
//
// Everything here converts device events into the sim's tiny input vocabulary
// ({aim, fire, swap}), so the sim never learns what a touchscreen is.

const DEADZONE = 0.22;

export function createInput(canvas, getContext) {
  const state = {
    angle: -Math.PI / 2,
    angleDirty: true,
    fireQueued: 0,
    swapQueued: 0,
    pauseQueued: 0,
    pointers: new Map(),
    dragging: false,
    lastGamepadButtons: [],
    slowAim: false,
    usingGamepad: false,
  };

  const aimAt = (clientX, clientY) => {
    const ctx = getContext();
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const { fit, shooter } = ctx;
    const bx = (clientX - rect.left - fit.x) / fit.scale;
    const by = (clientY - rect.top - fit.y) / fit.scale;
    const dx = bx - shooter[0];
    const dy = by - shooter[1];
    if (dx * dx + dy * dy < 4) return;
    state.angle = Math.atan2(dy, dx);
    state.angleDirty = true;
  };

  // --- pointer: tap-to-fire-at-point AND drag-to-aim/release-to-fire, unified.
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture?.(e.pointerId);
    state.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    state.usingGamepad = false;

    // A second finger down is the colour swap (plus the on-screen button).
    if (state.pointers.size >= 2) {
      state.swapQueued++;
      state.dragging = false;
      return;
    }
    state.dragging = true;
    aimAt(e.clientX, e.clientY);
    e.preventDefault();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!state.pointers.has(e.pointerId)) return;
    state.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (state.dragging && state.pointers.size === 1) aimAt(e.clientX, e.clientY);
  });

  const release = (e) => {
    const had = state.pointers.delete(e.pointerId);
    if (had && state.dragging && state.pointers.size === 0) {
      state.fireQueued++;
      state.dragging = false;
    }
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', (e) => {
    state.pointers.delete(e.pointerId);
    state.dragging = false;
  });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // --- desktop keyboard (dev, and Deck in desktop mode)
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'Space') {
      state.fireQueued++;
      e.preventDefault();
    } else if (e.code === 'KeyX' || e.code === 'ShiftLeft') {
      state.swapQueued++;
    } else if (e.code === 'Escape' || e.code === 'KeyP') {
      state.pauseQueued++;
    }
  });

  return {
    state,

    // Steam Deck: right stick aims, A/R2 fires, X swaps, L2 is the precision
    // modifier. Polled rather than event-driven because that is how the Gamepad
    // API works.
    pollGamepad(dt) {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const pad = [...pads].find((p) => p && p.connected);
      if (!pad) return;

      const ax = pad.axes[2] ?? 0;
      const ay = pad.axes[3] ?? 0;
      const mag = Math.hypot(ax, ay);
      if (mag > DEADZONE) {
        state.usingGamepad = true;
        const target = Math.atan2(ay, ax);
        if (state.slowAim) {
          // Precision modifier: ease toward the stick direction instead of
          // snapping, so fine corrections are possible at 90Hz.
          let delta = target - state.angle;
          while (delta > Math.PI) delta -= Math.PI * 2;
          while (delta < -Math.PI) delta += Math.PI * 2;
          state.angle += delta * Math.min(1, dt * 6);
        } else {
          state.angle = target;
        }
        state.angleDirty = true;
      }

      const pressed = (i) => !!(pad.buttons[i] && pad.buttons[i].pressed);
      const edge = (i) => pressed(i) && !state.lastGamepadButtons[i];

      state.slowAim = pressed(6); // L2
      if (edge(0) || edge(7)) state.fireQueued++; // A / R2
      if (edge(2)) state.swapQueued++; // X
      if (edge(9) || edge(8)) state.pauseQueued++; // Start / Select

      state.lastGamepadButtons = pad.buttons.map((b) => b.pressed);
    },

    // Drain into sim input events.
    drain() {
      const out = [];
      if (state.angleDirty) {
        out.push({ type: 'aim', angle: state.angle });
        state.angleDirty = false;
      }
      while (state.swapQueued > 0) {
        out.push({ type: 'swap' });
        state.swapQueued--;
      }
      while (state.fireQueued > 0) {
        out.push({ type: 'fire' });
        state.fireQueued--;
      }
      return out;
    },

    takePause() {
      if (state.pauseQueued > 0) {
        state.pauseQueued = 0;
        return true;
      }
      return false;
    },

    queueSwap() {
      state.swapQueued++;
    },
  };
}
