# Speedrun Ghosts: A Leaderboard That Checks Your Run

A one-screen deterministic platformer where the chain is the referee. The browser records your button presses, the contract replays them through the level itself and decides your time. The leaderboard shows only chain-verified times, and ghosts are replayed from verified runs, so an edited client can put nothing on the board.

Built for Road to Devcon VIII, problem "Speedrun Ghosts".

## Deployment

| Item | Value |
|---|---|
| Network | Base Sepolia (chain ID 84532) |
| Contract | [`0xb805983974b9407bf8517D1ad11548A820Fa09A7`](https://sepolia.basescan.org/address/0xb805983974b9407bf8517D1ad11548A820Fa09A7) |
| Deploy tx | [`0xb1583beef6062d7e8f1d1302f2ad0d9dfd016bd422c5f5d42defb17182565cd4`](https://sepolia.basescan.org/tx/0xb1583beef6062d7e8f1d1302f2ad0d9dfd016bd422c5f5d42defb17182565cd4) |
| Deployment block | `47984918` |
| Max input length | `600` ticks (constant `MAX_TICKS`) |

A machine-readable copy lives in [`deployments/base-sepolia.json`](deployments/base-sepolia.json).

## How a run is verified

1. The client records one input per tick (`1 byte per tick: 0 = no input, 1 = jump`; any other byte is rejected).
2. `submitRun(bytes inputs)` reverts if `inputs.length > MAX_TICKS`.
3. The contract steps the inputs through the game logic with integer physics. Each step tests the player against level data: solids block movement, hazards end the run.
4. If the simulation does not reach the goal, the call reverts and nothing is recorded.
5. The time is the tick at which the goal is reached. It is never a caller-supplied argument.
6. A player's best is overwritten only if the new time is strictly lower.
7. Verified inputs are stored in contract storage (`_bestInputs`) and emitted in the `RunVerified` event, so any client can replay them as a ghost.

## Determinism

- **Integer-only physics.** Positions and velocities use integer constants; the step uses `|0` coercion and contains no divisions and no floats. No browser clock delta ever enters the step. The step runs once per fixed tick.
- **Same rules in two runtimes.** Solidity step: `src/SpeedrunGhosts.sol` (the `submitRun` replay loop). JS step: `shared/sim.ts` (`step()`).
- **Single level source.** Option B: the deploy script (`script/Deploy.s.sol` via `script/LevelData.sol`) and the client (`ui/src/lib/level.ts`) both import the same `level/level.json`. The deployed values are also readable on-chain via `getLevel()`.

## Contract (`src/SpeedrunGhosts.sol`)

| Item | Detail |
|---|---|
| Submit | `submitRun(bytes inputs)` |
| Personal best | `mapping(address => uint32) _bestTime` (+ `mapping(address => bytes) _bestInputs`) |
| Reads | `bestTime(player)`, `getLeaderboard(offset, limit)`, `bestInputs(player)`, `playersCount()`, `getLevel()` |
| Events | `RunVerified(address indexed player, uint32 time, bytes inputs)` |
| Admin | none: no owner, no way to set or edit a time |

## Game

- Controls: `Space` / tap = jump. `R` = reset.
- Practice works without a wallet or ETH.
- Submitting a run to the leaderboard needs a wallet with Base Sepolia test ETH for gas. Sponsored gas is not implemented.
- Click a leaderboard entry to load its verified run as a ghost, then race it.

## Frontend (`ui/`)

| Concern | Implementation |
|---|---|
| Chain | `baseSepolia` (84532), `ui/src/wagmi.ts` |
| Physics step | `shared/sim.ts` (driven by `ui/src/lib/runner.ts`) |
| Level source | `ui/src/lib/level.ts` → `level/level.json` |
| Leaderboard + ghost | read from the contract, `ui/src/components/Leaderboard.tsx` |

## Acceptance checklist

| # | Check | Where |
|---|---|---|
| 1 | Frontend targets Base Sepolia | `ui/src/wagmi.ts` |
| 2 | No credentials in tracked files | `.env` is git-ignored; only `.env.example` placeholders |
| 3 | Time computed by contract simulation | `src/SpeedrunGhosts.sol`, `test_timeIsDerivedOnlyFromInputs` |
| 4 | Input length bounded | `MAX_TICKS`, `test_inputsLongerThanMaxTicksRevert` |
| 5 | Simulation reads level obstacles | `src/SpeedrunGhosts.sol` (solids/hazards loops) |
| 6 | Unfinished run not recorded | `test_runThatNeverReachesGoalRevertsAndRecordsNothing`, `test_runThatHitsHazardRevertsAndRecordsNothing` |
| 7 | Integer-only client physics | `shared/sim.ts` |
| 8 | Single level source | `level/level.json` (`script/Deploy.s.sol`, `ui/src/lib/level.ts`) |
| 9 | Inputs retrievable from chain | `bestInputs(player)` / `RunVerified` event |
| 10 | Best replaced only by faster run | `test_fasterRunReplacesBest_slowerAndEqualDoNot` |

## Run it locally

Requires [Foundry](https://book.getfoundry.sh/) and Node 20.12+.

```bash
forge build
forge test -vv

cd ui
cp .env.example .env.local   # contract address, RPC
npm install
npm run dev
```

## Deploy your own

```bash
cp .env.example .env         # PRIVATE_KEY, BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
set -a; source <(tr -d '\r' < .env); set +a
forge script script/Deploy.s.sol:Deploy \
  --rpc-url $BASE_SEPOLIA_RPC_URL --private-key $PRIVATE_KEY --broadcast
```

`.env` is git-ignored. Never commit a private key, mnemonic, API key or key-bearing RPC URL.

## Tests

`forge test -vv`: `32` tests passing. They cover: valid run time, over-long input, run that never reaches the goal, hazard death, slower run not replacing the best, inputs retrievable.

## Security notes

- The contract has no owner and no admin function. Time comes only from the contract's own simulation.
- No credentials are committed.
