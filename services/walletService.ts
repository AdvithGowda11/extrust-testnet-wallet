import { Buffer } from "buffer";
import * as bip39 from "bip39";
import { HDNodeWallet, Wallet } from "ethers";
import { Keypair } from "@solana/web3.js";
import { HDKey } from "micro-key-producer/slip10.js";
import * as bitcoin from "bitcoinjs-lib";
import { BIP32Factory } from "bip32";
import * as ecc from "tiny-secp256k1";
import { ECPairFactory } from "ecpair";
import bs58 from "bs58";
import { MultiChainWallet, WalletAccount, BlockchainNetwork } from "@/types";
import { CHAINS, EVM_NETWORKS, isEVM } from "@/config/networks";
const bip32 = BIP32Factory(ecc);
export const ECPair = ECPairFactory(ecc);
export class WalletService {
  static generateMnemonic() {
    return bip39.generateMnemonic(128);
  }
  static normalizeMnemonic(value: string) {
    return value.normalize("NFKD").trim().toLowerCase().split(/\s+/).join(" ");
  }
  static validateMnemonic(value: string) {
    return bip39.validateMnemonic(this.normalizeMnemonic(value));
  }
  static recoveryPhraseIssue(value: string): string | null {
    const normalized = this.normalizeMnemonic(value);
    const words = normalized ? normalized.split(" ") : [];
    if (![12, 15, 18, 21, 24].includes(words.length))
      return `Invalid recovery phrase. Enter 12, 15, 18, 21, or 24 words separated by spaces; found ${words.length}.`;
    const invalidPositions = words.flatMap((word, index) =>
      bip39.wordlists.english.includes(word) ? [] : [index + 1],
    );
    if (invalidPositions.length)
      return `Invalid recovery phrase. Check the spelling of word positions ${invalidPositions.join(", ")} against your original backup.`;
    if (!bip39.validateMnemonic(normalized, bip39.wordlists.english))
      return "Invalid recovery phrase. All words are recognized, but the checksum does not match. Check the original order and spelling.";
    return null;
  }
  static importAccount(
    privateKey: string,
    network: BlockchainNetwork,
  ): WalletAccount {
    privateKey = privateKey.trim();
    if (isEVM(network)) {
      if (!/^(0x)?[a-fA-F0-9]{64}$/.test(privateKey))
        throw new Error("Expected a 32-byte EVM private key");
      const key = new Wallet(
        privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`,
      );
      return {
        network,
        address: key.address,
        privateKey: key.privateKey,
        origin: "private-key",
      };
    }
    if (network === "solana") {
      const raw = /^[a-fA-F0-9]{64}([a-fA-F0-9]{64})?$/.test(privateKey)
        ? Buffer.from(privateKey, "hex")
        : bs58.decode(privateKey);
      if (raw.length !== 32 && raw.length !== 64)
        throw new Error("Expected a Solana seed or 64-byte secret key");
      const key =
        raw.length === 32 ? Keypair.fromSeed(raw) : Keypair.fromSecretKey(raw);
      return {
        network,
        address: key.publicKey.toBase58(),
        privateKey: Buffer.from(key.secretKey).toString("hex"),
        origin: "private-key",
      };
    }
    const key = /^[a-fA-F0-9]{64}$/.test(privateKey)
      ? ECPair.fromPrivateKey(Buffer.from(privateKey, "hex"), {
          network: bitcoin.networks.testnet,
        })
      : ECPair.fromWIF(privateKey, bitcoin.networks.testnet);
    if (!key.compressed)
      throw new Error(
        "Uncompressed Bitcoin keys cannot be imported into this SegWit account",
      );
    return {
      network,
      address: bitcoin.payments.p2wpkh({
        pubkey: key.publicKey,
        network: bitcoin.networks.testnet,
      }).address!,
      privateKey: key.toWIF(),
      origin: "private-key",
      addressType: "p2wpkh",
    };
  }
  static createMultiChainWallet(
    phrase = this.generateMnemonic(),
  ): MultiChainWallet {
    const mnemonic = this.normalizeMnemonic(phrase);
    if (!this.validateMnemonic(mnemonic))
      throw new Error("Invalid recovery phrase");
    const accounts: MultiChainWallet["accounts"] = {};
    const evmPath = "m/44'/60'/0'/0/0";
    const evmKey = HDNodeWallet.fromPhrase(mnemonic, undefined, evmPath);
    for (const network of EVM_NETWORKS)
      accounts[network] = {
        ...this.importAccount(evmKey.privateKey, network),
        origin: "mnemonic",
        derivationPath: evmPath,
      };
    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const solPath = "m/44'/501'/0'/0'";
    const solKey = HDKey.fromMasterSeed(seed).derive(solPath).privateKey;
    accounts.solana = {
      ...this.importAccount(Buffer.from(solKey).toString("hex"), "solana"),
      origin: "mnemonic",
      derivationPath: solPath,
    };
    const btcPath = "m/84'/1'/0'/0/0";
    const btcKey = bip32
      .fromSeed(seed, bitcoin.networks.testnet)
      .derivePath(btcPath);
    accounts.bitcoin = {
      ...this.importAccount(btcKey.toWIF(), "bitcoin"),
      origin: "mnemonic",
      derivationPath: btcPath,
    };
    return {
      version: 2,
      environment: "testnet",
      mnemonic,
      accounts,
      createdAt: Date.now(),
    };
  }
  static importWallet(mnemonic: string) {
    return this.createMultiChainWallet(mnemonic);
  }
  static fromPrivateKey(
    value: string,
    network: BlockchainNetwork,
  ): MultiChainWallet {
    const account = this.importAccount(value, network);
    const accounts: MultiChainWallet["accounts"] = {};
    for (const n of isEVM(network) ? EVM_NETWORKS : [network])
      accounts[n] = { ...account, network: n };
    return {
      version: 2,
      environment: "testnet",
      accounts,
      createdAt: Date.now(),
    };
  }
  static validateWallet(value: unknown): asserts value is MultiChainWallet {
    const w = value as MultiChainWallet;
    if (
      !w ||
      w.version !== 2 ||
      w.environment !== "testnet" ||
      !w.accounts ||
      !Number.isSafeInteger(w.createdAt) ||
      w.createdAt <= 0 ||
      !Object.keys(w.accounts).length
    )
      throw new Error(
        "Unsupported wallet format. Legacy wallets must be archived without changing their keys.",
      );
    if (
      w.mnemonic !== undefined &&
      (typeof w.mnemonic !== "string" || !this.validateMnemonic(w.mnemonic))
    )
      throw new Error("Invalid wallet recovery phrase");
    const derived = w.mnemonic ? this.createMultiChainWallet(w.mnemonic) : null;
    for (const [name, a] of Object.entries(w.accounts)) {
      if (
        !CHAINS.includes(name as BlockchainNetwork) ||
        !a ||
        a.network !== name ||
        typeof a.privateKey !== "string" ||
        !["mnemonic", "private-key"].includes(a.origin)
      )
        throw new Error("Invalid wallet account");
      const actual = this.importAccount(a.privateKey, a.network);
      if (
        actual.address !== a.address ||
        (a.network === "bitcoin" && a.addressType !== "p2wpkh")
      )
        throw new Error("Wallet address and private key do not match");
      if (
        a.origin === "mnemonic" &&
        (!derived ||
          derived.accounts[a.network]?.address !== a.address ||
          derived.accounts[a.network]?.derivationPath !== a.derivationPath)
      )
        throw new Error("Recovery phrase does not match account");
    }
  }
}
