import { describe, expect, it } from "vitest";
import { buildInputs, simulate } from "../../../shared/sim";
import { LEVEL } from "./level";
import { SpeedrunRunner, TICK_MS, formatSeconds } from "./runner";

function playScripted(jumps: number[], maxTick = 600): SpeedrunRunner {
  const set = new Set(jumps);
  const runner = new SpeedrunRunner(LEVEL);
  runner.start();
  let t = 1;
  while (runner.status === "playing" && t <= maxTick) {
    if (set.has(t)) runner.requestJump();
    runner.advance(TICK_MS);
    t++;
  }
  return runner;
}

describe("fixed-tick runner", () => {
  it("advances only in whole fixed ticks", () => {
    const runner = new SpeedrunRunner(LEVEL);
    runner.start();
    for (let i = 0; i < 10; i++) runner.advance(TICK_MS);
    expect(runner.player.tick).toBe(10);
    expect(runner.player.x).toBe(10 * LEVEL.speed);
  });

  it("never feeds the wall-clock delta into the physics", () => {
    const a = new SpeedrunRunner(LEVEL);
    const b = new SpeedrunRunner(LEVEL);
    a.start();
    b.start();
    a.advance(TICK_MS * 5);
    for (let i = 0; i < 5; i++) b.advance(TICK_MS);
    expect(a.player.tick).toBe(5);
    expect(b.player.tick).toBe(5);
    expect(a.player.x).toBe(b.player.x);
    expect(a.player.y).toBe(b.player.y);
    expect(a.player.vy).toBe(b.player.vy);
  });

  it("clamps huge frame drops instead of catching up unbounded", () => {
    const runner = new SpeedrunRunner(LEVEL);
    runner.start();
    runner.advance(10_000);
    expect(runner.player.tick).toBeLessThanOrEqual(Math.ceil(250 / TICK_MS) + 1);
  });

  it("records one byte per tick and produces chain-verifiable inputs", () => {
    const runner = playScripted([28, 78, 128, 160]);
    expect(runner.status).toBe("goal");
    expect(runner.finishTick).toBe(200);

    const recorded = runner.recordedInputs();
    expect(recorded.length).toBe(200);
    for (const byte of recorded) expect(byte === 0 || byte === 1).toBe(true);
    expect(simulate(LEVEL, recorded)).toEqual({ status: "goal", time: 200 });
  });

  it("replays a ghost through the same simulation", () => {
    const ghost = buildInputs(200, [28, 78, 128, 160]);
    const runner = new SpeedrunRunner(LEVEL);
    runner.loadGhost(ghost, "ghost-1");
    expect(runner.status).toBe("idle");
    expect(runner.ghostInputs?.length).toBe(200);

    runner.start();
    for (let t = 1; runner.status === "playing" && t <= 600; t++) {
      if (t === 28 || t === 78 || t === 128 || t === 160) runner.requestJump();
      runner.advance(TICK_MS);
    }

    expect(runner.status).toBe("goal");
    expect(runner.finishTick).toBe(200);
    expect(runner.ghostFinish).toBe(200);
  });

  it("detects death in the shared step()", () => {
    const runner = playScripted([78, 128, 160]);
    expect(runner.status).toBe("died");
    expect(runner.deathTick).toBe(34);
  });

  it("formats ticks as seconds for the preview", () => {
    expect(formatSeconds(200)).toBe("3.33");
  });
});
