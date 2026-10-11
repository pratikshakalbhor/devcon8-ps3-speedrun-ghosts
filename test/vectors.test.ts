import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { simulate, hexToBytes, buildInputs, type Level, type SimResult } from "../shared/sim.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const level = JSON.parse(readFileSync(resolve(root, "level/level.json"), "utf8")) as Level;
const golden = JSON.parse(readFileSync(resolve(root, "level/vectors.json"), "utf8")) as {
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
});
