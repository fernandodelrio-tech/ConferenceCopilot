// CI entry point (plan §5). No dependencies, no install step.
import './purity.test.js';
import './rules.test.js';
import './sim.test.js';
import './determinism.test.js';
import './profiles.test.js';
import './art.test.js';
import { run } from './harness.js';
run();
