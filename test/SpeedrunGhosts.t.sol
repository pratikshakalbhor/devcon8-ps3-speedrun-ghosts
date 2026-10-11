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
}
