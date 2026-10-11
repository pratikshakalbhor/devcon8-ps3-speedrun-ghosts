import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { shortcutAddress } from "../lib/runner";

export function WalletBar() {
  const { address, isConnected, chainId } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();

  if (!isConnected) {
    return (
      <div className="row">
        {connectors.map((connector) => (
          <button
            key={connector.uid}
            onClick={() => connect({ connector })}
            disabled={isPending}
          >
            Connect {connector.name}
          </button>
        ))}
      </div>
    );
  }

  const wrongChain = chainId !== baseSepolia.id;

  return (
    <div className="row">
      <span className="chip">{shortcutAddress(address ?? "")}</span>
      {wrongChain ? (
        <button
          className="danger"
          onClick={() => switchChain({ chainId: baseSepolia.id })}
          disabled={switching}
        >
          Switch to Base Sepolia
        </button>
      ) : (
        <span className="chip ok">Base Sepolia</span>
      )}
      <button onClick={() => disconnect()}>Disconnect</button>
    </div>
  );
}
