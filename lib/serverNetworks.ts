import "server-only";
import { BlockchainNetwork } from "@/types";
import { isNetwork, EVM_NETWORKS, NETWORKS } from "@/config/networks";
export type ServerChain = BlockchainNetwork;
export const isSupportedChain = isNetwork;
export const EVM_CHAINS = EVM_NETWORKS;
export const EVM_CHAIN_IDS = Object.fromEntries(
  EVM_NETWORKS.map((n) => [n, NETWORKS[n].chainId!]),
);
// Old mainnet RPC_* variables are deliberately not read.
export function getRpcUrl(chain: BlockchainNetwork): string {
  const urls: Record<BlockchainNetwork, string> = {
    ethereum:
      process.env.TEST_RPC_ETHEREUM ||
      "https://ethereum-sepolia-rpc.publicnode.com",
    polygon:
      process.env.TEST_RPC_POLYGON ||
      "https://polygon-amoy-bor-rpc.publicnode.com",
    binance:
      process.env.TEST_RPC_BINANCE || "https://bsc-testnet-rpc.publicnode.com",
    base: process.env.TEST_RPC_BASE || "https://sepolia.base.org",
    solana: process.env.TEST_RPC_SOLANA || "https://api.devnet.solana.com",
    bitcoin: "",
  };
  const url = urls[chain];
  if (!url || !url.startsWith("https://"))
    throw new Error("An HTTPS test-network RPC is required");
  return url;
}
export function getBitcoinApiBase() {
  return "https://mempool.space/signet/api";
}
