import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildInputs, simulate, type Level } from "../shared/sim.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const level = JSON.parse(readFileSync(resolve(root, "level/level.json"), "utf8")) as Level;

/**
 * Differential fuzzing corpus. Every vector is computed here with the shared
 * TypeScript simulation and then replayed independently by the Foundry test
 * `test_fuzzVectorsMatchContract`. Any disagreement fails CI, which is the
 * strongest available proof that the client engine and the chain agree.
 */

const SEED = 0x5eed_1337;
const COUNT = 300;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(SEED);

function toHex(bytes: Uint8Array): string {
  let s = "0x";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

function randomBits(length: number, jumpProb: number): Uint8Array {
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i++) out[i] = rand() < jumpProb ? 1 : 0;
  return out;
}

function randInt(maxExclusive: number): number {
  return Math.floor(rand() * maxExclusive);
}

const CLEAN_JUMPS = [28, 78, 128, 160];

interface Case {
  name: string;
  kind: string;
  inputs: Uint8Array;
}

const cases: Case[] = [
  { name: "fixed-clean", kind: "goal", inputs: buildInputs(200, CLEAN_JUMPS) },
  { name: "fixed-clean-alt", kind: "goal", inputs: buildInputs(200, [30, 80, 130, 162]) },
  { name: "fixed-late-wall", kind: "goal", inputs: buildInputs(210, [28, 78, 128, 170]) },
  { name: "fixed-max-length", kind: "goal", inputs: buildInputs(600, [28, 78, 128, 565]) },
  { name: "fixed-died", kind: "died", inputs: buildInputs(200, [78, 128, 160]) },
  { name: "fixed-not-reached", kind: "notReached", inputs: buildInputs(150, [28, 78, 128]) },
  { name: "fixed-empty", kind: "empty", inputs: new Uint8Array(0) },
  { name: "fixed-too-long", kind: "tooLong", inputs: buildInputs(level.maxTicks + 1, []) },
];

const invalidBytes = (() => {
  const b = randomBits(40, 0.3);
  b[randInt(40)] = 2 + randInt(254);
  return b;
})();
cases.push({ name: "fixed-invalid", kind: "invalid", inputs: invalidBytes });

while (cases.length < COUNT) {
  const name = `fuzz-${cases.length}`;
  const roll = rand();

  if (roll < 0.3) {
    // Perturbed near-optimal runs: usually finish, sometimes clip a hazard.
    const jittered = CLEAN_JUMPS.map((t) => Math.max(1, t + randInt(9) - 2));
    if (rand() < 0.5) jittered.push(1 + randInt(200));
    const length = 200 + randInt(80);
    cases.push({ name, kind: "goal-biased", inputs: buildInputs(length, jittered) });
  } else if (roll < 0.55) {
    // Sparse jumps over a long horizon: mostly dies or never reaches the goal.
    const length = 1 + randInt(level.maxTicks);
    cases.push({ name, kind: "sparse", inputs: randomBits(length, 0.02) });
  } else if (roll < 0.8) {
    // Dense but poorly timed jumps.
    const length = 1 + randInt(level.maxTicks);
    cases.push({ name, kind: "dense", inputs: randomBits(length, 0.25) });
  } else if (roll < 0.92) {
    // No input at all: should die on the first hazard or never reach the goal.
    const length = 1 + randInt(level.maxTicks);
    cases.push({ name, kind: "idle", inputs: new Uint8Array(length) });
  } else {
    // Explicitly illegal bytes to exercise InvalidInput.
    const length = 1 + randInt(60);
    const inputs = randomBits(length, 0.5);
    inputs[randInt(length)] = 2 + randInt(254);
    cases.push({ name, kind: "invalid", inputs });
  }
}

const vectors = cases.map((c) => {
  const result = simulate(level, c.inputs);
  return {
    name: c.name,
    kind: c.kind,
    inputs: toHex(c.inputs),
    status: result.status,
    time: result.status === "goal" ? result.time : 0,
    tick: result.status === "died" ? result.tick : 0,
  };
});

function expect(cond: boolean, msg: string): void {
  if (!cond) {
    console.error("FUZZ VECTOR ASSERTION FAILED:", msg);
    process.exit(1);
  }
}

const counts: Record<string, number> = {};
for (const v of vectors) counts[v.status] = (counts[v.status] ?? 0) + 1;

expect(vectors.length === COUNT, `expected exactly ${COUNT} vectors, got ${vectors.length}`);
for (const need of [
  "goal",
  "died",
  "goalNotReached",
  "invalidInput",
  "emptyInputs",
  "inputTooLong",
]) {
  expect((counts[need] ?? 0) > 0, `corpus must include at least one "${need}" case`);
}
for (const v of vectors) {
  if (v.status === "goal") expect(v.time >= 1 && v.time <= level.maxTicks, `${v.name} time in range`);
}

console.log("status distribution:", counts);

const out = {
  level: "level.json",
  seed: SEED,
  note: "Differential fuzz corpus generated by shared/sim.ts. Replayed by test/SpeedrunGhosts.t.sol::test_fuzzVectorsMatchContract.",
  vectors,
};

writeFileSync(resolve(root, "level/fuzz-vectors.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`\nWrote ${out.vectors.length} fuzz vectors to level/fuzz-vectors.json`);
