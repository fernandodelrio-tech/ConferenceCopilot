// Audio — plan §3.7. Fully synthesised: no audio files, so nothing to load, nothing
// to license, and the whole game stays a single static bundle.
//
// The plan flags one trap this theme creates, and it is honoured here: continuous
// steam hiss is broadband noise sitting exactly on top of the transients the player
// needs for shot and pop feedback. The ambient bed is therefore low-passed hard,
// kept quiet, and ducked whenever a gameplay cue fires.

export function createAudio() {
  let ctx = null;
  let master = null;
  let ambientGain = null;
  let enabled = true;
  let started = false;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    return ctx;
  }

  function noiseBuffer(seconds) {
    const n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buf.getChannelData(0);
    // Deterministic noise: audio must never touch the sim's PRNG, and Math.random
    // here would be harmless but pointless.
    let x = 22222;
    for (let i = 0; i < n; i++) {
      x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
      data[i] = (x / 2147483648) - 1;
    }
    return buf;
  }

  function tone({ freq, dur = 0.12, type = 'sine', gain = 0.2, sweepTo = null, delay = 0 }) {
    if (!enabled || !ensure()) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (sweepTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise({ dur = 0.15, gain = 0.2, freq = 1200, q = 1, type = 'bandpass', delay = 0 }) {
    if (!enabled || !ensure()) return;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(Math.max(0.05, dur));
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(g).connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  function duck() {
    if (!ambientGain || !ctx) return;
    const t = ctx.currentTime;
    ambientGain.gain.cancelScheduledValues(t);
    ambientGain.gain.setValueAtTime(ambientGain.gain.value, t);
    ambientGain.gain.linearRampToValueAtTime(0.006, t + 0.02);
    ambientGain.gain.linearRampToValueAtTime(0.03, t + 0.5);
  }

  return {
    resume() {
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume();
      if (started) return;
      started = true;

      // Ambient bed: a low engine-room drone plus heavily low-passed hiss. Both
      // are deliberately quiet and well below the SFX band.
      const drone = ctx.createOscillator();
      const droneGain = ctx.createGain();
      drone.type = 'sawtooth';
      drone.frequency.value = 46;
      droneGain.gain.value = 0.03;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 220;

      ambientGain = ctx.createGain();
      ambientGain.gain.value = 0.03;

      drone.connect(lp).connect(ambientGain).connect(master);
      drone.start();
    },

    setEnabled(v) {
      enabled = v;
      if (master) master.gain.value = v ? 0.5 : 0;
    },

    // Tension layer: the drone rises with the boiler needle (§3.7).
    setTension(frac) {
      if (!ambientGain || !ctx) return;
      ambientGain.gain.setTargetAtTime(0.03 + frac * 0.05, ctx.currentTime, 0.4);
    },

    handle(events) {
      if (!enabled) return;
      for (const e of events) {
        switch (e.type) {
          case 'fire':
            noise({ dur: 0.09, gain: 0.14, freq: 900, q: 0.7 });
            tone({ freq: 180, sweepTo: 90, dur: 0.09, type: 'triangle', gain: 0.16 });
            break;
          case 'insert':
            tone({ freq: 1500, dur: 0.045, type: 'square', gain: 0.05 });
            break;
          case 'pop': {
            duck();
            const step = Math.min(e.comboStep, 6);
            noise({ dur: 0.2, gain: 0.2, freq: 2400 + step * 300, q: 0.9 });
            tone({ freq: 300 * Math.pow(1.16, step), dur: 0.16, type: 'triangle', gain: 0.18 });
            if (e.count >= 4) tone({ freq: 520, sweepTo: 900, dur: 0.2, type: 'sine', gain: 0.12, delay: 0.03 });
            if (step >= 2) {
              // Escalating stinger for each further link in the chain.
              for (let i = 0; i < step && i < 5; i++) {
                tone({ freq: 400 * Math.pow(1.25, i), dur: 0.1, type: 'square', gain: 0.07, delay: 0.05 + i * 0.05 });
              }
            }
            break;
          }
          case 'powerup':
            duck();
            tone({ freq: 220, sweepTo: 1400, dur: 0.35, type: 'sawtooth', gain: 0.13 });
            noise({ dur: 0.3, gain: 0.12, freq: 3200, q: 0.6 });
            break;
          case 'coin':
            tone({ freq: 1180, dur: 0.09, type: 'square', gain: 0.1 });
            tone({ freq: 1760, dur: 0.12, type: 'square', gain: 0.09, delay: 0.07 });
            break;
          case 'extraLife':
            [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, dur: 0.18, type: 'triangle', gain: 0.13, delay: i * 0.09 }));
            break;
          case 'win':
            [392, 523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, dur: 0.4, type: 'triangle', gain: 0.16, delay: i * 0.13 }));
            break;
          case 'lose':
            tone({ freq: 260, sweepTo: 60, dur: 1.1, type: 'sawtooth', gain: 0.2 });
            noise({ dur: 0.9, gain: 0.15, freq: 300, q: 0.4, type: 'lowpass' });
            break;
          default:
            break;
        }
      }
    },
  };
}
