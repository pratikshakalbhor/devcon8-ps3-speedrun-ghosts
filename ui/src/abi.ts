export const speedrunGhostsAbi = [
  {
    type: "function",
    name: "submitRun",
    stateMutability: "nonpayable",
    inputs: [{ name: "inputs", type: "bytes" }],
    outputs: [],
  },
  {
    type: "function",
    name: "MAX_TICKS",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "bestTime",
    stateMutability: "view",
    inputs: [{ name: "player", type: "address" }],
    outputs: [{ name: "", type: "uint32" }],
  },
  {
    type: "function",
    name: "bestInputs",
    stateMutability: "view",
    inputs: [{ name: "player", type: "address" }],
    outputs: [{ name: "", type: "bytes" }],
  },
  {
    type: "function",
    name: "playersCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getLeaderboard",
    stateMutability: "view",
    inputs: [
      { name: "offset", type: "uint256" },
      { name: "limit", type: "uint256" },
    ],
    outputs: [
      { name: "addrs", type: "address[]" },
      { name: "times", type: "uint32[]" },
    ],
  },
  {
    type: "function",
    name: "getLevel",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "", type: "int256" },
      { name: "", type: "int256" },
      { name: "", type: "int256" },
      { name: "", type: "int256" },
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "x0", type: "int256" },
          { name: "x1", type: "int256" },
          { name: "h", type: "int256" },
        ],
      },
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "x0", type: "int256" },
          { name: "x1", type: "int256" },
          { name: "h", type: "int256" },
        ],
      },
    ],
  },
  {
    type: "event",
    name: "RunVerified",
    inputs: [
      { name: "player", type: "address", indexed: true },
      { name: "time", type: "uint32", indexed: false },
      { name: "inputs", type: "bytes", indexed: false },
    ],
  },
  { type: "error", name: "EmptyInputs", inputs: [] },
  { type: "error", name: "InputTooLong", inputs: [] },
  { type: "error", name: "RunDied", inputs: [] },
  { type: "error", name: "GoalNotReached", inputs: [] },
] as const;
