// Dependency-free test harness. No devDependencies means CI has nothing to install
// and nothing to be compromised by.

const suites = [];
let current = null;

export function suite(name, fn) {
  current = { name, tests: [] };
  suites.push(current);
  fn();
  current = null;
}

export function test(name, fn) {
  current.tests.push({ name, fn });
}

export function assert(cond, message) {
  if (!cond) throw new Error(message || 'assertion failed');
}

export function eq(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'expected equality'}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
  }
}

export function near(actual, expected, tol, message) {
  if (!(Math.abs(actual - expected) <= tol)) {
    throw new Error(`${message || 'expected near'}: got ${actual}, want ${expected} +/- ${tol}`);
  }
}

export function inRange(actual, lo, hi, message) {
  if (!(actual >= lo && actual <= hi)) {
    throw new Error(`${message || 'out of band'}: got ${actual}, want [${lo}, ${hi}]`);
  }
}

export function run() {
  let passed = 0;
  const failures = [];

  for (const s of suites) {
    console.log(`\n  ${s.name}`);
    for (const t of s.tests) {
      try {
        t.fn();
        passed++;
        console.log(`    ✓ ${t.name}`);
      } catch (err) {
        failures.push({ suite: s.name, test: t.name, err });
        console.log(`    ✗ ${t.name}`);
        console.log(`        ${err.message}`);
      }
    }
  }

  console.log(`\n${passed} passed, ${failures.length} failed\n`);
  if (failures.length) process.exitCode = 1;
  return failures.length === 0;
}
