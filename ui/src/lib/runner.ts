import { createState, step, type Level, type SimState } from "../../../shared/sim";

/** Fixed simulation rate. Physics only ever advances in whole ticks. */
export const TICK_HZ = 60;
export const TICK_MS = 1000 / TICK_HZ;

/** Largest real-time delta the accumulator will accept, to avoid a catch-up spiral. */
export const MAX_DT_MS = 250;

/** Scheduling tolerance so float drift in the accumulator cannot drop a whole tick. */
const ACCUMULATOR_EPSILON_MS = 1e-6;

export type RunStatus = "idle" | "playing" | "goal" | "died" | "timeout";

export function ticksToSeconds(ticks: number): number {
  return ticks / TICK_HZ;
}

export function formatSeconds(ticks: number): string {
  return ticksToSeconds(ticks).toFixed(2);
}

/**
 * Framework-agnostic fixed-tick runner.
 *
 * `advance(dtMs)` accumulates real elapsed time and runs WHOLE fixed ticks.
 * The delta is never passed into the physics: `step()` receives only an input
 * byte and integer state. This is the same `step()` the chain-parity tests use.
 */
export class SpeedrunRunner {
  readonly level: Level;
  readonly inputs: Uint8Array;

  player: SimState;
  status: RunStatus;
  finishTick: number;
  deathTick: number;

  ghost: SimState | null;
  ghostInputs: Uint8Array | null;
  ghostTick: number;
  ghostFinish: number | null;
  ghostLabel: string | null;

  private acc: number;
  private jumpQueued: boolean;
  private recorded: number;

  constructor(level: Level) {
    this.level = level;
    this.inputs = new Uint8Array(level.maxTicks);
    this.player = createState();
    this.status = "idle";
    this.finishTick = 0;
    this.deathTick = 0;
    this.ghost = null;
    this.ghostInputs = null;
    this.ghostTick = 0;
    this.ghostFinish = null;
    this.ghostLabel = null;
    this.acc = 0;
    this.jumpQueued = false;
    this.recorded = 0;
  }

  /** Input byte recorded for each completed tick (one byte per tick). */
  recordedInputs(): Uint8Array {
    return this.inputs.slice(0, this.recorded);
  }

  requestJump(): void {
    this.jumpQueued = true;
  }

  private resetRun(): void {
    this.player = createState();
    this.inputs.fill(0);
    this.acc = 0;
    this.jumpQueued = false;
    this.recorded = 0;
    this.finishTick = 0;
    this.deathTick = 0;
    if (this.ghostInputs) {
      this.ghost = createState();
      this.ghostTick = 0;
      this.ghostFinish = null;
    }
  }

  start(): void {
    if (this.status === "playing") return;
    this.resetRun();
    this.status = "playing";
  }

  reset(): void {
    this.resetRun();
    this.status = "idle";
  }

  loadGhost(inputs: Uint8Array, label?: string): void {
    this.ghostInputs = inputs.slice();
    this.ghost = createState();
    this.ghostTick = 0;
    this.ghostFinish = null;
    this.ghostLabel = label ?? null;
    this.resetRun();
    this.status = "idle";
  }

  clearGhost(): void {
    this.ghost = null;
    this.ghostInputs = null;
    this.ghostTick = 0;
    this.ghostFinish = null;
    this.ghostLabel = null;
  }

  /** Advance by real elapsed ms; returns how many fixed ticks were simulated. */
  advance(dtMs: number): number {
    if (this.status !== "playing") return 0;
    const dt = dtMs > MAX_DT_MS ? MAX_DT_MS : dtMs;
    if (!(dt > 0)) return 0;
    this.acc += dt;
    let ran = 0;
    while (this.acc >= TICK_MS - ACCUMULATOR_EPSILON_MS && this.status === "playing") {
      this.acc -= TICK_MS;
      this.fixedTick();
      ran++;
    }
    if (this.acc < 0) this.acc = 0;
    return ran;
  }

  private fixedTick(): void {
    const tickIndex = this.player.tick;
    if (tickIndex >= this.level.maxTicks) {
      this.status = "timeout";
      return;
    }

    const input = this.jumpQueued ? 1 : 0;
    this.jumpQueued = false;
    this.inputs[tickIndex] = input;
    this.recorded = tickIndex + 1;

    const outcome = step(this.level, this.player, input);

    if (this.ghost && this.ghostInputs && this.ghostFinish === null) {
      if (this.ghostTick < this.ghostInputs.length) {
        const ghostOutcome = step(this.level, this.ghost, this.ghostInputs[this.ghostTick]);
        this.ghostTick++;
        if (ghostOutcome !== "running") this.ghostFinish = this.ghost.tick;
      }
    }

    if (outcome === "died") {
      this.status = "died";
      this.deathTick = this.player.tick;
      return;
    }
    if (outcome === "goal") {
      this.status = "goal";
      this.finishTick = this.player.tick;
      return;
    }
    if (this.player.tick >= this.level.maxTicks) {
      this.status = "timeout";
    }
  }
}

export function shortcutAddress(address: string, chars = 4): string {
  if (!address || address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}
