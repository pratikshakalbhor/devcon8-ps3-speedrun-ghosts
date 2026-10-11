import { useEffect, useMemo } from "react";
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { BaseError, ContractFunctionRevertedError, toHex, type Hex } from "viem";
import { speedrunGhostsAbi } from "../abi";
import { CONTRACT_ADDRESS, basescanTx } from "../env";
import { formatSeconds, shortcutAddress } from "../lib/runner";

function decodeRunError(err: unknown): string {
  if (err instanceof BaseError) {
    const reverted = err.walk(
      (e) => e instanceof ContractFunctionRevertedError,
    ) as ContractFunctionRevertedError | null;
    const name = reverted?.data?.errorName;
    switch (name) {
      case "RunDied":
        return "Your run hit a spike. The chain rejected it and nothing was recorded.";
      case "GoalNotReached":
        return "You never reached the flag. Nothing was recorded.";
      case "InputTooLong":
        return "That input is longer than 600 ticks. Nothing was recorded.";
      case "EmptyInputs":
        return "There were no inputs to submit. Nothing was recorded.";
      default:
        break;
    }
    return err.shortMessage || err.message;
  }
  return err instanceof Error ? err.message : String(err);
}

interface Props {
  inputs: Uint8Array | null;
  onVerified: () => void;
}

export function SubmitPanel({ inputs, onVerified }: Props) {
  const { address, isConnected, chainId } = useAccount();

  const { writeContract, data: hash, isPending, error: writeError, reset } =
    useWriteContract();
  const {
    isLoading: confirming,
    isSuccess,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash });

  const {
    data: chainBest,
    refetch: refetchBest,
  } = useReadContract({
    abi: speedrunGhostsAbi,
    address: CONTRACT_ADDRESS,
    functionName: "bestTime",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(CONTRACT_ADDRESS && address) },
  });

  useEffect(() => {
    if (isSuccess) {
      void refetchBest();
      onVerified();
    }
  }, [isSuccess, refetchBest, onVerified]);

  const hex = useMemo(() => (inputs ? (toHex(inputs) as Hex) : undefined), [inputs]);
  const ready = Boolean(CONTRACT_ADDRESS && isConnected && hex && hex.length > 2);
  const wrongChain = isConnected && chainId !== 84532;
  const errorMessage = writeError || receiptError;

  function submit() {
    if (!CONTRACT_ADDRESS || !hex) return;
    reset();
    writeContract({
      abi: speedrunGhostsAbi,
      address: CONTRACT_ADDRESS,
      functionName: "submitRun",
      args: [hex],
    });
  }

  return (
    <div className="submit">
      <button className="primary" onClick={submit} disabled={!ready || isPending || confirming}>
        {isPending || confirming ? "Submitting..." : "Submit to chain"}
      </button>

      {!CONTRACT_ADDRESS && (
        <p className="status warn">Set VITE_CONTRACT_ADDRESS to enable on-chain submission.</p>
      )}
      {CONTRACT_ADDRESS && !isConnected && (
        <p className="status">Connect a wallet to submit your run.</p>
      )}
      {wrongChain && (
        <p className="status warn">Wrong network. Switch to Base Sepolia to submit.</p>
      )}

      {inputs && inputs.length > 0 && (
        <p className="status">Recorded {inputs.length} input bytes.</p>
      )}

      {isPending && <p className="status">Waiting for wallet confirmation...</p>}
      {confirming && <p className="status">Transaction pending on Base Sepolia...</p>}

      {hash && (
        <p className="status">
          Tx:{" "}
          <a href={basescanTx(hash)} target="_blank" rel="noreferrer">
            {shortcutAddress(hash, 6)}
          </a>
        </p>
      )}

      {isSuccess && chainBest !== undefined && Number(chainBest) > 0 && (
        <p className="verified">
          Chain-verified time: {Number(chainBest)} ticks ({formatSeconds(Number(chainBest))} s)
        </p>
      )}

      {errorMessage && <p className="error">{decodeRunError(errorMessage)}</p>}
    </div>
  );
}
