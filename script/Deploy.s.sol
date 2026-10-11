// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {SpeedrunGhosts} from "../src/SpeedrunGhosts.sol";
import {LevelData} from "./LevelData.sol";

contract Deploy is Script {
    function run() external returns (SpeedrunGhosts game) {
        (
            int256 speed,
            int256 gravity,
            int256 jumpVy,
            int256 goalX,
            ,
            SpeedrunGhosts.Hazard[] memory hazards,
            SpeedrunGhosts.Solid[] memory solids
        ) = LevelData.load(vm, "level/level.json");

        vm.startBroadcast();
        game = new SpeedrunGhosts(speed, gravity, jumpVy, goalX, hazards, solids);
        vm.stopBroadcast();

        console2.log("SpeedrunGhosts deployed at", address(game));
    }
}
