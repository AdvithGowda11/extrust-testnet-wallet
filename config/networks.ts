import { BlockchainNetwork, NetworkConfig } from "@/types";
export const NETWORKS: Record<BlockchainNetwork, NetworkConfig> = {
  ethereum: {
    id: "eip155:11155111",
    name: "Ethereum Sepolia",
    symbol: "ETH",
    decimals: 18,
    chainId: 11155111,
    rpcUrl: "/api/rpc/ethereum",
    explorer: "https://sepolia.etherscan.io",
    faucet: "https://faucet.quicknode.com/ethereum/sepolia",
    logo: "⟠",
    color: "#627EEA",
  },
  polygon: {
    id: "eip155:80002",
    name: "Polygon Amoy",
    symbol: "POL",
    decimals: 18,
    chainId: 80002,
    rpcUrl: "/api/rpc/polygon",
    explorer: "https://amoy.polygonscan.com",
    faucet: "https://faucet.quicknode.com/polygon/routes/index",
    logo: "⬡",
    color: "#8247E5",
  },
  binance: {
    id: "eip155:97",
    name: "BNB Testnet",
    symbol: "BNB",
    decimals: 18,
    chainId: 97,
    rpcUrl: "/api/rpc/binance",
    explorer: "https://testnet.bscscan.com",
    faucet: "https://faucet.quicknode.com/binance-smart-chain/bnb-testnet",
    logo: "◆",
    color: "#B48300",
  },
  base: {
    id: "eip155:84532",
    name: "Base Sepolia",
    symbol: "ETH",
    decimals: 18,
    chainId: 84532,
    rpcUrl: "/api/rpc/base",
    explorer: "https://sepolia.basescan.org",
    faucet: "https://faucet.quicknode.com/base/sepolia",
    logo: "●",
    color: "#0052FF",
  },
  solana: {
    id: "solana:devnet",
    name: "Solana Devnet",
    symbol: "SOL",
    decimals: 9,
    rpcUrl: "/api/rpc/solana",
    explorer: "https://explorer.solana.com",
    faucet: "https://faucet.solana.com/",
    logo: "◎",
    color: "#137D65",
  },
  bitcoin: {
    id: "bitcoin:signet",
    name: "Bitcoin Signet",
    symbol: "BTC",
    decimals: 8,
    rpcUrl: "/api/bitcoin",
    explorer: "https://mempool.space/signet",
    faucet: "https://bitcoinsignetfaucet.com/",
    logo: "₿",
    color: "#C16B00",
  },
};
export const CHAINS = Object.keys(NETWORKS) as BlockchainNetwork[];
export const EVM_NETWORKS: BlockchainNetwork[] = [
  "ethereum",
  "polygon",
  "binance",
  "base",
];
export const NON_EVM_NETWORKS: BlockchainNetwork[] = ["solana", "bitcoin"];
export const COMMON_TOKENS: Partial<Record<BlockchainNetwork, never[]>> = {};
export function isNetwork(value: string): value is BlockchainNetwork {
  return CHAINS.includes(value as BlockchainNetwork);
}
export function isEVM(network: BlockchainNetwork) {
  return EVM_NETWORKS.includes(network);
}
export function apiBaseUrl() {
  return typeof window === "undefined"
    ? "http://localhost:3000"
    : window.location.origin;
}
export function explorerUrl(
  network: BlockchainNetwork,
  value: string,
  kind: "tx" | "address" = "tx",
) {
  return `${NETWORKS[network].explorer}/${kind}/${encodeURIComponent(value)}${network === "solana" ? "?cluster=devnet" : ""}`;
}
export function sameAddress(network: BlockchainNetwork, a: string, b: string) {
  return isEVM(network) ? a.toLowerCase() === b.toLowerCase() : a === b;
}
