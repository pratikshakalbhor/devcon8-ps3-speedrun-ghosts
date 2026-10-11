// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SpeedrunGhosts} from "../src/SpeedrunGhosts.sol";
import {LevelData} from "../script/LevelData.sol";

/// @dev Drives the game with a fixed corpus of representative runs (goals,
///      deaths, non-finishes, an airborne extra press) from a small actor set.
///      Reverts are swallowed so the invariant fuzzer keeps exploring.
contract SubmitHandler is Test {
    SpeedrunGhosts internal game;
    bytes[] internal corpus;
    address[] internal actors;
    mapping(address => bool) public submitted;

    constructor(SpeedrunGhosts game_) {
        game = game_;

        actors.push(address(0xA1));
        actors.push(address(0xA2));
        actors.push(address(0xA3));
        actors.push(address(0xA4));

        corpus.push(_build(200, _j4(28, 78, 128, 160))); // clean (goal, 200)
        corpus.push(_build(200, _j4(30, 80, 130, 162))); // clean-alt (goal, 200)
        corpus.push(_build(210, _j4(28, 78, 128, 170))); // late wall (goal, 205)
        corpus.push(_build(600, _j4(28, 78, 128, 565))); // max length (goal, 600)
        corpus.push(_build(200, _j3(78, 128, 160))); // dies on a spike
        corpus.push(_build(150, _j3(28, 78, 128))); // never reaches the goal
        corpus.push(new bytes(1)); // no input
        corpus.push(_build(200, _j5(28, 29, 78, 128, 160))); // airborne press ignored
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function actor(uint256 i) external view returns (address) {
        return actors[i];
    }

    function submit(uint256 corpusSeed, uint256 actorSeed) external {
        bytes memory inputs = corpus[corpusSeed % corpus.length];
        address player = actors[actorSeed % actors.length];

        vm.prank(player);
        (bool ok, ) = address(game).call(
            abi.encodeWithSelector(SpeedrunGhosts.submitRun.selector, inputs)
        );
        if (ok) submitted[player] = true;
    }

    function _j3(uint256 a, uint256 b, uint256 c) internal pure returns (uint256[] memory j) {
        j = new uint256[](3);
        j[0] = a;
        j[1] = b;
        j[2] = c;
    }

    function _j4(
        uint256 a,
        uint256 b,
        uint256 c,
        uint256 d
    ) internal pure returns (uint256[] memory j) {
        j = new uint256[](4);
        j[0] = a;
        j[1] = b;
        j[2] = c;
        j[3] = d;
    }

    function _j5(
        uint256 a,
        uint256 b,
        uint256 c,
        uint256 d,
        uint256 e
    ) internal pure returns (uint256[] memory j) {
        j = new uint256[](5);
        j[0] = a;
        j[1] = b;
        j[2] = c;
        j[3] = d;
        j[4] = e;
    }

    function _build(
        uint256 length,
        uint256[] memory jumpTicks
    ) internal pure returns (bytes memory b) {
        b = new bytes(length);
        for (uint256 i = 0; i < jumpTicks.length; i++) {
            uint256 t = jumpTicks[i];
            if (t >= 1 && t <= length) b[t - 1] = 0x01;
        }
    }
}

contract SpeedrunGhostsInvariantTest is Test {
    SpeedrunGhosts internal game;
    SubmitHandler internal handler;

    uint256 internal minTime;
    address[] internal actors;

    function setUp() public {
        SpeedrunGhosts.Hazard[] memory hazards;
        SpeedrunGhosts.Solid[] memory solids;
        int256 speed;
        int256 gravity;
        int256 jumpVy;
        int256 goalX;
        uint256 maxTicks;
        (speed, gravity, jumpVy, goalX, maxTicks, hazards, solids) = LevelData.load(
            vm,
            "level/level.json"
        );
        game = new SpeedrunGhosts(speed, gravity, jumpVy, goalX, hazards, solids);
        minTime = (uint256(goalX) + uint256(speed) - 1) / uint256(speed);

        handler = new SubmitHandler(game);
        targetContract(address(handler));

        for (uint256 i = 0; i < handler.actorCount(); i++) {
            actors.push(handler.actor(i));
        }
    }

    /// @dev Every recorded time must be a real, achievable tick count.
    function invariant_bestWithinBounds() public view {
        (, uint32[] memory times) = game.getLeaderboard(0, 1000);
        for (uint256 i = 0; i < times.length; i++) {
            assertGt(times[i], 0, "best time must be positive");
            assertGe(times[i], minTime, "best time below the physical minimum");
            assertLe(times[i], game.MAX_TICKS(), "best time above MAX_TICKS");
        }
    }

    /// @dev The leaderboard is a set of players: no address may appear twice.
    function invariant_noDuplicatePlayers() public view {
        (address[] memory addrs, ) = game.getLeaderboard(0, 1000);
        for (uint256 i = 0; i < addrs.length; i++) {
            for (uint256 j = i + 1; j < addrs.length; j++) {
                assertTrue(addrs[i] != addrs[j], "duplicate player in leaderboard");
            }
        }
    }

    /// @dev playersCount must equal the leaderboard length and the number of
    ///      distinct actors that ever recorded a best time.
    function invariant_playersCountMatches() public view {
        (address[] memory addrs, ) = game.getLeaderboard(0, 1000);
        assertEq(game.playersCount(), addrs.length, "count != leaderboard length");

        uint256 recorded;
        for (uint256 i = 0; i < actors.length; i++) {
            if (handler.submitted(actors[i])) recorded++;
        }
        assertEq(game.playersCount(), recorded, "count != distinct successful players");
    }

    /// @dev Guard against a vacuous suite: drive the handler so at least one run
    ///      lands, then assert the invariants directly.
    function test_invariantsAreNonTrivial() public {
        for (uint256 i = 0; i < 8; i++) {
            handler.submit(i, i);
        }
        assertGt(game.playersCount(), 0, "handler produced no successful runs");

        invariant_bestWithinBounds();
        invariant_noDuplicatePlayers();
        invariant_playersCountMatches();
    }

    /// @dev A player's personal best is monotonically non-increasing.
    function test_bestTimeNeverIncreases() public {
        address p = address(0x1234);
        uint32[] memory times = new uint32[](4);
        times[0] = 205;
        times[1] = 200;
        times[2] = 200;
        times[3] = 200; // slower run is non-improving, best must not change

        bytes[] memory runs = new bytes[](4);
        runs[0] = _build(210, _j4(28, 78, 128, 170));
        runs[1] = _build(200, _j4(28, 78, 128, 160));
        runs[2] = _build(200, _j4(30, 80, 130, 162));
        runs[3] = _build(600, _j4(28, 78, 128, 565));

        uint32 prev = type(uint32).max;
        for (uint256 i = 0; i < runs.length; i++) {
            vm.prank(p);
            game.submitRun(runs[i]);
            uint32 cur = game.bestTime(p);
            assertEq(cur, times[i], "unexpected best time");
            assertLe(cur, prev, "best time increased");
            prev = cur;
        }
    }

    /// @dev bestInputs[player], replayed by the contract's own simulation from a
    ///      fresh address, must reproduce bestTime[player] exactly.
    function test_bestInputsReproduceBestTime() public {
        address a = address(0xA11CE);
        address b = address(0xB0B);

        vm.prank(a);
        game.submitRun(_build(200, _j4(28, 78, 128, 160)));

        bytes memory recorded = game.bestInputs(a);
        uint32 best = game.bestTime(a);

        vm.prank(b);
        game.submitRun(recorded);

        assertEq(game.bestTime(b), best, "replay did not reproduce the best time");
    }

    function _j4(
        uint256 a,
        uint256 b,
        uint256 c,
        uint256 d
    ) internal pure returns (uint256[] memory j) {
        j = new uint256[](4);
        j[0] = a;
        j[1] = b;
        j[2] = c;
        j[3] = d;
    }

    function _build(
        uint256 length,
        uint256[] memory jumpTicks
    ) internal pure returns (bytes memory b) {
        b = new bytes(length);
        for (uint256 i = 0; i < jumpTicks.length; i++) {
            uint256 t = jumpTicks[i];
            if (t >= 1 && t <= length) b[t - 1] = 0x01;
        }
    }
}
