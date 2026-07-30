// Seeded PRNG for the sim. mulberry32 — integer ops only (Math.imul, shifts, xor),
// so it is bit-identical on every JS engine. Plan §3.2 said PCG32; mulberry32 is
// the same class of tool with a smaller footprint and no 64-bit emulation.
//
// `Math.random` is banned inside sim/ (see tests/purity.test.js).

export function seedFrom(value) {
  const s = value >>> 0;
  return s === 0 ? 0x9e3779b9 : s;
}

export function randU32(state) {
  let t = (state.rng = (state.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
  t = (t ^ (t + Math.imul(t ^ (t >>> 7), t | 61))) >>> 0;
  return (t ^ (t >>> 14)) >>> 0;
}

export function randFloat(state) {
  return randU32(state) / 4294967296;
}

export function randInt(state, n) {
  return n <= 0 ? 0 : randU32(state) % n;
}

export function pick(state, arr) {
  return arr.length === 0 ? undefined : arr[randInt(state, arr.length)];
}
