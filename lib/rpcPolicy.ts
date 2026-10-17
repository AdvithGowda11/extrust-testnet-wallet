import { Transaction } from "ethers";
import { BlockchainNetwork } from "@/types";
import { NETWORKS } from "@/config/networks";
export const EVM_METHODS = new Set([
  "eth_chainId",
  "eth_blockNumber",
  "eth_getBalance",
  "eth_getTransactionCount",
  "eth_getCode",
  "eth_call",
  "eth_estimateGas",
  "eth_gasPrice",
  "eth_maxPriorityFeePerGas",
  "eth_feeHistory",
  "eth_getBlockByNumber",
  "eth_getTransactionByHash",
  "eth_getTransactionReceipt",
  "eth_getLogs",
  "eth_sendRawTransaction",
]);
export const SOLANA_METHODS = new Set([
  "getGenesisHash",
  "getBalance",
  "getLatestBlockhash",
  "getBlockHeight",
  "getFeeForMessage",
  "getSignatureStatuses",
  "getSignaturesForAddress",
  "getTransaction",
  "sendTransaction",
  "simulateTransaction",
  "getAccountInfo",
  "getVersion",
  "getMinimumBalanceForRentExemption",
]);
export function validateRpc(chain: BlockchainNetwork, body: unknown) {
  const calls = Array.isArray(body) ? body : [body];
  if (!calls.length || calls.length > 10)
    throw new Error("RPC batches must contain 1–10 calls");
  for (const call of calls) {
    if (
      !call ||
      typeof call !== "object" ||
      call.jsonrpc !== "2.0" ||
      !(chain === "solana" ? SOLANA_METHODS : EVM_METHODS).has(call.method) ||
      !Array.isArray(call.params)
    )
      throw new Error("Unsupported RPC request");
    if (call.method === "eth_sendRawTransaction") {
      const tx = Transaction.from(call.params[0]);
      if (!tx.signature || tx.chainId !== BigInt(NETWORKS[chain].chainId!))
        throw new Error(
          "Only signed transactions for this test network are allowed",
        );
    }
    if (call.method === "eth_getLogs") {
      const filter = call.params[0];
      if (
        !filter?.address ||
        !filter.fromBlock ||
        !filter.toBlock ||
        BigInt(filter.toBlock) - BigInt(filter.fromBlock) > 2000n
      )
        throw new Error(
          "Log queries require an address and at most 2000 blocks",
        );
    }
  }
  return calls;
}
