// Table-driven sin/cos so the sim never calls Math.sin/Math.cos.
//
// Math.sin is not specified to be bit-identical across engines, and the sim's
// state hash must match on Linux (CI, Deck) and iOS (§3.2). Table lookup plus
// linear interpolation uses only mul/add/floor, which are IEEE-754 exact.

const TAU = Math.PI * 2;
const HALF = Math.PI;
const QUARTER = Math.PI / 2;

let TABLE = null;
let N = 0;

export function initTrig(data) {
  TABLE = data.sinQuarter;
  N = data.quarterSteps;
}

export function trigReady() {
  return TABLE !== null;
}

function quarterSin(x) {
  const t = (x / QUARTER) * N;
  let i = Math.floor(t);
  if (i >= N) return TABLE[N];
  if (i < 0) i = 0;
  const f = t - i;
  return TABLE[i] + (TABLE[i + 1] - TABLE[i]) * f;
}

export function sin(a) {
  let x = a - TAU * Math.floor(a / TAU);
  if (x <= QUARTER) return quarterSin(x);
  if (x <= HALF) return quarterSin(HALF - x);
  if (x <= HALF + QUARTER) return -quarterSin(x - HALF);
  return -quarterSin(TAU - x);
}

export function cos(a) {
  return sin(a + QUARTER);
}
