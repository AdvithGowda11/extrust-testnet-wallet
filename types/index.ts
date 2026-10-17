export type BlockchainNetwork =
  "ethereum" | "polygon" | "binance" | "base" | "solana" | "bitcoin";
export interface WalletAccount {
  address: string;
  privateKey: string;
  publicKey?: string;
  network: BlockchainNetwork;
  origin: "mnemonic" | "private-key";
  derivationPath?: string;
  addressType?: "p2wpkh";
}
export interface MultiChainWallet {
  version: 2;
  environment: "testnet";
  mnemonic?: string;
  accounts: Partial<Record<BlockchainNetwork, WalletAccount>>;
  createdAt: number;
}
export interface Token {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  network: BlockchainNetwork;
}
export type TransactionStatus =
  | "prepared"
  | "pending"
  | "confirmed"
  | "finalized"
  | "failed"
  | "expired"
  | "unknown"
  | "replaced";
export interface Transaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  timestamp: number;
  network: BlockchainNetwork;
  networkId: string;
  status: TransactionStatus;
  type: "send" | "receive" | "self";
  eventIndex?: number;
  tokenSymbol?: string;
  tokenAddress?: string;
  fee?: string;
  confirmations?: number;
  lastValidBlockHeight?: number;
  nonce?: number;
  startBlock?: number;
  inputIds?: string[];
  signedTransaction?: string;
  error?: string;
}
export interface NetworkConfig {
  id: string;
  name: string;
  symbol: string;
  decimals: number;
  chainId?: number;
  rpcUrl: string;
  explorer: string;
  faucet: string;
  logo: string;
  color: string;
}
export interface SendTransactionParams {
  from: string;
  to: string;
  amount: string;
  network: BlockchainNetwork;
  privateKey: string;
  tokenAddress?: string;
}
export interface TransferQuote {
  params: Omit<SendTransactionParams, "privateKey">;
  fee: string;
  amount: string;
  symbol: string;
  createdAt: number;
  // Signed only after user review; the prepared fields are kept in memory.
  payload: unknown;
}
