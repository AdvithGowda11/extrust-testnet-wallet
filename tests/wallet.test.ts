import test from "node:test";
import assert from "node:assert/strict";
import { WalletService } from "../services/walletService";
import { BackupService } from "../services/backupService";
import { StorageService } from "../services/storageService";
import { validateBackup } from "../lib/backupFormat";
import { parseAmount, formatAmount } from "../lib/amounts";
import { NETWORKS, sameAddress } from "../config/networks";
import { validateRpc } from "../lib/rpcPolicy";
import { Wallet } from "ethers";
import { BlockchainService, requestJson } from "../services/blockchainService";
import { Transaction } from "../types";
const phrase =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
  clear() {
    this.data.clear();
  }
}
const local = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", { value: local });
test("hosting rate limits give recovery guidance even with an HTML response", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    new Response("<html>Too Many Requests</html>", { status: 429 }),
  );
  await assert.rejects(
    () => requestJson("/api/balance/ethereum/test"),
    /Wait one minute, then check balances or transaction status/,
  );
});
test("amounts round trip without floating point, including one wei", () => {
  for (const [s, d] of [
    ["0.000000000000000001", 18],
    ["9007199254740993.123456789", 9],
    ["0.00000001", 8],
    ["1", 0],
  ] as const)
    assert.equal(formatAmount(parseAmount(s, d), d), s);
});
test("amount parser rejects negative, exponent, NaN, whitespace and excess precision", () => {
  for (const s of [
    "-1",
    "1e3",
    "NaN",
    "Infinity",
    " 1",
    "1.0000000001",
    "1.",
    "01",
    "",
  ])
    assert.throws(() => parseAmount(s, 9));
});
test("known EVM BIP44 vector and all six distinct network identities", () => {
  const w = WalletService.createMultiChainWallet(phrase);
  assert.equal(
    w.accounts.ethereum!.address,
    "0x9858EfFD232B4033E47d90003D41EC34EcaEda94",
  );
  assert.equal(Object.keys(w.accounts).length, 6);
  assert.equal(new Set(Object.values(NETWORKS).map((n) => n.id)).size, 6);
  assert.match(w.accounts.bitcoin!.address, /^tb1q/);
  assert.equal(w.accounts.solana!.derivationPath, "m/44'/501'/0'/0'");
  WalletService.validateWallet(w);
});
test("recovery reproduces all keys, and imported accounts remain independent of mnemonic", () => {
  const a = WalletService.createMultiChainWallet(phrase),
    b = WalletService.importWallet(phrase.toUpperCase().replaceAll(" ", "\n"));
  assert.deepEqual(a.accounts, b.accounts);
  const imported = WalletService.fromPrivateKey("01".repeat(32), "solana");
  assert.equal(imported.mnemonic, undefined);
  assert.deepEqual(Object.keys(imported.accounts), ["solana"]);
  WalletService.validateWallet(imported);
});
test("wallet validation rejects mainnet, bad keys, wrong addresses and incorrect mnemonic provenance", () => {
  const w = WalletService.createMultiChainWallet(phrase);
  assert.throws(() =>
    WalletService.validateWallet({ ...w, environment: "mainnet" }),
  );
  assert.throws(() =>
    WalletService.validateWallet({
      ...w,
      accounts: {
        ethereum: { ...w.accounts.ethereum, address: "0x" + "1".repeat(40) },
      },
    }),
  );
  assert.throws(() =>
    WalletService.validateWallet({ ...w, mnemonic: undefined }),
  );
});
test("encryption authenticates entire imported-account wallet; wrong password and tamper fail", async () => {
  const w = WalletService.fromPrivateKey("01".repeat(32), "solana");
  const encrypted = await BackupService.encrypt(w, "correct test passphrase");
  assert.deepEqual(
    await BackupService.decrypt(encrypted, "correct test passphrase"),
    w,
  );
  assert.ok(!JSON.stringify(encrypted).includes(w.accounts.solana!.privateKey));
  await assert.rejects(() =>
    BackupService.decrypt(encrypted, "wrong passphrase"),
  );
  await assert.rejects(() =>
    BackupService.decrypt(
      {
        ...encrypted,
        ciphertext:
          (encrypted.ciphertext[0] === "A" ? "B" : "A") +
          encrypted.ciphertext.slice(1),
      },
      "correct test passphrase",
    ),
  );
});
test("malicious backup parameters rejected before key derivation", () => {
  assert.throws(() =>
    validateBackup({
      version: 2,
      ciphertext: "AAAA",
      salt: "A".repeat(24),
      iv: "A".repeat(16),
      kdfIterations: 1e12,
    }),
  );
});
test("vault reload requires unlock and verifies complete account data", async () => {
  local.clear();
  const w = WalletService.createMultiChainWallet(phrase);
  await StorageService.saveWallet(w, "correct test passphrase");
  StorageService.lock();
  assert.equal(StorageService.getWallet(), null);
  await assert.rejects(() => StorageService.unlock("incorrect"));
  assert.equal(StorageService.getWallet(), null);
  await StorageService.unlock("correct test passphrase");
  assert.deepEqual(StorageService.getWallet(), w);
  assert.ok(!StorageService.encryptedVault().includes(phrase));
});
test("legacy archive preserves exact bytes before plaintext removal", async () => {
  local.clear();
  const original =
    '{"mnemonic":"legacy value","accounts":{"preserve":"exact"}}';
  local.setItem("trust_wallet_data", original);
  await StorageService.archiveLegacy("correct archive passphrase");
  assert.equal(local.getItem("trust_wallet_data"), null);
  const restored = (await BackupService.decrypt(
    JSON.parse(StorageService.legacyArchive()!),
    "correct archive passphrase",
  )) as any;
  assert.equal(restored.original, original);
});
test("EVM addresses ignore case; Solana addresses do not", () => {
  assert.equal(sameAddress("ethereum", "0xAbC", "0xabc"), true);
  assert.equal(sameAddress("solana", "AbC", "abc"), false);
});
test("RPC policy rejects signing methods, mainnet signed broadcasts and oversized batches", async () => {
  assert.throws(() =>
    validateRpc("ethereum", {
      jsonrpc: "2.0",
      method: "personal_unlockAccount",
      params: [],
    }),
  );
  assert.throws(() =>
    validateRpc(
      "ethereum",
      Array(11).fill({ jsonrpc: "2.0", method: "eth_chainId", params: [] }),
    ),
  );
  const w = new Wallet("0x" + "01".repeat(32));
  const tx = await w.signTransaction({
    to: "0x" + "02".repeat(20),
    value: 1n,
    chainId: 1,
    gasLimit: 21000,
    gasPrice: 1,
  });
  assert.throws(() =>
    validateRpc("ethereum", {
      jsonrpc: "2.0",
      method: "eth_sendRawTransaction",
      params: [tx],
    }),
  );
  const good = await w.signTransaction({
    to: "0x" + "02".repeat(20),
    value: 1n,
    chainId: 11155111,
    gasLimit: 21000,
    gasPrice: 1,
  });
  assert.equal(
    validateRpc("ethereum", {
      jsonrpc: "2.0",
      method: "eth_sendRawTransaction",
      params: [good],
    }).length,
    1,
  );
});

