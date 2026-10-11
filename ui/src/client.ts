import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { RPC_URL } from "./env";

/** Read-only client used for on-demand ghost/level reads regardless of wallet state. */
export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(RPC_URL),
});
