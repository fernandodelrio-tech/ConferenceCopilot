// Persistence. localStorage today; the shape is deliberately a single JSON blob so
// swapping in iCloud key-value sync (iOS) and Steam Cloud (Deck) is a change of
// backend, not a change of schema.

const KEY = 'ascendant.save.v1';

const DEFAULTS = {
  version: 1,
  unlocked: 1,
  best: {},        // levelId -> high score
  totalScore: 0,
  settings: {
    sound: true,
    reduceMotion: false,
    relaxed: 1,    // chain speed multiplier; 1 = the tuned default
    debug: false,
  },
  inProgress: null, // { levelId, mode, state }
};

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const parsed = JSON.parse(raw);
    return {
      ...structuredClone(DEFAULTS),
      ...parsed,
      settings: { ...DEFAULTS.settings, ...(parsed.settings || {}) },
      best: { ...(parsed.best || {}) },
    };
  } catch {
    // A corrupt save must never be a dead end.
    return structuredClone(DEFAULTS);
  }
}

export function save(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false; // private mode / quota — the game keeps running regardless
  }
}

export function recordResult(data, levelId, score, won) {
  if (score > (data.best[levelId] || 0)) data.best[levelId] = score;
  if (won && levelId + 1 > data.unlocked) data.unlocked = levelId + 1;
  data.totalScore = Object.values(data.best).reduce((a, b) => a + b, 0);
  data.inProgress = null;
  save(data);
  return data;
}
