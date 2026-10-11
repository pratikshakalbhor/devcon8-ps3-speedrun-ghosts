// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SpeedrunGhosts} from "../src/SpeedrunGhosts.sol";
import {LevelData} from "../script/LevelData.sol";

contract SpeedrunGhostsTest is Test {
    SpeedrunGhosts internal game;

    int256 internal speed;
    int256 internal gravity;
    int256 internal jumpVy;
    int256 internal goalX;
    uint256 internal maxTicks;

    struct Vector {
        string name;
        bytes inputs;
        string status;
        uint256 time;
        uint256 tick;
    }

    Vector[] internal vectors;

    struct FuzzVector {
        string name;
        bytes inputs;
        string status;
        uint256 time;
        uint256 tick;
    }

    FuzzVector[] internal fuzzVectors;

    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);

    function setUp() public {
        SpeedrunGhosts.Hazard[] memory hazards;
        SpeedrunGhosts.Solid[] memory solids;
        (speed, gravity, jumpVy, goalX, maxTicks, hazards, solids) = LevelData.load(
            vm,
            "level/level.json"
        );
        game = new SpeedrunGhosts(speed, gravity, jumpVy, goalX, hazards, solids);
        _loadVectors();
        _loadFuzzVectors();
    }

    function _loadVectors() internal {
        string memory json = vm.readFile("level/vectors.json");
        uint256 count = vm.parseJsonArrayLength(json, ".vectors");
        for (uint256 i = 0; i < count; i++) {
            string memory base = string.concat(".vectors[", vm.toString(i), "]");
            vectors.push(
                Vector({
                    name: vm.parseJsonString(json, string.concat(base, ".name")),
                    inputs: vm.parseBytes(vm.parseJsonString(json, string.concat(base, ".inputs"))),
                    status: vm.parseJsonString(json, string.concat(base, ".status")),
                    time: vm.parseJsonUint(json, string.concat(base, ".time")),
                    tick: vm.parseJsonUint(json, string.concat(base, ".tick"))
                })
            );
        }
    }

    function _loadFuzzVectors() internal {
        string memory json = vm.readFile("level/fuzz-vectors.json");
        uint256 count = vm.parseJsonArrayLength(json, ".vectors");
        for (uint256 i = 0; i < count; i++) {
            string memory base = string.concat(".vectors[", vm.toString(i), "]");
            fuzzVectors.push(
                FuzzVector({
                    name: vm.parseJsonString(json, string.concat(base, ".name")),
                    inputs: vm.parseBytes(vm.parseJsonString(json, string.concat(base, ".inputs"))),
                    status: vm.parseJsonString(json, string.concat(base, ".status")),
                    time: vm.parseJsonUint(json, string.concat(base, ".time")),
                    tick: vm.parseJsonUint(json, string.concat(base, ".tick"))
                })
            );
        }
    }

    function _build(
        uint256 length,
        uint256[] memory jumpTicks
    ) internal pure returns (bytes memory b) {
        b = new bytes(length);
        for (uint256 i = 0; i < jumpTicks.length; i++) {
            uint256 t = jumpTicks[i];
            if (t >= 1 && t <= length) {
                b[t - 1] = 0x01;
            }
        }
    }

    function _clean() internal pure returns (bytes memory) {
        uint256[] memory j = new uint256[](4);
        j[0] = 28;
        j[1] = 78;
        j[2] = 128;
        j[3] = 160;
        return _build(200, j);
    }

    function _cleanAlt() internal pure returns (bytes memory) {
        uint256[] memory j = new uint256[](4);
        j[0] = 30;
        j[1] = 80;
        j[2] = 130;
        j[3] = 162;
        return _build(200, j);
    }

    function _lateWall() internal pure returns (bytes memory) {
        uint256[] memory j = new uint256[](4);
        j[0] = 28;
        j[1] = 78;
        j[2] = 128;
        j[3] = 170;
        return _build(210, j);
    }

    function _shortNoGoal() internal pure returns (bytes memory) {
        uint256[] memory j = new uint256[](3);
        j[0] = 28;
        j[1] = 78;
        j[2] = 128;
        return _build(150, j);
    }

    function _diedOnSpike() internal pure returns (bytes memory) {
        uint256[] memory j = new uint256[](3);
        j[0] = 78;
        j[1] = 128;
        j[2] = 160;
        return _build(200, j);
    }

    function _maxLength() internal pure returns (bytes memory) {
        uint256[] memory j = new uint256[](4);
        j[0] = 28;
        j[1] = 78;
        j[2] = 128;
        j[3] = 565;
        return _build(600, j);
    }

    function test_cleanRunIsVerified() public {
        bytes memory inputs = _clean();

        vm.prank(ALICE);
        game.submitRun(inputs);

        assertEq(game.bestTime(ALICE), 200);
        assertEq(game.bestInputs(ALICE), inputs);
        assertEq(game.playersCount(), 1);
    }

    function test_inputsLongerThanMaxTicksRevert() public {
        bytes memory inputs = new bytes(game.MAX_TICKS() + 1);

        vm.prank(ALICE);
        vm.expectRevert(SpeedrunGhosts.InputTooLong.selector);
        game.submitRun(inputs);

        assertEq(game.bestTime(ALICE), 0);
        assertEq(game.playersCount(), 0);
    }

    function test_emptyInputsRevertAndRecordNothing() public {
        bytes memory inputs = new bytes(0);

        vm.prank(ALICE);
        vm.expectRevert(SpeedrunGhosts.EmptyInputs.selector);
        game.submitRun(inputs);

        assertEq(game.bestTime(ALICE), 0);
        assertEq(game.bestInputs(ALICE).length, 0);
        assertEq(game.playersCount(), 0);
    }

    function test_runThatNeverReachesGoalRevertsAndRecordsNothing() public {
        bytes memory inputs = _shortNoGoal();

        vm.prank(ALICE);
        vm.expectRevert(SpeedrunGhosts.GoalNotReached.selector);
        game.submitRun(inputs);

        assertEq(game.bestTime(ALICE), 0);
        assertEq(game.playersCount(), 0);
    }

    function test_runThatHitsHazardRevertsAndRecordsNothing() public {
        bytes memory inputs = _diedOnSpike();

        vm.prank(ALICE);
        vm.expectRevert(SpeedrunGhosts.RunDied.selector);
        game.submitRun(inputs);

        assertEq(game.bestTime(ALICE), 0);
        assertEq(game.playersCount(), 0);
    }

    function test_fasterRunReplacesBest_slowerAndEqualDoNot() public {
        vm.prank(ALICE);
        game.submitRun(_lateWall());
        assertEq(game.bestTime(ALICE), 205);

        vm.prank(ALICE);
        game.submitRun(_clean());
        assertEq(game.bestTime(ALICE), 200);
        assertEq(game.bestInputs(ALICE), _clean());

        vm.prank(ALICE);
        game.submitRun(_cleanAlt());
        assertEq(game.bestTime(ALICE), 200);
        assertEq(game.bestInputs(ALICE), _clean());

        vm.prank(ALICE);
        game.submitRun(_lateWall());
        assertEq(game.bestTime(ALICE), 200);
        assertEq(game.bestInputs(ALICE), _clean());
        assertEq(game.playersCount(), 1);
    }

    function test_timeIsDerivedOnlyFromInputs() public {
        address p1 = address(0x1001);
        address p2 = address(0x1002);
        address p3 = address(0x1003);
        address p4 = address(0x1004);

        vm.prank(p1);
        game.submitRun(_clean());
        vm.prank(p2);
        game.submitRun(_cleanAlt());
        vm.prank(p3);
        game.submitRun(_lateWall());
        vm.prank(p4);
        game.submitRun(_maxLength());

        assertEq(game.bestTime(p1), 200);
        assertEq(game.bestTime(p2), 200);
        assertEq(game.bestTime(p3), 205);
        assertEq(game.bestTime(p4), 600);

        assertTrue(game.bestTime(p3) != game.bestTime(p1));
        assertTrue(game.bestTime(p4) != game.bestTime(p3));
        assertTrue(game.bestTime(p1) == game.bestTime(p2));
    }

    function test_bestInputsAndEventReturnExactInputs() public {
        bytes memory inputs = _clean();

        vm.expectEmit(true, false, false, true, address(game));
        emit SpeedrunGhosts.RunVerified(ALICE, 200, inputs);

        vm.prank(ALICE);
        game.submitRun(inputs);

        assertEq(game.bestInputs(ALICE), inputs);
    }

    function test_nonImprovingRunStillEmitsButDoesNotOverwrite() public {
        bytes memory best = _clean();
        vm.prank(ALICE);
        game.submitRun(best);

        bytes memory slower = _lateWall();
        vm.expectEmit(true, false, false, true, address(game));
        emit SpeedrunGhosts.RunVerified(ALICE, 205, slower);

        vm.prank(ALICE);
        game.submitRun(slower);

        assertEq(game.bestTime(ALICE), 200);
        assertEq(game.bestInputs(ALICE), best);
        assertEq(game.playersCount(), 1);
    }

    function test_twoPlayersTrackedIndependently() public {
        vm.prank(ALICE);
        game.submitRun(_clean());
        vm.prank(BOB);
        game.submitRun(_lateWall());

        assertEq(game.playersCount(), 2);
        assertEq(game.bestTime(ALICE), 200);
        assertEq(game.bestTime(BOB), 205);

        (address[] memory addrs, uint32[] memory times) = game.getLeaderboard(0, 10);
        assertEq(addrs.length, 2);
        assertEq(times.length, 2);
        assertEq(addrs[0], ALICE);
        assertEq(times[0], 200);
        assertEq(addrs[1], BOB);
        assertEq(times[1], 205);

        (addrs, times) = game.getLeaderboard(0, 1);
        assertEq(addrs.length, 1);
        assertEq(addrs[0], ALICE);

        (addrs, times) = game.getLeaderboard(1, 1);
        assertEq(addrs.length, 1);
        assertEq(addrs[0], BOB);

        (addrs, times) = game.getLeaderboard(5, 10);
        assertEq(addrs.length, 0);
        assertEq(times.length, 0);
    }

    function test_getLevelReturnsDeployedLevel() public view {
        (
            int256 sp,
            int256 gr,
            int256 jv,
            int256 gx,
            SpeedrunGhosts.Hazard[] memory hz,
            SpeedrunGhosts.Solid[] memory so
        ) = game.getLevel();

        assertEq(sp, speed);
        assertEq(gr, gravity);
        assertEq(jv, jumpVy);
        assertEq(gx, goalX);
        assertEq(hz.length, 3);
        assertEq(so.length, 1);
        assertEq(hz[0].x0, 100);
        assertEq(so[0].x0, 500);
    }

    function _cleanPlusAirborneJump() internal pure returns (bytes memory) {
        uint256[] memory j = new uint256[](5);
        j[0] = 28;
        j[1] = 29; // tick 29 is airborne, so this press must be ignored
        j[2] = 78;
        j[3] = 128;
        j[4] = 160;
        return _build(200, j);
    }

    function test_invalidInputByteReverts() public {
        bytes memory low = _clean();
        low[10] = 0x02;
        vm.prank(ALICE);
        vm.expectRevert(SpeedrunGhosts.InvalidInput.selector);
        game.submitRun(low);

        bytes memory high = _clean();
        high[10] = 0xff;
        vm.prank(ALICE);
        vm.expectRevert(SpeedrunGhosts.InvalidInput.selector);
        game.submitRun(high);

        assertEq(game.bestTime(ALICE), 0);
        assertEq(game.bestInputs(ALICE).length, 0);
        assertEq(game.playersCount(), 0);
    }

    function test_airborneJumpIsIgnored() public {
        bytes memory withAir = _cleanPlusAirborneJump();

        vm.prank(ALICE);
        game.submitRun(withAir);

        assertEq(game.bestTime(ALICE), 200);
        assertEq(game.bestInputs(ALICE), withAir);
    }

    function test_goldenVectorsMatchContract() public {
        for (uint256 i = 0; i < vectors.length; i++) {
            Vector memory v = vectors[i];
            address player = address(uint160(0x2000 + i));
            bytes32 statusHash = keccak256(bytes(v.status));

            if (statusHash == keccak256("goal")) {
                vm.prank(player);
                game.submitRun(v.inputs);
                assertEq(game.bestTime(player), v.time);
                assertEq(game.bestInputs(player), v.inputs);
            } else if (statusHash == keccak256("died")) {
                vm.prank(player);
                vm.expectRevert(SpeedrunGhosts.RunDied.selector);
                game.submitRun(v.inputs);
                assertEq(game.bestTime(player), 0);
            } else if (statusHash == keccak256("goalNotReached")) {
                vm.prank(player);
                vm.expectRevert(SpeedrunGhosts.GoalNotReached.selector);
                game.submitRun(v.inputs);
                assertEq(game.bestTime(player), 0);
            } else if (statusHash == keccak256("inputTooLong")) {
                vm.prank(player);
                vm.expectRevert(SpeedrunGhosts.InputTooLong.selector);
                game.submitRun(v.inputs);
            } else if (statusHash == keccak256("emptyInputs")) {
                vm.prank(player);
                vm.expectRevert(SpeedrunGhosts.EmptyInputs.selector);
                game.submitRun(v.inputs);
            } else {
                revert("unknown vector status");
            }
        }
    }

    function test_fuzzVectorsMatchContract() public {
        assertGt(fuzzVectors.length, 0, "fuzz corpus must be loaded");

        for (uint256 i = 0; i < fuzzVectors.length; i++) {
            FuzzVector memory v = fuzzVectors[i];
            address player = address(uint160(0x500000 + i));
            bytes32 statusHash = keccak256(bytes(v.status));

            if (statusHash == keccak256("goal")) {
                vm.prank(player);
                game.submitRun(v.inputs);
                assertEq(game.bestTime(player), v.time, v.name);
                assertEq(game.bestInputs(player), v.inputs, v.name);
            } else if (statusHash == keccak256("died")) {
                vm.prank(player);
                vm.expectRevert(SpeedrunGhosts.RunDied.selector);
                game.submitRun(v.inputs);
                assertEq(game.bestTime(player), 0, v.name);
            } else if (statusHash == keccak256("goalNotReached")) {
                vm.prank(player);
                vm.expectRevert(SpeedrunGhosts.GoalNotReached.selector);
                game.submitRun(v.inputs);
                assertEq(game.bestTime(player), 0, v.name);
            } else if (statusHash == keccak256("inputTooLong")) {
                vm.prank(player);
                vm.expectRevert(SpeedrunGhosts.InputTooLong.selector);
                game.submitRun(v.inputs);
            } else if (statusHash == keccak256("emptyInputs")) {
                vm.prank(player);
                vm.expectRevert(SpeedrunGhosts.EmptyInputs.selector);
                game.submitRun(v.inputs);
            } else if (statusHash == keccak256("invalidInput")) {
                vm.prank(player);
                vm.expectRevert(SpeedrunGhosts.InvalidInput.selector);
                game.submitRun(v.inputs);
            } else {
                revert(string.concat("unknown fuzz status: ", v.status));
            }
        }
    }

    /// @dev Any byte sequence must either be accepted (recording a time in
    ///      [1, MAX_TICKS]) or revert with one of the five documented errors.
    ///      It must never panic (overflow, array OOB) and never accept a bogus time.
    function testFuzz_submitRunArbitraryBytesNeverPanics(bytes memory inputs) public {
        vm.assume(inputs.length <= game.MAX_TICKS());

        address player = address(0xF00D);
        vm.prank(player);
        (bool ok, bytes memory ret) = address(game).call(
            abi.encodeWithSelector(SpeedrunGhosts.submitRun.selector, inputs)
        );

        if (ok) {
            uint32 t = game.bestTime(player);
            assertGe(t, 1);
            assertLe(t, game.MAX_TICKS());
        } else {
            bytes4 sel = bytes4(ret);
            assertTrue(
                sel == SpeedrunGhosts.EmptyInputs.selector
                    || sel == SpeedrunGhosts.InputTooLong.selector
                    || sel == SpeedrunGhosts.InvalidInput.selector
                    || sel == SpeedrunGhosts.RunDied.selector
                    || sel == SpeedrunGhosts.GoalNotReached.selector,
                "unexpected revert selector (panic?)"
            );
        }
    }

    /// @dev Stronger physics fuzz: well-formed 0/1 inputs so the loop actually
    ///      runs, checking the same accept-or-documented-error oracle.
    function testFuzz_submitRunBitInputsNeverPanics(uint8[] memory seed) public {
        uint256 length = seed.length % (game.MAX_TICKS() + 1);
        bytes memory inputs = new bytes(length);
        for (uint256 i = 0; i < length; i++) {
            inputs[i] = bytes1(seed[i] % 2);
        }

        address player = address(0xBEEF);
        vm.prank(player);
        (bool ok, bytes memory ret) = address(game).call(
            abi.encodeWithSelector(SpeedrunGhosts.submitRun.selector, inputs)
        );

        if (ok) {
            uint32 t = game.bestTime(player);
            assertGe(t, 1);
            assertLe(t, game.MAX_TICKS());
        } else {
            bytes4 sel = bytes4(ret);
            assertTrue(
                sel == SpeedrunGhosts.EmptyInputs.selector
                    || sel == SpeedrunGhosts.InputTooLong.selector
                    || sel == SpeedrunGhosts.InvalidInput.selector
                    || sel == SpeedrunGhosts.RunDied.selector
                    || sel == SpeedrunGhosts.GoalNotReached.selector,
                "unexpected revert selector (panic?)"
            );
        }
    }

    function test_gasForMaxLengthSubmission() public {
        bytes memory inputs = _maxLength();

        vm.prank(ALICE);
        uint256 before = gasleft();
        game.submitRun(inputs);
        uint256 used = before - gasleft();

        emit log_named_uint("max-length submitRun gas", used);
        assertEq(game.bestTime(ALICE), 600);
        assertLt(used, 2_500_000);
    }

    // ------------------------------------------------------------------
    // Explicit edge cases
    // ------------------------------------------------------------------

    function _deploy(
        int256 goalX_,
        SpeedrunGhosts.Hazard[] memory hazards_,
        SpeedrunGhosts.Solid[] memory solids_
    ) internal returns (SpeedrunGhosts g) {
        g = new SpeedrunGhosts(3, 1, 9, goalX_, hazards_, solids_);
    }

    function _haz(
        int256 x0,
        int256 x1,
        int256 h
    ) internal pure returns (SpeedrunGhosts.Hazard[] memory hs) {
        hs = new SpeedrunGhosts.Hazard[](1);
        hs[0] = SpeedrunGhosts.Hazard(x0, x1, h);
    }

    function _sol(
        int256 x0,
        int256 x1,
        int256 h
    ) internal pure returns (SpeedrunGhosts.Solid[] memory ss) {
        ss = new SpeedrunGhosts.Solid[](1);
        ss[0] = SpeedrunGhosts.Solid(x0, x1, h);
    }

    function _noHazards() internal pure returns (SpeedrunGhosts.Hazard[] memory hs) {
        hs = new SpeedrunGhosts.Hazard[](0);
    }

    function _noSolids() internal pure returns (SpeedrunGhosts.Solid[] memory ss) {
        ss = new SpeedrunGhosts.Solid[](0);
    }

    function _jump1() internal pure returns (uint256[] memory j) {
        j = new uint256[](1);
        j[0] = 1;
    }

    function test_finishAtMaxTicksIsAccepted() public {
        vm.prank(ALICE);
        game.submitRun(_maxLength());
        assertEq(game.bestTime(ALICE), 600);
        assertEq(game.playersCount(), 1);
    }

    function test_finishAtMaxTicksPlusOneReverts() public {
        // A run can only finish at tick 601 if it carries >= 601 inputs, which
        // is rejected before simulation. It can never be recorded.
        bytes memory inputs = _build(game.MAX_TICKS() + 1, new uint256[](0));

        vm.prank(ALICE);
        vm.expectRevert(SpeedrunGhosts.InputTooLong.selector);
        game.submitRun(inputs);

        assertEq(game.bestTime(ALICE), 0);
    }

    function test_diesOnFirstTick() public {
        SpeedrunGhosts g = _deploy(600, _haz(0, 6, 1), _noSolids());

        bytes memory inputs = new bytes(1);
        vm.expectRevert(SpeedrunGhosts.RunDied.selector);
        g.submitRun(inputs);
    }

    function test_jumpOnFirstTick() public {
        // The hazard sits low enough that only a first-tick jump clears it.
        SpeedrunGhosts g = _deploy(9, _haz(0, 6, 5), _noSolids());

        vm.expectRevert(SpeedrunGhosts.RunDied.selector);
        g.submitRun(_build(3, new uint256[](0)));

        g.submitRun(_build(3, _jump1()));
        assertEq(g.bestTime(address(this)), 3);
    }

    function test_spikeBoundariesAreInclusive() public {
        // x lands exactly on x0 (tick 1, x = 3): must die.
        SpeedrunGhosts g1 = _deploy(9, _haz(3, 3, 1), _noSolids());
        vm.expectRevert(SpeedrunGhosts.RunDied.selector);
        g1.submitRun(_build(3, new uint256[](0)));

        // x lands exactly on x1 (tick 2, x = 6): must die.
        SpeedrunGhosts g2 = _deploy(9, _haz(4, 6, 1), _noSolids());
        vm.expectRevert(SpeedrunGhosts.RunDied.selector);
        g2.submitRun(_build(3, new uint256[](0)));

        // Just outside the range (x = 3 then 6, hazard [4,5]): survives.
        SpeedrunGhosts g3 = _deploy(9, _haz(4, 5, 1), _noSolids());
        g3.submitRun(_build(3, new uint256[](0)));
        assertEq(g3.bestTime(address(this)), 3);
    }

    function test_solidWallBlocksAndJumpClears() public {
        SpeedrunGhosts g = _deploy(15, _noHazards(), _sol(9, 9, 12));

        // No jump: stopped at the wall at x = 6 forever.
        vm.expectRevert(SpeedrunGhosts.GoalNotReached.selector);
        g.submitRun(_build(20, new uint256[](0)));

        // First-tick jump clears the wall and finishes at tick 5.
        g.submitRun(_build(10, _jump1()));
        assertEq(g.bestTime(address(this)), 5);
    }

    function test_twoPlayersIdenticalInputs() public {
        bytes memory inputs = _clean();

        vm.prank(ALICE);
        game.submitRun(inputs);
        vm.prank(BOB);
        game.submitRun(inputs);

        assertEq(game.bestTime(ALICE), 200);
        assertEq(game.bestTime(BOB), 200);
        assertEq(game.playersCount(), 2);

        (address[] memory addrs, uint32[] memory times) = game.getLeaderboard(0, game.MAX_PAGE());
        assertEq(addrs.length, 2);
        assertEq(times[0], 200);
        assertEq(times[1], 200);
    }

    function test_leaderboardEdgeCases() public {
        (address[] memory a, uint32[] memory t) = game.getLeaderboard(0, type(uint256).max);
        assertEq(a.length, 0);
        assertEq(t.length, 0);

        vm.prank(ALICE);
        game.submitRun(_clean());

        // limit 0 returns nothing
        (a, t) = game.getLeaderboard(0, 0);
        assertEq(a.length, 0);
        assertEq(t.length, 0);

        // offset past the end returns nothing
        (a, t) = game.getLeaderboard(5, 10);
        assertEq(a.length, 0);
        assertEq(t.length, 0);

        // huge limit caps to available without overflow or running out of gas
        (a, t) = game.getLeaderboard(0, type(uint256).max);
        assertEq(a.length, 1);
        assertEq(a[0], ALICE);
        assertEq(t[0], 200);

        vm.prank(BOB);
        game.submitRun(_clean());

        (a, t) = game.getLeaderboard(1, type(uint256).max);
        assertEq(a.length, 1);
        assertEq(a[0], BOB);
    }
}
