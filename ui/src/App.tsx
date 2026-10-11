import { useCallback, useRef, useState } from "react";
import type { Address } from "viem";
import { hexToBytes } from "../../shared/sim";
import { speedrunGhostsAbi } from "./abi";
import { publicClient } from "./client";
import { CONTRACT_ADDRESS, basescanAddress } from "./env";
import { LEVEL } from "./lib/level";
import { shortcutAddress } from "./lib/runner";
import { useGame } from "./lib/useGame";
import { Game } from "./components/Game";
import { Leaderboard } from "./components/Leaderboard";
import { WalletBar } from "./components/WalletBar";

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const game = useGame(LEVEL, canvasRef);
  const [refreshKey, setRefreshKey] = useState(0);
  const [racing, setRacing] = useState<string | null>(null);
  const [raceError, setRaceError] = useState<string | null>(null);
  const [raceBusy, setRaceBusy] = useState(false);

  const onVerified = useCallback(() => setRefreshKey((k) => k + 1), []);

  const racePlayer = useCallback(
    async (player: Address) => {
      if (!CONTRACT_ADDRESS) return;
      setRaceBusy(true);
      setRaceError(null);
      try {
        const data = await publicClient.readContract({
          abi: speedrunGhostsAbi,
          address: CONTRACT_ADDRESS,
          functionName: "bestInputs",
          args: [player],
        });
        const bytes = hexToBytes(data as string);
        if (bytes.length === 0) {
          setRaceError("That player has no stored ghost inputs.");
          return;
        }
        game.raceGhost(bytes, shortcutAddress(player));
        setRacing(player);
      } catch (err) {
        setRaceError(err instanceof Error ? err.message : String(err));
      } finally {
        setRaceBusy(false);
      }
    },
    [game],
  );

  return (
    <div className="app">
      <header>
        <div>
          <h1>SpeedrunGhosts</h1>
          <p className="muted">
            Deterministic on-chain speedrun on Base Sepolia. The chain replays your input bytes
            through the same integer physics.
          </p>
        </div>
        <WalletBar />
      </header>

      {CONTRACT_ADDRESS ? (
        <p className="muted contract">
          Contract:{" "}
          <a href={basescanAddress(CONTRACT_ADDRESS)} target="_blank" rel="noreferrer">
            {CONTRACT_ADDRESS}
          </a>
        </p>
      ) : (
        <p className="status warn">
          No contract address configured. Copy ui/.env.example to ui/.env and set
          VITE_CONTRACT_ADDRESS.
        </p>
      )}

      {raceError && <p className="error">{raceError}</p>}

      <main>
        <Game canvasRef={canvasRef} game={game} onVerified={onVerified} />
        <Leaderboard
          refreshKey={refreshKey}
          onRace={racePlayer}
          racing={racing}
          busy={raceBusy}
        />
      </main>

      <footer className="muted">
        Preview times are local only. The contract recomputes every run from your input bytes, so
        only chain-verified times reach the leaderboard.
      </footer>
    </div>
  );
}
