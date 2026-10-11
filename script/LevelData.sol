// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Vm} from "forge-std/Vm.sol";
import {SpeedrunGhosts} from "../src/SpeedrunGhosts.sol";

/// @notice Loads the single-source-of-truth level from level/level.json.
///         Used by both the deploy script and the Foundry tests so no obstacle
///         data is ever duplicated in Solidity.
library LevelData {
    function load(
        Vm vm,
        string memory path
    )
        internal
        view
        returns (
            int256 speed,
            int256 gravity,
            int256 jumpVy,
            int256 goalX,
            uint256 maxTicks,
            SpeedrunGhosts.Hazard[] memory hazards,
            SpeedrunGhosts.Solid[] memory solids
        )
    {
        string memory json = vm.readFile(path);
        speed = int256(vm.parseJsonUint(json, ".speed"));
        gravity = int256(vm.parseJsonUint(json, ".gravity"));
        jumpVy = int256(vm.parseJsonUint(json, ".jumpVy"));
        goalX = int256(vm.parseJsonUint(json, ".goalX"));
        maxTicks = vm.parseJsonUint(json, ".maxTicks");

        uint256 hazardCount = vm.parseJsonArrayLength(json, ".hazards");
        hazards = new SpeedrunGhosts.Hazard[](hazardCount);
        for (uint256 i = 0; i < hazardCount; i++) {
            string memory base = string.concat(".hazards[", vm.toString(i), "]");
            hazards[i] = SpeedrunGhosts.Hazard(
                int256(vm.parseJsonUint(json, string.concat(base, ".x0"))),
                int256(vm.parseJsonUint(json, string.concat(base, ".x1"))),
                int256(vm.parseJsonUint(json, string.concat(base, ".h")))
            );
        }

        uint256 solidCount = vm.parseJsonArrayLength(json, ".solids");
        solids = new SpeedrunGhosts.Solid[](solidCount);
        for (uint256 i = 0; i < solidCount; i++) {
            string memory base = string.concat(".solids[", vm.toString(i), "]");
            solids[i] = SpeedrunGhosts.Solid(
                int256(vm.parseJsonUint(json, string.concat(base, ".x0"))),
                int256(vm.parseJsonUint(json, string.concat(base, ".x1"))),
                int256(vm.parseJsonUint(json, string.concat(base, ".h")))
            );
        }
    }
}
