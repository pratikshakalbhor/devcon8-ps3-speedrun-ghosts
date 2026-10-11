import { createConfig, http } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { coinbaseWallet, injected } from "wagmi/connectors";
import { RPC_URL } from "./env";

export const config = createConfig({
  chains: [baseSepolia],
  connectors: [
    injected({ shimDisconnect: true }),
    coinbaseWallet({ appName: "SpeedrunGhosts" }),
  ],
  transports: {
    [baseSepolia.id]: http(RPC_URL),
  },
  ssr: false,
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
