// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title SpeedrunGhosts
/// @notice Deterministic on-chain speedrun verifier. The chain is the referee:
///         it replays the submitted per-tick inputs and derives the finish time itself.
///         There is no owner, no admin, no trusted server and no time argument.
contract SpeedrunGhosts {
    struct Hazard {
        int256 x0;
        int256 x1;
        int256 h;
    }

    struct Solid {
        int256 x0;
        int256 x1;
        int256 h;
    }

    /// @notice Hard upper bound on how many ticks a submission may contain.
    ///         Bounds the worst-case verification cost of `submitRun`.
    uint256 public constant MAX_TICKS = 600;

    error EmptyInputs();
    error InputTooLong();
    error InvalidInput();
    error RunDied();
    error GoalNotReached();

    /// @notice Emitted for every verified run, win or not, so ghost inputs are
    ///         retrievable from logs even when they do not improve the best time.
    event RunVerified(address indexed player, uint32 time, bytes inputs);

    int256 private immutable speed;
    int256 private immutable gravity;
    int256 private immutable jumpVy;
    int256 private immutable goalX;

    Hazard[] private hazards;
    Solid[] private solids;

    mapping(address => uint32) private _bestTime;
    mapping(address => bytes) private _bestInputs;
    address[] private _players;

    constructor(
        int256 speed_,
        int256 gravity_,
        int256 jumpVy_,
        int256 goalX_,
        Hazard[] memory hazards_,
        Solid[] memory solids_
    ) {
        speed = speed_;
        gravity = gravity_;
        jumpVy = jumpVy_;
        goalX = goalX_;
        for (uint256 i = 0; i < hazards_.length; i++) {
            hazards.push(hazards_[i]);
        }
        for (uint256 i = 0; i < solids_.length; i++) {
            solids.push(solids_[i]);
        }
    }

    /// @notice Replays `inputs` one tick per byte (0 = none, 1 = jump) and derives the time.
    /// @dev Input bytes are strict: every byte must be 0 or 1, otherwise `InvalidInput`.
    ///      A run that dies or never reaches the goal reverts and records nothing.
    ///      A verified but non-improving run does not revert: it emits `RunVerified` and
    ///      leaves the stored personal best untouched.
    function submitRun(bytes calldata inputs) external {
        uint256 n = inputs.length;
        if (n == 0) revert EmptyInputs();
        if (n > MAX_TICKS) revert InputTooLong();

        int256 x = 0;
        int256 y = 0;
        int256 vy = 0;
        uint32 time = 0;

        for (uint256 i = 0; i < n; i++) {
            uint8 input = uint8(inputs[i]);
            if (input > 1) revert InvalidInput();

            if (input == 1 && y == 0) {
                vy = jumpVy;
            }

            int256 nx = x + speed;
            if (!_blocked(nx, y)) {
                x = nx;
            }

            vy = vy - gravity;
            y = y + vy;
            if (y < 0) {
                y = 0;
                vy = 0;
            }

            uint256 solidLen = solids.length;
            for (uint256 s = 0; s < solidLen; s++) {
                Solid storage so = solids[s];
                if (x >= so.x0 && x <= so.x1 && y < so.h) {
                    y = so.h;
                    vy = 0;
                }
            }

            uint256 hazardLen = hazards.length;
            for (uint256 h = 0; h < hazardLen; h++) {
                Hazard storage hz = hazards[h];
                if (x >= hz.x0 && x <= hz.x1 && y < hz.h) {
                    revert RunDied();
                }
            }

            if (x >= goalX) {
                time = uint32(i + 1);
                break;
            }
        }

        if (time == 0) revert GoalNotReached();

        uint32 prev = _bestTime[msg.sender];
        if (prev == 0 || time < prev) {
            if (prev == 0) {
                _players.push(msg.sender);
            }
            _bestTime[msg.sender] = time;
            _bestInputs[msg.sender] = inputs;
        }

        emit RunVerified(msg.sender, time, inputs);
    }

    function _blocked(int256 nx, int256 y) private view returns (bool) {
        uint256 len = solids.length;
        for (uint256 s = 0; s < len; s++) {
            Solid storage so = solids[s];
            if (nx >= so.x0 && nx <= so.x1 && y < so.h) {
                return true;
            }
        }
        return false;
    }

    function bestTime(address player) external view returns (uint32) {
        return _bestTime[player];
    }

    function bestInputs(address player) external view returns (bytes memory) {
        return _bestInputs[player];
    }

    function playersCount() external view returns (uint256) {
        return _players.length;
    }

    function getLevel()
        external
        view
        returns (int256, int256, int256, int256, Hazard[] memory, Solid[] memory)
    {
        return (speed, gravity, jumpVy, goalX, hazards, solids);
    }

    function getLeaderboard(
        uint256 offset,
        uint256 limit
    ) external view returns (address[] memory addrs, uint32[] memory times) {
        uint256 len = _players.length;
        if (offset >= len || limit == 0) {
            return (new address[](0), new uint32[](0));
        }
        uint256 end = offset + limit;
        if (end > len) {
            end = len;
        }
        uint256 count = end - offset;
        addrs = new address[](count);
        times = new uint32[](count);
        for (uint256 i = 0; i < count; i++) {
            address p = _players[offset + i];
            addrs[i] = p;
            times[i] = _bestTime[p];
        }
    }
}
