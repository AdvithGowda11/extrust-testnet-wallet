import {
  MultiChainWallet,
  Token,
  Transaction,
  BlockchainNetwork,
} from "@/types";
import { NETWORKS, isNetwork, sameAddress } from "@/config/networks";
import { BackupService } from "@/services/backupService";
import { WalletService } from "@/services/walletService";
import { mergeHistory } from "@/lib/history";
const VAULT = "extrust:testnet:v2:vault";
const ARCHIVE = "extrust:legacy:v1:archive";
let unlocked: MultiChainWallet | null = null;
function store(key: string, value: unknown) {
  const json = JSON.stringify(value);
  localStorage.setItem(key, json);
  if (localStorage.getItem(key) !== json)
    throw new Error("Could not verify saved data");
}
function scope(kind: string) {
  if (!unlocked) throw new Error("Unlock your wallet first");
  const identity = Object.values(unlocked.accounts)
    .map((a) => `${a.network}:${a.address}`)
    .sort()
    .join("|");
  return `extrust:testnet:v2:${identity}:${kind}`;
}
function records(key: string): unknown[] {
  const value = localStorage.getItem(key);
  if (!value) return [];
  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed))
    throw new Error(
      "Stored records are damaged. Export your vault before resetting data.",
    );
  return parsed;
}
export class StorageService {
  static get vaultKey() {
    return VAULT;
  }
  static hasWallet() {
    return localStorage.getItem(VAULT) !== null;
  }
  static getWallet() {
    return unlocked;
  }
  static async saveWallet(wallet: MultiChainWallet, password: string) {
    WalletService.validateWallet(wallet);
    const encrypted = await BackupService.encrypt(wallet, password);
    const restored = await BackupService.decrypt(encrypted, password);
    WalletService.validateWallet(restored);
    store(VAULT, encrypted);
    unlocked = wallet;
  }
  static async unlock(password: string) {
    const raw = localStorage.getItem(VAULT);
    if (!raw) throw new Error("No local wallet");
    const wallet = await BackupService.decrypt(JSON.parse(raw), password);
    WalletService.validateWallet(wallet);
    unlocked = wallet;
    return wallet;
  }
  static lock() {
    unlocked = null;
    if (typeof window !== "undefined")
      window.dispatchEvent(new Event("wallet-lock"));
  }
  static deleteWallet() {
    const tokenKey = scope("tokens"),
      txKey = scope("transactions");
    localStorage.removeItem(VAULT);
    localStorage.removeItem(tokenKey);
    localStorage.removeItem(txKey);
    this.lock();
  }
  static encryptedVault() {
    const value = localStorage.getItem(VAULT);
    if (!value) throw new Error("No wallet");
    return value;
  }
  static hasLegacy() {
    return localStorage.getItem("trust_wallet_data") !== null;
  }
  static legacyArchive() {
    return localStorage.getItem(ARCHIVE);
  }
  static async archiveLegacy(password: string) {
    if (localStorage.getItem(ARCHIVE))
      throw new Error(
        "An archive already exists. Download it before archiving another legacy wallet.",
      );
    const original = localStorage.getItem("trust_wallet_data");
    if (!original) return;
    // Preserve the exact original bytes, including legacy derivation and imports.
    const payload = {
      version: 1,
      environment: "legacy-mainnet",
      original,
      tokens: localStorage.getItem("trust_wallet_tokens"),
      transactions: localStorage.getItem("trust_wallet_transactions"),
    };
    const encrypted = await BackupService.encrypt(payload, password);
    if (
      JSON.stringify(await BackupService.decrypt(encrypted, password)) !==
      JSON.stringify(payload)
    )
      throw new Error("Archive verification failed");
    store(ARCHIVE, encrypted);
    localStorage.removeItem("trust_wallet_data");
    localStorage.removeItem("trust_wallet_tokens");
    localStorage.removeItem("trust_wallet_transactions");
  }
  static getTokens(): Token[] {
    return records(scope("tokens")).map((value) => {
      const t = value as Token;
      if (
        !t ||
        !isNetwork(t.network) ||
        typeof t.address !== "string" ||
        typeof t.symbol !== "string" ||
        typeof t.name !== "string" ||
        !Number.isInteger(t.decimals) ||
        t.decimals < 0 ||
        t.decimals > 36
      )
        throw new Error("Invalid saved token");
      return t;
    });
  }
  static addToken(token: Token) {
    const tokens = this.getTokens().filter(
      (t) =>
        !(
          t.network === token.network &&
          sameAddress(t.network, t.address, token.address)
        ),
    );
    store(scope("tokens"), [...tokens, token]);
  }
  static removeToken(token: Token) {
    store(
      scope("tokens"),
      this.getTokens().filter(
        (t) =>
          !(
            t.network === token.network &&
            sameAddress(t.network, t.address, token.address)
          ),
      ),
    );
  }
  static getTransactions(): Transaction[] {
    return records(scope("transactions")).map((value) => {
      const t = value as Transaction;
      if (
        !t ||
        !isNetwork(t.network) ||
        t.networkId !== NETWORKS[t.network].id ||
        typeof t.hash !== "string" ||
        typeof t.from !== "string" ||
        typeof t.to !== "string" ||
        typeof t.value !== "string" ||
        !Number.isFinite(t.timestamp) ||
        ![
          "prepared",
          "pending",
          "confirmed",
          "finalized",
          "failed",
          "expired",
          "unknown",
          "replaced",
        ].includes(t.status)
      )
        throw new Error("Invalid saved transaction");
      return t;
    });
  }
  static addTransaction(tx: Transaction) {
    const txs = this.getTransactions().filter(
      (t) =>
        !(
          t.hash === tx.hash &&
          t.network === tx.network &&
          (t.tokenAddress || "").toLowerCase() ===
            (tx.tokenAddress || "").toLowerCase() &&
          (t.eventIndex ?? 0) === (tx.eventIndex ?? 0)
        ),
    );
    // Never evict unresolved transactions.
    store(scope("transactions"), [tx, ...txs]);
  }
  static mergeTransactions(transactions: Transaction[]) {
    store(
      scope("transactions"),
      mergeHistory(this.getTransactions(), transactions),
    );
  }
  static updateTransaction(tx: Transaction) {
    this.addTransaction(tx);
  }
  static unresolved(network: BlockchainNetwork, address: string) {
    return this.getTransactions().filter(
      (t) =>
        t.network === network &&
        sameAddress(network, t.from, address) &&
        ["prepared", "pending", "unknown"].includes(t.status),
    );
  }
  static async withSendLock<T>(
    network: BlockchainNetwork,
    address: string,
    action: () => Promise<T>,
  ): Promise<T> {
    if (!navigator.locks)
      throw new Error(
        "This browser needs Web Locks support to send safely. Use a current Chrome, Edge, Firefox, or Safari.",
      );
    return navigator.locks.request(
      `extrust-send:${NETWORKS[network].id}:${address}`,
      { ifAvailable: true },
      async (lock) => {
        if (!lock)
          throw new Error("Another tab is already sending from this account");
        if (!unlocked) throw new Error("Wallet is locked");
        if (this.unresolved(network, address).length)
          throw new Error(
            "Resolve the existing pending transaction before sending again",
          );
        return action();
      },
    );
  }
}
