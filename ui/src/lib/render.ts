import type { Range, SimState } from "../../../shared/sim";
import type { SpeedrunRunner } from "./runner";

const PAD = 18;
const GROUND_MARGIN = 44;
const Y_GAIN = 3;

interface View {
  scale: number;
  groundY: number;
  xToPx(x: number): number;
  yToPx(y: number): number;
}

function makeView(ctx: CanvasRenderingContext2D, goalX: number): View {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const worldW = goalX + 80;
  const scale = (w - PAD * 2) / worldW;
  const groundY = h - GROUND_MARGIN;
  return {
    scale,
    groundY,
    xToPx: (x) => PAD + x * scale,
    yToPx: (y) => groundY - y * scale * Y_GAIN,
  };
}

function drawHazard(
  ctx: CanvasRenderingContext2D,
  view: View,
  hz: Range,
  color: string,
): void {
  const x0 = view.xToPx(hz.x0);
  const x1 = view.xToPx(hz.x1);
  const top = view.yToPx(hz.h);
  const span = x1 - x0;
  const teeth = Math.max(1, Math.round(span / 12));
  const step = span / teeth;
  ctx.beginPath();
  ctx.moveTo(x0, view.groundY);
  for (let i = 0; i < teeth; i++) {
    const bx = x0 + i * step;
    ctx.lineTo(bx + step / 2, top);
    ctx.lineTo(bx + step, view.groundY);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function drawSolid(ctx: CanvasRenderingContext2D, view: View, so: Range): void {
  const x0 = view.xToPx(so.x0);
  const x1 = view.xToPx(so.x1);
  const top = view.yToPx(so.h);
  ctx.fillStyle = "#6b7280";
  ctx.fillRect(x0, top, Math.max(2, x1 - x0), view.groundY - top);
  ctx.fillStyle = "#9ca3af";
  ctx.fillRect(x0, top, Math.max(2, x1 - x0), 3);
}

function drawFlag(ctx: CanvasRenderingContext2D, view: View, goalX: number): void {
  const px = view.xToPx(goalX);
  const top = view.yToPx(52);
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px, view.groundY);
  ctx.lineTo(px, top);
  ctx.stroke();
  ctx.fillStyle = "#22d3ee";
  ctx.beginPath();
  ctx.moveTo(px, top);
  ctx.lineTo(px + 22, top + 7);
  ctx.lineTo(px, top + 14);
  ctx.closePath();
  ctx.fill();
}

function drawActor(
  ctx: CanvasRenderingContext2D,
  view: View,
  state: SimState,
  fill: string,
  alpha: number,
): void {
  const size = Math.max(12, view.scale * 12);
  const cx = view.xToPx(state.x);
  const feet = view.yToPx(state.y);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = fill;
  ctx.fillRect(cx - size / 2, feet - size, size, size);
  ctx.globalAlpha = 1;
}

export function render(ctx: CanvasRenderingContext2D, runner: SpeedrunRunner): void {
  const level = runner.level;
  const view = makeView(ctx, level.goalX);

  const sky = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
  sky.addColorStop(0, "#0b1020");
  sky.addColorStop(1, "#141b34");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  ctx.fillStyle = "#1f2937";
  ctx.fillRect(0, view.groundY, ctx.canvas.width, ctx.canvas.height - view.groundY);
  ctx.strokeStyle = "#374151";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, view.groundY);
  ctx.lineTo(ctx.canvas.width, view.groundY);
  ctx.stroke();

  drawFlag(ctx, view, level.goalX);

  for (const hz of level.hazards) drawHazard(ctx, view, hz, "#ef4444");
  for (const so of level.solids) drawSolid(ctx, view, so);

  if (runner.ghost && runner.ghostFinish === null) {
    drawActor(ctx, view, runner.ghost, "#a78bfa", 0.45);
  }
  if (runner.ghost && runner.ghostFinish !== null) {
    drawActor(ctx, view, runner.ghost, "#a78bfa", 0.25);
  }

  drawActor(ctx, view, runner.player, "#22d3ee", 1);

  ctx.font = "13px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillStyle = "#e5e7eb";
  ctx.textBaseline = "top";
  ctx.fillText(`TICK ${runner.player.tick}`, PAD, 10);

  let statusText = "";
  if (runner.status === "idle") statusText = "READY - SPACE / TAP TO START";
  else if (runner.status === "playing") statusText = "RUNNING";
  else if (runner.status === "goal") statusText = `FINISHED ${runner.finishTick} TICKS`;
  else if (runner.status === "died") statusText = `DIED AT TICK ${runner.deathTick}`;
  else if (runner.status === "timeout") statusText = "TIMEOUT (600 TICKS)";
  ctx.fillStyle =
    runner.status === "died"
      ? "#f87171"
      : runner.status === "goal"
        ? "#4ade80"
        : "#e5e7eb";
  ctx.fillText(statusText, PAD, 28);

  if (runner.ghostInputs) {
    const label = runner.ghostLabel ? `GHOST ${runner.ghostLabel}` : "GHOST";
    const ghostTime =
      runner.ghostFinish !== null
        ? `FINISHED ${runner.ghostFinish}`
        : `TICK ${runner.ghostTick}`;
    ctx.fillStyle = "#c4b5fd";
    ctx.fillText(`${label}: ${ghostTime}`, PAD, 46);
  }
}