test("public journal preserves separate events and token records under the same hash", async () => {
  local.clear();
  await StorageService.saveWallet(
    WalletService.createMultiChainWallet(phrase),
    "correct test passphrase",
  );
  const tx = {
    hash: "signature",
    network: "solana" as const,
    networkId: NETWORKS.solana.id,
    from: "A",
    to: "B",
    value: "1",
    timestamp: 1,
    status: "confirmed" as const,
    type: "receive" as const,
  };
  StorageService.addTransaction(tx);
  StorageService.addTransaction({ ...tx, eventIndex: 1, value: "2" });
  StorageService.updateTransaction({ ...tx, value: "3" });
  assert.equal(StorageService.getTransactions().length, 2);
  assert.deepEqual(
    StorageService.getTransactions()
      .map((t) => t.value)
      .sort(),
    ["2", "3"],
  );
});

test("storage failure does not replace the active encrypted wallet", async () => {
  const original = StorageService.encryptedVault();
  const setItem = local.setItem;
  local.setItem = () => {
    throw new Error("QuotaExceededError");
  };
  try {
    await assert.rejects(
      () =>
        StorageService.saveWallet(
          WalletService.fromPrivateKey("02".repeat(32), "solana"),
          "correct test passphrase",
        ),
      /QuotaExceeded/,
    );
    assert.equal(StorageService.encryptedVault(), original);
  } finally {
    local.setItem = setItem;
  }
});

test("uncertain broadcast retains exact signed bytes and retries the same transaction", async () => {
  const record: Transaction = {
    hash: "hash",
    network: "ethereum",
    networkId: NETWORKS.ethereum.id,
    from: "A",
    to: "B",
    value: "1",
    timestamp: 1,
    status: "prepared",
    type: "send",
    signedTransaction: "signed-bytes",
  };
  const original = BlockchainService.provider;
  const sent: string[] = [];
  let failed = true;
  BlockchainService.provider = (() => ({
    send: async (_method: string, args: string[]) => {
      sent.push(args[0]);
      if (failed) throw new Error("response lost");
      return record.hash;
    },
  })) as unknown as typeof original;
  try {
    const unknown = await BlockchainService.broadcast(record);
    assert.equal(unknown.status, "unknown");
    assert.equal(unknown.signedTransaction, record.signedTransaction);
    assert.equal(
      StorageService.getTransactions().find((t) => t.hash === record.hash)
        ?.status,
      "unknown",
    );
    failed = false;
    const pending = await BlockchainService.broadcast(unknown);
    assert.equal(pending.status, "pending");
    assert.deepEqual(sent, ["signed-bytes", "signed-bytes"]);
  } finally {
    BlockchainService.provider = original;
  }
});

test("Solana absence becomes expired only beyond its last valid finalized height", async () => {
  const original = BlockchainService.solana;
  let height = 100;
  BlockchainService.solana = (() => ({
    getSignatureStatuses: async () => ({ value: [null] }),
    getBlockHeight: async () => height,
  })) as unknown as typeof original;
  const record: Transaction = {
    hash: "sig",
    network: "solana",
    networkId: NETWORKS.solana.id,
    from: "A",
    to: "B",
    value: "1",
    timestamp: 1,
    status: "unknown",
    type: "send",
    lastValidBlockHeight: 100,
  };
  try {
    assert.equal((await BlockchainService.reconcile(record)).status, "unknown");
    height = 101;
    assert.equal((await BlockchainService.reconcile(record)).status, "expired");
  } finally {
    BlockchainService.solana = original;
  }
});
