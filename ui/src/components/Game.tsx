import { useCallback, useEffect, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import type { UseGame } from "../lib/useGame";
import { formatSeconds } from "../lib/runner";
import { SubmitPanel } from "./SubmitPanel";

interface Props {
  canvasRef: RefObject<HTMLCanvasElement>;
  game: UseGame;
  onVerified: () => void;
}

interface LastResult {
  tick: number;
  inputs: Uint8Array;
}

export function Game({ canvasRef, game, onVerified }: Props) {
  const { snap, start, reset, jump, clearGhost, runner } = game;
  const [lastResult, setLastResult] = useState<LastResult | null>(null);

  useEffect(() => {
    if (snap.status === "goal") {
      setLastResult({ tick: snap.finishTick, inputs: runner.recordedInputs() });
    }
  }, [snap.status, snap.finishTick, runner]);

  const primary = useCallback(() => {
    if (snap.status === "playing") jump();
    else start();
  }, [snap.status, jump, start]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        if (e.repeat) return;
        primary();
      } else if (e.key === "r" || e.key === "R") {
        reset();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [primary, reset]);

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    primary();
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Run</h2>
        <div className="row">
          <button
            onClick={() => {
              reset();
              start();
            }}
          >
            Restart
          </button>
          {snap.hasGhost && <button onClick={clearGhost}>Clear ghost</button>}
        </div>
      </div>

      <canvas
        ref={canvasRef}
        width={760}
        height={260}
        className="game-canvas"
        onPointerDown={onPointerDown}
      />

      <p className="hint">Space / tap = jump. R = reset. One input byte is recorded per tick.</p>

      {snap.hasGhost && (
        <p className="ghost-note">
          Racing ghost{snap.ghostLabel ? ` (${snap.ghostLabel})` : ""} through the same simulation.
        </p>
      )}

      {snap.status === "goal" && lastResult && (
        <div className="preview">
          <div>
            <strong>Preview:</strong> {lastResult.tick} ticks ({formatSeconds(lastResult.tick)} s)
          </div>
          <div className="unverified">unverified until the chain checks it</div>
        </div>
      )}

      {snap.status === "died" && (
        <div className="preview bad">
          You hit a spike at tick {snap.deathTick}. Nothing recorded on-chain.
        </div>
      )}

      {snap.status === "timeout" && (
        <div className="preview bad">
          Timed out at 600 ticks without reaching the flag. Nothing recorded on-chain.
        </div>
      )}

      <SubmitPanel inputs={lastResult?.inputs ?? null} onVerified={onVerified} />
    </section>
  );
}
