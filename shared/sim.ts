export interface Range {
  x0: number;
  x1: number;
  h: number;
}

export interface Level {
  speed: number;
  gravity: number;
  jumpVy: number;
  goalX: number;
  maxTicks: number;
  hazards: Range[];
  solids: Range[];
}

export type SimResult =
  | { status: "goal"; time: number }
  | { status: "died"; tick: number }
  | { status: "goalNotReached" }
  | { status: "inputTooLong" }
  | { status: "emptyInputs" };

/** Mutable simulation state. All fields are integers. */
export interface SimState {
  x: number;
  y: number;
  vy: number;
  tick: number;
}

export type StepStatus = "running" | "goal" | "died";

export function createState(): SimState {
  return { x: 0, y: 0, vy: 0, tick: 0 };
}

function blocked(solids: Range[], nx: number, y: number): boolean {
  for (let i = 0; i < solids.length; i++) {
    const s = solids[i];
    if (nx >= s.x0 && nx <= s.x1 && y < s.h) return true;
  }
  return false;
}

/**
 * Advance exactly one fixed tick. Integer math only; no wall-clock values ever
 * enter here. Mutates `s` and returns the outcome of this tick.
 */
export function step(level: Level, s: SimState, input: number): StepStatus {
  input = input | 0;
  s.tick = (s.tick + 1) | 0;

  if (input === 1 && s.y === 0) s.vy = level.jumpVy;

  const nx = s.x + level.speed;
  if (!blocked(level.solids, nx, s.y)) s.x = nx;

  s.vy = s.vy - level.gravity;
  s.y = s.y + s.vy;
  if (s.y < 0) {
    s.y = 0;
    s.vy = 0;
  }

  for (let i = 0; i < level.solids.length; i++) {
    const so = level.solids[i];
    if (s.x >= so.x0 && s.x <= so.x1 && s.y < so.h) {
      s.y = so.h;
      s.vy = 0;
    }
  }

  for (let h = 0; h < level.hazards.length; h++) {
    const hz = level.hazards[h];
    if (s.x >= hz.x0 && s.x <= hz.x1 && s.y < hz.h) {
      return "died";
    }
  }

  if (s.x >= level.goalX) return "goal";
  return "running";
}

/** Replay a whole input sequence. Mirrors the on-chain `submitRun` exactly. */
export function simulate(level: Level, inputs: ArrayLike<number>): SimResult {
  const n = inputs.length | 0;
  if (n === 0) return { status: "emptyInputs" };
  if (n > level.maxTicks) return { status: "inputTooLong" };

  const s = createState();
  for (let i = 0; i < n; i++) {
    const outcome = step(level, s, inputs[i] | 0);
    if (outcome === "died") return { status: "died", tick: s.tick };
    if (outcome === "goal") return { status: "goal", time: s.tick };
  }
  return { status: "goalNotReached" };
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  let s = "0x";
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, "0");
  return s;
}

export function buildInputs(length: number, jumpTicks: number[]): Uint8Array {
  const inputs = new Uint8Array(length);
  for (const tick of jumpTicks) {
    if (tick >= 1 && tick <= length) inputs[tick - 1] = 1;
  }
  return inputs;
}
