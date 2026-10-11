import { isAddress, type Address } from "viem";

export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID ?? 84532);

export const RPC_URL: string =
  import.meta.env.VITE_RPC_URL && import.meta.env.VITE_RPC_URL.length > 0
    ? import.meta.env.VITE_RPC_URL
    : "https://sepolia.base.org";

const ZERO = "0x0000000000000000000000000000000000000000";
const rawAddress = import.meta.env.VITE_CONTRACT_ADDRESS ?? "";

export const CONTRACT_ADDRESS: Address | undefined =
  isAddress(rawAddress) && rawAddress.toLowerCase() !== ZERO
    ? (rawAddress as Address)
    : undefined;

export const BASESCAN = "https://sepolia.basescan.org";

export function basescanAddress(addr: string): string {
  return `${BASESCAN}/address/${addr}`;
}

export function basescanTx(hash: string): string {
  return `${BASESCAN}/tx/${hash}`;
}
