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

## Threat model

| Attack | What stops it | Test that proves it |
| --- | --- | --- |
| Edit the client to fake a finish/score | Only raw input bytes are uploaded; the chain re-simulates them itself and derives the time. Local numbers are never trusted. | `test_timeIsDerivedOnlyFromInputs`, `test_fuzzVectorsMatchContract` (300 vectors) |
| Send a "fake time" in the transaction | `submitRun` has **no time parameter** — it accepts only `bytes inputs`. | `test/source.test.ts` ("submitRun taking only input bytes") |
| Oversized input | `inputs.length > MAX_TICKS` reverts `InputTooLong` before any simulation; the loop is capped at 600 ticks. | `test_inputsLongerThanMaxTicksRevert`, `test_finishAtMaxTicksPlusOneReverts` |
| Invalid input bytes (2..255) | Every byte must be 0 or 1; otherwise `InvalidInput`. | `test_invalidInputByteReverts` |
| Replay someone else's inputs | **Possible by design** (see note below) — inputs are public in `bestInputs`/`RunVerified`, but a replay only credits the same time to *your own* address; it cannot steal or impersonate. | `test_bestInputsReproduceBestTime`, `test_twoPlayersIdenticalInputs` |
| Submit a run that dies | The chain replays it, hits the hazard, and reverts `RunDied`; nothing is recorded. | `test_runThatHitsHazardRevertsAndRecordsNothing`, `test_diesOnFirstTick` |
| Never reach the goal | Reverts `GoalNotReached`; nothing is recorded. | `test_runThatNeverReachesGoalRevertsAndRecordsNothing`, `test_solidWallBlocksAndJumpClears` |
| Grief with a huge `getLeaderboard` limit | `offset + limit` overflow is impossible and the page is capped (`MAX_PAGE`), so reads cannot run out of gas. | `test_leaderboardEdgeCases` |
| Craft bytes to panic the verifier (overflow/OOB) | Fuzzed for arbitrary and bit inputs: it either records a time in `[1, MAX_TICKS]` or reverts with one of the five documented errors — never a panic. | `testFuzz_submitRunArbitraryBytesNeverPanics`, `testFuzz_submitRunBitInputsNeverPanics` |

> **Honest note:** replaying another player's inputs is **possible and allowed**.
> `bestInputs` and the `RunVerified` event make every verified run public on
> chain. Replaying those exact bytes from your own address just reproduces the
> same time for *you* — it does not take over the original player's record or
> pretend to be them. This is inherent to a transparent speedrun leaderboard;
> the run (inputs) is public, the credit (time) is per-address.

---

## Cost and safety

Measured with `forge test --match-test test_gasFor -vv`:

| Path | Gas |
| --- | --- |
| Typical 200-tick run (records a new best) | **754,504** |
| Non-improving run (no storage write) | **588,031** |
| Max-length run, 600 ticks | **1,936,319** |

`bestInputs` is written **only** when a run improves the caller's best, so slower
runs never pay for storage (`test_nonImprovingRunDoesNotWriteBestInputs`).

Slither (`slither-analyzer` 0.11.6, 102 detectors) reports **one informational
finding**: `submitRun` has cyclomatic complexity 16. It is inherent to a
deterministic replay loop that scans the level's hazards/solids each tick; the
loop count is bounded by `MAX_TICKS` and the level arrays are fixed at deploy
time. No reentrancy, unchecked-arithmetic, or unbounded-loop findings.

Manual pass: no external calls and no ETH transfers (no reentrancy surface); all
arithmetic is checked (Solidity 0.8.24) and the one potential overflow
(`getLeaderboard`) is fixed; every loop is bounded (`MAX_TICKS` for inputs,
`MAX_PAGE` for the leaderboard, deploy-time arrays for hazards/solids). There is
no owner, no admin, no `selfdestruct`, no upgrade path, and no function that
accepts a time value (`test/source.test.ts`).

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
git submodule update --init --recursive   # forge-std pinned at v1.17.0
forge test -vv                            # 32 tests (unit, edge, fuzz, invariants)
forge script script/Deploy.s.sol -vv
```

`lib/forge-std` is a git submodule pinned to `v1.17.0` (see `.gitmodules`).
`remappings.txt` maps `forge-std/=lib/forge-std/src/`.

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
npm run fuzz:vectors    # regenerate the 300-vector differential corpus
npm run test:ts         # root vitest replays golden + fuzz vectors (24 tests)
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
