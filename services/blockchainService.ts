import { Buffer } from "buffer";
import {
  Contract,
  JsonRpcProvider,
  Wallet,
  Transaction as EvmTransaction,
  TransactionRequest,
  Interface,
  getAddress,
  keccak256,
} from "ethers";
import {
  Connection,
  PublicKey,
  Keypair,
  Transaction as SolTransaction,
  SystemProgram,
} from "@solana/web3.js";
import * as bitcoin from "bitcoinjs-lib";
import bs58 from "bs58";
import * as ecc from "tiny-secp256k1";
import {
  BlockchainNetwork,
  SendTransactionParams,
  TransferQuote,
  Transaction,
  Token,
} from "@/types";
import { NETWORKS, apiBaseUrl, isEVM, sameAddress } from "@/config/networks";
import { parseAmount, formatAmount } from "@/lib/amounts";
import { BitcoinPlan, Utxo, selectCoins, createPsbt } from "@/lib/bitcoin";
import { ECPair } from "@/services/walletService";
import { StorageService } from "@/services/storageService";
import { tokenTransfer, transferTopic, addressTopic } from "@/lib/tokenHistory";
const ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address,uint256) returns (bool)",
];
const providers = new Map<BlockchainNetwork, JsonRpcProvider>();
export async function requestJson(
  path: string,
  init?: RequestInit,
): Promise<any> {
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(25000),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || "Network request failed");
  return json;
}
export async function btc(action: string, query: Record<string, string> = {}) {
  return (
    await requestJson(
      `/api/bitcoin?${new URLSearchParams({ action, ...query })}`,
    )
  ).data;
}
export function validateAddress(
  address: string,
  network: BlockchainNetwork,
): string {
  if (address !== address.trim() || address.length > 100)
    throw new Error("Invalid recipient address");
  if (isEVM(network)) {
    const a = getAddress(address);
    if (/^0x0{40}$/i.test(a))
      throw new Error("Zero address is not a recipient");
    return a;
  }
  if (network === "solana") {
    const key = new PublicKey(address);
    if (!PublicKey.isOnCurve(key.toBytes()))
      throw new Error("Use a regular Solana wallet address");
    return key.toBase58();
  }
  bitcoin.address.toOutputScript(address, bitcoin.networks.testnet);
  return address;
}
interface SolPayload {
  transaction: SolTransaction;
  lastValidBlockHeight: number;
}
interface BtcPayload {
  plan: BitcoinPlan;
  psbt: bitcoin.Psbt;
}
export class BlockchainService {
  static provider(network: BlockchainNetwork) {
    if (!isEVM(network)) throw new Error("Expected an EVM test network");
    let provider = providers.get(network);
    if (!provider) {
      provider = new JsonRpcProvider(
        `${apiBaseUrl()}${NETWORKS[network].rpcUrl}`,
        NETWORKS[network].chainId,
        { batchMaxCount: 10, cacheTimeout: -1 },
      );
      providers.set(network, provider);
    }
    return provider;
  }
  static solana() {
    return new Connection(`${apiBaseUrl()}${NETWORKS.solana.rpcUrl}`, {
      commitment: "confirmed",
      disableRetryOnRateLimit: true,
    });
  }
  static async getBalance(
    address: string,
    network: BlockchainNetwork,
  ): Promise<{ balance: string; pending: string }> {
    return requestJson(
      `/api/balance/${network}/${encodeURIComponent(address)}`,
    );
  }
  static async getTokenMetadata(
    address: string,
    network: BlockchainNetwork,
  ): Promise<Omit<Token, "network" | "address">> {
    if (!isEVM(network))
      throw new Error("Custom tokens require an EVM network");
    const token = new Contract(
      getAddress(address),
      ABI,
      this.provider(network),
    );
    const [name, symbol, rawDecimals] = await Promise.all([
      token.name(),
      token.symbol(),
      token.decimals(),
    ]);
    const decimals = Number(rawDecimals);
    if (
      !Number.isInteger(decimals) ||
      decimals < 0 ||
      decimals > 36 ||
      typeof symbol !== "string" ||
      symbol.length > 32 ||
      typeof name !== "string" ||
      name.length > 120
    )
      throw new Error("Unsupported token metadata");
    return { name, symbol, decimals };
  }
  static async getTokenBalance(
    address: string,
    owner: string,
    network: BlockchainNetwork,
  ) {
    const token = new Contract(
      getAddress(address),
      ABI,
      this.provider(network),
    );
    const [balance, rawDecimals] = await Promise.all([
      token.balanceOf(getAddress(owner)),
      token.decimals(),
    ]);
    const decimals = Number(rawDecimals);
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36)
      throw new Error("Unsupported token precision");
    return { balance: formatAmount(balance, decimals), decimals };
  }
  static async prepare(
    input: Omit<SendTransactionParams, "privateKey">,
    max = false,
  ): Promise<TransferQuote> {
    const params = {
      ...input,
      to: validateAddress(input.to, input.network),
      from: validateAddress(input.from, input.network),
    };
    if (sameAddress(params.network, params.to, params.from))
      throw new Error("Choose a different recipient for the transfer");
    let symbol = NETWORKS[params.network].symbol;
    if (isEVM(params.network)) {
      const provider = this.provider(params.network);
      if (
        (await provider.getNetwork()).chainId !==
        BigInt(NETWORKS[params.network].chainId!)
      )
        throw new Error("Wrong RPC network");
      const [balance, fees, nonce] = await Promise.all([
        provider.getBalance(params.from, "pending"),
        provider.getFeeData(),
        provider.getTransactionCount(params.from, "pending"),
      ]);
      let decimals = 18,
        value = 0n,
        data = "0x",
        to = params.to;
      if (params.tokenAddress) {
        const metadata = await this.getTokenMetadata(
          params.tokenAddress,
          params.network,
        );
        decimals = metadata.decimals;
        symbol = metadata.symbol;
        const tokenBalance = await this.getTokenBalance(
          params.tokenAddress,
          params.from,
          params.network,
        );
        value = max
          ? parseAmount(tokenBalance.balance, decimals)
          : parseAmount(params.amount, decimals);
        if (value > parseAmount(tokenBalance.balance, decimals))
          throw new Error("Insufficient token balance");
        data = new Interface(ABI).encodeFunctionData("transfer", [
          params.to,
          value,
        ]);
        to = getAddress(params.tokenAddress);
      } else value = max ? 1n : parseAmount(params.amount, 18);
      if (value <= 0n) throw new Error("Amount must be greater than zero");
      const request: TransactionRequest = {
        to,
        data,
        value: params.tokenAddress ? 0n : value,
        from: params.from,
      };
      const gasLimit = ((await provider.estimateGas(request)) * 120n) / 100n;
      const price = fees.maxFeePerGas ?? fees.gasPrice;
      if (price === null || price <= 0n) throw new Error("Fee unavailable");
      const tx: TransactionRequest = {
        ...request,
        gasLimit,
        nonce,
        chainId: NETWORKS[params.network].chainId,
        ...(fees.maxFeePerGas !== null
          ? {
              type: 2,
              maxFeePerGas: fees.maxFeePerGas,
              maxPriorityFeePerGas: fees.maxPriorityFeePerGas ?? 0n,
            }
          : { type: 0, gasPrice: price }),
      };
      let reserve = gasLimit * price;
      if (params.network === "base") {
        const oracle = new Contract(
          "0x420000000000000000000000000000000000000F",
          [
            "function getL1FeeUpperBound(uint256) view returns(uint256)",
            "function getOperatorFee(uint256) view returns(uint256)",
          ],
          provider,
        );
        const serializable = { ...tx };
        delete serializable.from;
        // An additional 32 bytes covers the larger native value when using Max.
        const size =
          (EvmTransaction.from(serializable as any).unsignedSerialized.length -
            2) /
            2 +
          32;
        const [l1, operator] = await Promise.all([
          oracle.getL1FeeUpperBound(size),
          oracle.getOperatorFee(gasLimit),
        ]);
        reserve += ((l1 + operator) * 120n) / 100n;
      }
      if (max && !params.tokenAddress) {
        value = balance - reserve;
        tx.value = value;
      }
      if (value <= 0n || balance < reserve + (params.tokenAddress ? 0n : value))
        throw new Error("Insufficient native balance for amount and fee");
      // Check the final value (Max can change recipient execution behavior).
      if ((await provider.estimateGas({ ...tx, from: params.from })) > gasLimit)
        throw new Error("Fee changed. Review the transfer again.");
      params.amount = formatAmount(value, decimals);
      return {
        params,
        amount: params.amount,
        fee: formatAmount(reserve, 18),
        symbol,
        createdAt: Date.now(),
        payload: tx,
      };
    }
    if (params.tokenAddress)
      throw new Error("Only native SOL and BTC are supported");
    if (params.network === "solana") {
      const connection = this.solana();
      const [balance, latest, recipient] = await Promise.all([
        connection.getBalance(new PublicKey(params.from)),
        connection.getLatestBlockhash(),
        connection.getAccountInfo(new PublicKey(params.to)),
      ]);
      if (!Number.isSafeInteger(balance) || balance < 0)
        throw new Error(
          "RPC returned a SOL balance outside the safe integer range",
        );
      let amount = max ? 1n : parseAmount(params.amount, 9);
      const build = (lamports: bigint) =>
        new SolTransaction({
          feePayer: new PublicKey(params.from),
          recentBlockhash: latest.blockhash,
        }).add(
          SystemProgram.transfer({
            fromPubkey: new PublicKey(params.from),
            toPubkey: new PublicKey(params.to),
            lamports,
          }),
        );
      const fee = (
        await connection.getFeeForMessage(build(amount).compileMessage())
      ).value;
      if (fee === null || !Number.isSafeInteger(fee) || fee < 0)
        throw new Error("Fee unavailable. Try again.");
      if (max) amount = BigInt(balance) - BigInt(fee);
      if (
        amount <= 0n ||
        amount > BigInt(Number.MAX_SAFE_INTEGER) ||
        BigInt(balance) < amount + BigInt(fee)
      )
        throw new Error("Insufficient SOL for amount and fee");
      if (
        !recipient &&
        amount < BigInt(await connection.getMinimumBalanceForRentExemption(0))
      )
        throw new Error(
          "A new Solana recipient needs enough SOL for its minimum account balance",
        );
      params.amount = formatAmount(amount, 9);
      return {
        params,
        amount: params.amount,
        fee: formatAmount(BigInt(fee), 9),
        symbol,
        createdAt: Date.now(),
        payload: {
          transaction: build(amount),
          lastValidBlockHeight: latest.lastValidBlockHeight,
        } satisfies SolPayload,
      };
    }
    const [utxos, fees] = await Promise.all([
      btc("utxos", { address: params.from }),
      btc("fees"),
    ]);
    const plan = selectCoins(
      utxos as Utxo[],
      params.from,
      params.to,
      max ? 0n : parseAmount(params.amount, 8),
      Math.max(1, fees.hourFee),
      max,
    );
    const previous: Record<string, string> = {};
    for (const u of plan.inputs)
      if (!previous[u.txid])
        previous[u.txid] = await btc("hex", { txid: u.txid });
    params.amount = formatAmount(BigInt(plan.amount), 8);
    return {
      params,
      amount: params.amount,
      fee: formatAmount(BigInt(plan.fee), 8),
      symbol,
      createdAt: Date.now(),
      payload: { plan, psbt: createPsbt(plan, previous) } satisfies BtcPayload,
    };
  }
  static async send(
    quote: TransferQuote,
    privateKey: string,
  ): Promise<Transaction> {
    const { params } = quote;
    return StorageService.withSendLock(
      params.network,
      params.from,
      async () => {
        if (Date.now() - quote.createdAt > 45000)
          throw new Error("Review expired. Get a fresh fee estimate.");
        let raw: string, hash: string;
        const extra: Partial<Transaction> = {};
        if (isEVM(params.network)) {
          const wallet = new Wallet(privateKey);
          if (!sameAddress(params.network, wallet.address, params.from))
            throw new Error("Signing account changed");
          const tx = { ...(quote.payload as TransactionRequest) };
          delete tx.from;
          const provider = this.provider(params.network);
          if (
            (await provider.getTransactionCount(params.from, "pending")) !==
            tx.nonce
          )
            throw new Error("Account nonce changed. Review again.");
          raw = await wallet.signTransaction(tx);
          hash = keccak256(raw);
          extra.nonce = Number(tx.nonce);
          extra.startBlock = await provider.getBlockNumber();
        } else if (params.network === "solana") {
          const payload = quote.payload as SolPayload;
          const key = Keypair.fromSecretKey(Buffer.from(privateKey, "hex"));
          if (key.publicKey.toBase58() !== params.from)
            throw new Error("Signing account changed");
          if (
            (await this.solana().getBlockHeight()) >
            payload.lastValidBlockHeight
          )
            throw new Error("Blockhash expired. Review again.");
          payload.transaction.sign(key);
          raw = payload.transaction.serialize().toString("base64");
          hash = bs58.encode(payload.transaction.signature!);
          extra.lastValidBlockHeight = payload.lastValidBlockHeight;
        } else {
          const { plan, psbt } = quote.payload as BtcPayload;
          const available: Utxo[] = await btc("utxos", {
            address: params.from,
          });
          if (
            plan.inputs.some(
              (u) =>
                !available.some(
                  (v) =>
                    u.txid === v.txid &&
                    u.vout === v.vout &&
                    v.status.confirmed,
                ),
            )
          )
            throw new Error("Bitcoin inputs changed. Review again.");
          const key = ECPair.fromWIF(privateKey, bitcoin.networks.testnet);
          psbt.signAllInputs(key);
          if (
            !psbt.validateSignaturesOfAllInputs((pubkey, hash, sig) =>
              ecc.verify(hash, pubkey, sig),
            )
          )
            throw new Error("Bitcoin signature verification failed");
          psbt.finalizeAllInputs();
          const tx = psbt.extractTransaction();
          if (
            psbt.getFee() < BigInt(Math.ceil(tx.virtualSize() * plan.feeRate))
          )
            throw new Error("Fee estimate is too low. Review again.");
          raw = tx.toHex();
          hash = tx.getId();
          extra.inputIds = plan.inputs.map((u) => `${u.txid}:${u.vout}`);
        }
        const record: Transaction = {
          hash,
          from: params.from,
          to: params.to,
          value: quote.amount,
          network: params.network,
          networkId: NETWORKS[params.network].id,
          timestamp: Date.now(),
          status: "prepared",
          type: "send",
          tokenSymbol: quote.symbol,
          tokenAddress: params.tokenAddress,
          signedTransaction: raw,
          ...extra,
        };
        // Persist the signed public transaction before any network side effect.
        StorageService.addTransaction(record);
        return this.broadcast(record);
      },
    );
  }
  static async broadcast(record: Transaction) {
    if (!record.signedTransaction)
      throw new Error("No signed transaction to rebroadcast");
    try {
      let hash: string;
      if (isEVM(record.network))
        hash = await this.provider(record.network).send(
          "eth_sendRawTransaction",
          [record.signedTransaction],
        );
      else if (record.network === "solana")
        hash = await this.solana().sendRawTransaction(
          Buffer.from(record.signedTransaction, "base64"),
          { skipPreflight: false, maxRetries: 2 },
        );
      else
        hash = (
          await requestJson("/api/bitcoin", {
            method: "POST",
            headers: { "Content-Type": "text/plain" },
            body: record.signedTransaction,
          })
        ).hash;
      if (hash !== record.hash) throw new Error("Unexpected transaction hash");
      record = { ...record, status: "pending", error: undefined };
    } catch {
      record = {
        ...record,
        status: "unknown",
        error:
          "Broadcast outcome is uncertain. Check status or rebroadcast this same signed transaction; do not create a duplicate.",
      };
    }
    StorageService.updateTransaction(record);
    return record;
  }
  static async reconcile(record: Transaction): Promise<Transaction> {
    let result = { ...record };
    if (isEVM(record.network)) {
      const provider = this.provider(record.network),
        receipt = await provider.getTransactionReceipt(record.hash);
      if (receipt) {
        const confirmations = await receipt.confirmations();
        const raw = await provider.send("eth_getTransactionReceipt", [
          record.hash,
        ]);
        const extraFee =
          BigInt(raw.l1Fee || "0x0") + BigInt(raw.operatorFee || "0x0");
        result = {
          ...result,
          status: receipt.status === 1 ? "confirmed" : "failed",
          fee: formatAmount(receipt.gasUsed * receipt.gasPrice + extraFee, 18),
          confirmations,
          error: undefined,
        };
      } else if (
        record.nonce !== undefined &&
        (await provider.getTransactionCount(record.from, "latest")) >
          record.nonce
      )
        result.status = "replaced";
      else if (await provider.getTransaction(record.hash))
        result.status = "pending";
    } else if (record.network === "solana") {
      const connection = this.solana();
      const value = (
        await connection.getSignatureStatuses([record.hash], {
          searchTransactionHistory: true,
        })
      ).value[0];
      if (value)
        result = {
          ...result,
          status: value.err
            ? "failed"
            : value.confirmationStatus === "finalized"
              ? "finalized"
              : value.confirmationStatus === "confirmed"
                ? "confirmed"
                : "pending",
          error: undefined,
        };
      else if (
        record.lastValidBlockHeight &&
        (await connection.getBlockHeight("finalized")) >
          record.lastValidBlockHeight
      )
        result.status = "expired";
      if (["confirmed", "finalized", "failed"].includes(result.status)) {
        const tx = await connection.getTransaction(record.hash, {
          maxSupportedTransactionVersion: 0,
          commitment: "confirmed",
        });
        if (tx?.meta) result.fee = formatAmount(BigInt(tx.meta.fee), 9);
      }
    } else {
      const tx = await btc("tx", { txid: record.hash });
      result = {
        ...result,
        status: tx.status.confirmed ? "confirmed" : "pending",
        fee: formatAmount(BigInt(tx.fee), 8),
        confirmations: tx.status.confirmed
          ? Number(await btc("height")) - tx.status.block_height + 1
          : 0,
        error: undefined,
      };
    }
    if (!["prepared", "unknown"].includes(result.status)) delete result.error;
    return result;
  }
  static async getTokenHistory(owner: string, token: Token, endBlock?: number) {
    const provider = this.provider(token.network);
    const tip = await provider.getBlockNumber();
    const end = endBlock ?? tip;
    if (!Number.isSafeInteger(end) || end < 0 || end > tip)
      throw new Error("Invalid token history cursor");
    const start = Math.max(0, end - 1999);
    const filters = [
      [transferTopic, addressTopic(owner)],
      [transferTopic, null, addressTopic(owner)],
    ];
    const pages = await Promise.all(
      filters.map((topics) =>
        provider.getLogs({
          address: token.address,
          fromBlock: start,
          toBlock: end,
          topics,
        }),
      ),
    );
    const logs = [
      ...new Map(
        pages.flat().map((log) => [`${log.transactionHash}:${log.index}`, log]),
      ).values(),
    ];
    if (logs.length > 1000)
      throw new Error(
        "Too many token events in this range. Use the explorer for this account.",
      );
    const blocks = new Map<number, number>();
    const transactions: Transaction[] = [];
    for (const log of logs) {
      if (!blocks.has(log.blockNumber)) {
        const block = await provider.getBlock(log.blockNumber);
        if (!block) throw new Error("Token history block is unavailable");
        blocks.set(log.blockNumber, block.timestamp * 1000);
      }
      const tx = tokenTransfer(log, token, owner, blocks.get(log.blockNumber)!);
      if (tx) transactions.push(tx);
    }
    return { transactions, nextBlock: start ? start - 1 : undefined };
  }
  static async getTransactionHistory(
    address: string,
    network: BlockchainNetwork,
    cursor = "",
  ) {
    return requestJson(
      `/api/tx-history/${network}/${encodeURIComponent(address)}?${new URLSearchParams({ cursor })}`,
    ) as Promise<{
      transactions: Transaction[];
      nextCursor?: string;
      notice?: string;
    }>;
  }
}
