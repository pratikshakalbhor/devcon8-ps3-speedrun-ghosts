import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Level } from "../../../shared/sim";
import { render } from "./render";
import { SpeedrunRunner, type RunStatus } from "./runner";

export interface GameSnapshot {
  status: RunStatus;
  tick: number;
  finishTick: number;
  deathTick: number;
  ghostTick: number;
  ghostFinish: number | null;
  ghostLabel: string | null;
  hasGhost: boolean;
}

function snapshot(runner: SpeedrunRunner): GameSnapshot {
  return {
    status: runner.status,
    tick: runner.player.tick,
    finishTick: runner.finishTick,
    deathTick: runner.deathTick,
    ghostTick: runner.ghostTick,
    ghostFinish: runner.ghostFinish,
    ghostLabel: runner.ghostLabel,
    hasGhost: runner.ghostInputs !== null,
  };
}

export interface UseGame {
  runner: SpeedrunRunner;
  snap: GameSnapshot;
  start: () => void;
  reset: () => void;
  jump: () => void;
  raceGhost: (inputs: Uint8Array, label?: string) => void;
  clearGhost: () => void;
}

export function useGame(
  level: Level,
  canvasRef: { current: HTMLCanvasElement | null },
): UseGame {
  const runner = useMemo(() => new SpeedrunRunner(level), [level]);
  const [snap, setSnap] = useState<GameSnapshot>(() => snapshot(runner));

  const rafRef = useRef(0);
  const lastRef = useRef<number | null>(null);

  useEffect(() => {
    const loop = (ts: number) => {
      if (lastRef.current == null) lastRef.current = ts;
      const dt = ts - lastRef.current;
      lastRef.current = ts;

      const ran = runner.advance(dt);

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) render(ctx, runner);
      }
      if (ran > 0) setSnap(snapshot(runner));

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [runner, canvasRef]);

  const start = useCallback(() => {
    lastRef.current = null;
    runner.start();
    setSnap(snapshot(runner));
  }, [runner]);

  const reset = useCallback(() => {
    lastRef.current = null;
    runner.reset();
    setSnap(snapshot(runner));
  }, [runner]);

  const jump = useCallback(() => {
    runner.requestJump();
  }, [runner]);

  const raceGhost = useCallback(
    (inputs: Uint8Array, label?: string) => {
      lastRef.current = null;
      runner.loadGhost(inputs, label);
      setSnap(snapshot(runner));
    },
    [runner],
  );

  const clearGhost = useCallback(() => {
    runner.clearGhost();
    setSnap(snapshot(runner));
  }, [runner]);

  return { runner, snap, start, reset, jump, raceGhost, clearGhost };
}
