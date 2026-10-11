import { useEffect, useMemo } from "react";
import { useReadContract } from "wagmi";
import type { Address } from "viem";
import { speedrunGhostsAbi } from "../abi";
import { CONTRACT_ADDRESS, basescanAddress } from "../env";
import { formatSeconds, shortcutAddress } from "../lib/runner";

interface Props {
  refreshKey: number;
  onRace: (player: Address) => void;
  racing: string | null;
  busy: boolean;
}

interface Row {
  address: Address;
  time: number;
}

export function Leaderboard({ refreshKey, onRace, racing, busy }: Props) {
  const { data: countData, refetch: refetchCount } = useReadContract({
    abi: speedrunGhostsAbi,
    address: CONTRACT_ADDRESS,
    functionName: "playersCount",
    query: { enabled: Boolean(CONTRACT_ADDRESS) },
  });

  const total = countData ? Number(countData) : 0;
  const limit = Math.min(total, 500);

  const { data, refetch } = useReadContract({
    abi: speedrunGhostsAbi,
    address: CONTRACT_ADDRESS,
    functionName: "getLeaderboard",
    args: total > 0 ? [0n, BigInt(limit)] : undefined,
    query: { enabled: Boolean(CONTRACT_ADDRESS) && total > 0 },
  });

  useEffect(() => {
    if (!CONTRACT_ADDRESS) return;
    void refetchCount();
    void refetch();
  }, [refreshKey, refetchCount, refetch]);

  const rows = useMemo<Row[]>(() => {
    if (!data) return [];
    const [addrs, times] = data as readonly [readonly Address[], readonly number[]];
    const out: Row[] = [];
    for (let i = 0; i < addrs.length; i++) {
      out.push({ address: addrs[i], time: Number(times[i]) });
    }
    return out.sort((a, b) => a.time - b.time);
  }, [data]);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Leaderboard</h2>
        <span className="muted">{total} player{total === 1 ? "" : "s"}</span>
      </div>

      {!CONTRACT_ADDRESS && <p className="status warn">Set VITE_CONTRACT_ADDRESS to load scores.</p>}
      {CONTRACT_ADDRESS && rows.length === 0 && (
        <p className="muted">No verified runs yet. Be the first.</p>
      )}

      {rows.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Player</th>
                <th>Time</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.address} className={racing === row.address ? "racing" : undefined}>
                  <td>{i + 1}</td>
                  <td>
                    <a href={basescanAddress(row.address)} target="_blank" rel="noreferrer">
                      {shortcutAddress(row.address)}
                    </a>
                  </td>
                  <td>
                    {row.time} ticks <span className="muted">({formatSeconds(row.time)} s)</span>
                  </td>
                  <td>
                    <button onClick={() => onRace(row.address)} disabled={busy}>
                      {racing === row.address ? "Racing" : "Race this ghost"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
