import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  step,
  createState,
  simulate,
  hexToBytes,
  buildInputs,
  type Level,
  type Range,
  type SimResult,
} from "../shared/sim.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const level = JSON.parse(readFileSync(resolve(root, "level/level.json"), "utf8")) as Level;
const golden = JSON.parse(readFileSync(resolve(root, "level/vectors.json"), "utf8")) as {
  vectors: { name: string; inputs: string; status: string; time: number; tick: number }[];
};
const fuzz = JSON.parse(readFileSync(resolve(root, "level/fuzz-vectors.json"), "utf8")) as {
  vectors: { name: string; inputs: string; status: string; time: number; tick: number }[];
};

describe("shared simulation golden vectors", () => {
  it("replays every golden vector with the same outcome as the contract", () => {
    for (const v of golden.vectors) {
      const result: SimResult = simulate(level, hexToBytes(v.inputs));
      expect(result.status, v.name).toBe(v.status);
      if (result.status === "goal") {
        expect(result.time, v.name).toBe(v.time);
      }
      if (result.status === "died") {
        expect(result.tick, v.name).toBe(v.tick);
      }
    }
  });

  it("has an optimal clean time of 200 ticks", () => {
    const result = simulate(level, buildInputs(200, [28, 78, 128, 160]));
    expect(result).toEqual({ status: "goal", time: 200 });
  });

  it("cannot finish faster than goalX / speed ticks", () => {
    const minPossible = Math.ceil(level.goalX / level.speed);
    expect(minPossible).toBe(200);
    const fastest = simulate(level, buildInputs(200, [28, 78, 128, 160]));
    expect(fastest.status === "goal" && fastest.time >= minPossible).toBe(true);
  });

  it("bounds verification cost with maxTicks", () => {
    const tooLong = simulate(level, buildInputs(level.maxTicks + 1, []));
    expect(tooLong).toEqual({ status: "inputTooLong" });
    const empty = simulate(level, new Uint8Array(0));
    expect(empty).toEqual({ status: "emptyInputs" });
  });

  it("forces at least three jumps via hazards and a solid wall", () => {
    expect(level.hazards.length).toBeGreaterThanOrEqual(3);
    expect(level.solids.length).toBeGreaterThanOrEqual(1);
  });

  it("replays the entire differential fuzz corpus", () => {
    expect(fuzz.vectors.length).toBe(300);
    for (const v of fuzz.vectors) {
      const result: SimResult = simulate(level, hexToBytes(v.inputs));
      expect(result.status, v.name).toBe(v.status);
      if (result.status === "goal") expect(result.time, v.name).toBe(v.time);
      if (result.status === "died") expect(result.tick, v.name).toBe(v.tick);
    }
  });

  it("rejects input bytes other than 0 and 1", () => {
    const low = buildInputs(200, [28, 78, 128, 160]);
    low[10] = 2;
    expect(simulate(level, low)).toEqual({ status: "invalidInput" });

    const high = buildInputs(200, [28, 78, 128, 160]);
    high[10] = 255;
    expect(simulate(level, high)).toEqual({ status: "invalidInput" });
  });

  it("step() reports invalid for byte > 1 without advancing the tick", () => {
    const s = createState();
    expect(step(level, s, 2)).toBe("invalid");
    expect(s.tick).toBe(0);
    expect(step(level, createState(), 255)).toBe("invalid");
  });

  it("ignores a jump pressed while airborne, identically to the contract", () => {
    const withAir = simulate(level, buildInputs(200, [28, 29, 78, 128, 160]));
    const without = simulate(level, buildInputs(200, [28, 78, 128, 160]));
    expect(withAir).toEqual({ status: "goal", time: 200 });
    expect(withAir).toEqual(without);

    const s = createState();
    step(level, s, 1);
    const vyAfterGroundJump = s.vy;
    step(level, s, 1);
    expect(s.vy).toBe(vyAfterGroundJump - level.gravity);
  });
});

describe("edge semantics (shared with the contract)", () => {
  const mk = (goalX: number, hazards: Range[], solids: Range[]): Level => ({
    speed: 3,
    gravity: 1,
    jumpVy: 9,
    goalX,
    maxTicks: 600,
    hazards,
    solids,
  });
  const zeros = (n: number) => new Uint8Array(n);

  it("dies on the very first tick when a hazard covers the start", () => {
    const lvl = mk(600, [{ x0: 0, x1: 6, h: 1 }], []);
    expect(simulate(lvl, zeros(1))).toEqual({ status: "died", tick: 1 });
  });

  it("honours a jump pressed on the very first tick", () => {
    const lvl = mk(9, [{ x0: 0, x1: 6, h: 5 }], []);
    expect(simulate(lvl, zeros(3))).toEqual({ status: "died", tick: 1 });
    expect(simulate(lvl, buildInputs(3, [1]))).toEqual({ status: "goal", time: 3 });
  });

  it("treats spike x0 and x1 as inclusive", () => {
    expect(simulate(mk(9, [{ x0: 3, x1: 3, h: 1 }], []), zeros(3))).toEqual({
      status: "died",
      tick: 1,
    });
    expect(simulate(mk(9, [{ x0: 4, x1: 6, h: 1 }], []), zeros(3))).toEqual({
      status: "died",
      tick: 2,
    });
    expect(simulate(mk(9, [{ x0: 4, x1: 5, h: 1 }], []), zeros(3))).toEqual({
      status: "goal",
      time: 3,
    });
  });

  it("stops at a solid wall unless jumped over", () => {
    const lvl = mk(15, [], [{ x0: 9, x1: 9, h: 12 }]);
    expect(simulate(lvl, zeros(20))).toEqual({ status: "goalNotReached" });
    expect(simulate(lvl, buildInputs(10, [1]))).toEqual({ status: "goal", time: 5 });
  });
});
