# SpeedrunGhosts

A tiny, deterministic, **on-chain speedrun** game on **Base Sepolia**. You record a
run on a canvas, submit the raw per-tick input bytes in a transaction, and the
smart contract **replays those bytes itself** through the same integer physics to
compute your time. No server, no owner, no trusted timer.

The frontend (React + Vite + wagmi/viem + HTML canvas) and the Foundry test suite
share **one physics implementation**, so what you see locally is exactly what the
chain computes.

---

## The game

One level, side-view runner. The player auto-moves right at `speed = 3` units per
tick. The only input is **jump**, encoded as one byte per tick
(`0 = none`, `1 = jump`). A jump is only allowed while standing on the ground
(`y == 0`); gravity and jump velocity are integers. Spikes kill; a solid wall
blocks horizontal movement until you clear it. Reaching `x >= goalX` finishes the
run; the finish tick is the time.

Level (`level/level.json`): `speed 3`, `gravity 1`, `jumpVy 9`, `goalX 600`,
3 spike ranges, 1 solid wall. A clean run is **200 ticks** and forces **4 jumps**.
Times are shown as `ticks (seconds)` where `seconds = ticks / 60`.

### Controls

| Input | Action |
| --- | --- |
| `Space` / tap / click on the canvas | Start the run, then jump |
| `R` | Reset the run |

---

## How verification works (the chain is the referee)

1. The UI runs a fixed-tick loop. Real time is only used by an **accumulator**;
   when it crosses a tick boundary, the game advances exactly one whole tick.
   The wall-clock delta is **never** fed into the physics.
2. Each tick appends one input byte to a `Uint8Array`.
3. "Submit to chain" sends those bytes to `submitRun(bytes inputs)`.
4. The contract steps the same integer physics, byte by byte, from the stored
   level, and derives the tick count itself. It reverts with `RunDied`,
   `GoalNotReached`, `InputTooLong`, or `EmptyInputs` on an invalid run.
5. On success the dapp reads back `bestTime(address)` and shows
   **"Chain-verified time: N ticks (x.xx s)"**.
6. `submitRun` is bounded by `MAX_TICKS = 600`, so verification cost is capped.

There is **no time argument, no signature, and no owner/admin path**. Nothing can
set a time except the simulation replaying the submitted bytes.

### Why an edited client gets nothing onto the board

The local "preview" time is untrusted and never uploaded as a number. The dapp
only uploads **input bytes**. The contract ignores anything the client claims and
re-simulates those bytes against its own stored level. Editing the client to draw
a fake finish, to skip rendering, or to report a fabricated time changes nothing
— the chain will replay the raw bytes and either finish at the real tick, die on
a spike, never reach the goal, or run too long, and then reject the run. Also,
`bestInputs` / `RunVerified` make every verified run auditable from chain data.

---

## One level, one source of truth

`level/level.json` is the single source for all constants and obstacles:

```json
{
  "speed": 3, "gravity": 1, "jumpVy": 9, "goalX": 600, "maxTicks": 600,
  "hazards": [{ "x0": 100, "x1": 113, "h": 12 }, ...],
  "solids":  [{ "x0": 500, "x1": 509, "h": 12 }]
}
```

- The **deploy script** (`script/Deploy.s.sol` via `script/LevelData.sol`) reads
  this file and passes it to the constructor.
- The **Foundry tests** read the same file (and `level/vectors.json`).
- The **UI** imports the same JSON (`ui/src/lib/level.ts`) and the same
  simulation (`shared/sim.ts`).
- The contract exposes `getLevel()` so any client can read the level back.

No obstacle data is duplicated in Solidity or JavaScript.

Shared physics: `shared/sim.ts` exports integer-only `step(level, state, input)`
(used by the live UI) and `simulate(level, inputs)` (used by the tests). The
contract mirrors it exactly. `level/vectors.json` holds golden vectors that both
the Foundry test and the frontend vitest replay.

---

## Repository layout

```
src/SpeedrunGhosts.sol        on-chain verifier (submitRun, bestTime, getLeaderboard, getLevel)
script/Deploy.s.sol           deploy using level/level.json
script/LevelData.sol          shared JSON -> constructor-args loader
test/SpeedrunGhosts.t.sol     Foundry tests
shared/sim.ts                 shared integer physics (step + simulate)
level/level.json              the level (single source)
level/vectors.json            golden vectors (contract + UI agreement)
ui/                           React + Vite + wagmi/viem + canvas dapp
ui/src/lib/runner.ts          fixed-tick loop (accumulator; no dt in physics)
ui/src/components/            Game, Leaderboard, SubmitPanel, WalletBar
```

---

## Run and test

### Contract

```bash
forge test -vv          # 13 tests
forge script script/Deploy.s.sol -vv
```

### Frontend

```bash
cd ui
npm install
cp .env.example .env    # then set VITE_CONTRACT_ADDRESS
npm run dev             # http://localhost:5173
npm test                # 7 tests
npm run build           # tsc --noEmit && vite build
```

### Shared vectors

```bash
npm run vectors         # regenerate level/vectors.json from shared/sim.ts
npm run test:ts         # root vitest replays the vectors
```

---

## Contract address (Base Sepolia)

| | |
| --- | --- |
| Network | Base Sepolia (`chainId 84532`) |
| Public RPC | `https://sepolia.base.org` |
| Address | `VITE_CONTRACT_ADDRESS` (see note) |
| Basescan | `https://sepolia.basescan.org/address/<address>` |

> A live address is not bundled in this repository because no funded Base
> Sepolia key is available in the build environment. Deploy it and paste the
> result:

```bash
cp .env.example .env    # add PRIVATE_KEY=0x... (funded on Base Sepolia)
forge script script/Deploy.s.sol \
  --rpc-url https://sepolia.base.org \
  --broadcast
# then set VITE_CONTRACT_ADDRESS in ui/.env to the printed address
```

Example Basescan link after deploying:
`https://sepolia.basescan.org/address/0xYourDeployedAddress`.

---

## Wallet

- Injected wallets (MetaMask, Rabby, ...) and **Coinbase Wallet** connectors.
- If the connected chain is not Base Sepolia, the dapp shows a
  **Switch to Base Sepolia** button.
- Smart-wallet / passkey sign-in (Base Account SDK) is **not enabled** in this
  build; the connector list is intentionally minimal.

---

## Security

`.env`, `.env.local`, `dist/`, `node_modules/`, `out/`, `cache/`, and
`broadcast/` are git-ignored. `.env.example` files contain placeholders only.
Never commit a private key, mnemonic, or key-bearing RPC URL.
