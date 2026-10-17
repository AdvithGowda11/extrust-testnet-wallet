// These are explicitly SIMULATED network tests. Transactions are really signed
// and decoded, but no faucet, public RPC, or public chain is used.
import { test, expect, BrowserContext, Page } from "@playwright/test";
import { Transaction as EvmTransaction } from "ethers";
import {
  Transaction as SolTransaction,
  SystemInstruction,
} from "@solana/web3.js";
import * as bitcoin from "bitcoinjs-lib";
import bs58 from "bs58";
import { Buffer } from "node:buffer";
import { NETWORKS, CHAINS } from "../../config/networks";
import { formatAmount } from "../../lib/amounts";
import { BlockchainNetwork, Transaction } from "../../types";
import { createWallet } from "./helpers";
const hash = "0x" + "ab".repeat(32);
const hex = (n: bigint | number) => `0x${BigInt(n).toString(16)}`;
class SimulatedNetwork {
  balances = new Map<string, bigint>();
  nonces = new Map<string, number>();
  records: Transaction[] = [];
  evm = new Map<string, EvmTransaction>();
  sol = new Map<string, SolTransaction>();
  bitcoins = new Map<string, bitcoin.Transaction>();
  spent = new Set<string>();
  key(n: string, a: string) {
    return `${n}:${n === "solana" || n === "bitcoin" ? a : a.toLowerCase()}`;
  }
  balance(n: BlockchainNetwork, a: string) {
    const k = this.key(n, a);
    if (!this.balances.has(k))
      this.balances.set(k, 10n * 10n ** BigInt(NETWORKS[n].decimals));
    return this.balances.get(k)!;
  }
  add(
    n: BlockchainNetwork,
    from: string,
    to: string,
    value: bigint,
    fee: bigint,
    txHash: string,
  ) {
    this.balances.set(this.key(n, from), this.balance(n, from) - value - fee);
    this.balances.set(this.key(n, to), this.balance(n, to) + value);
    this.records.push({
      network: n,
      networkId: NETWORKS[n].id,
      hash: txHash,
      from,
      to,
      value: formatAmount(value, NETWORKS[n].decimals),
      fee: formatAmount(fee, NETWORKS[n].decimals),
      status: "confirmed",
      timestamp: Date.now(),
      type: "send",
    });
  }
  funding(address: string) {
    const exists = [...this.bitcoins.values()].some((t) =>
      t.outs.some((o) => {
        try {
          return (
            bitcoin.address.fromOutputScript(
              o.script,
              bitcoin.networks.testnet,
            ) === address
          );
        } catch {
          return false;
        }
      }),
    );
    if (!exists) {
      const t = new bitcoin.Transaction();
      t.addInput(new Uint8Array(32).fill(this.bitcoins.size + 1), 0);
      t.addOutput(
        bitcoin.address.toOutputScript(address, bitcoin.networks.testnet),
        1000000000n,
      );
      this.bitcoins.set(t.getId(), t);
    }
  }
  async routes(context: BrowserContext) {
    await context.route("**/api/**", async (route) => {
      try {
        const req = route.request(),
          url = new URL(req.url()),
          path = url.pathname;
        let result: any;
        if (path.startsWith("/api/balance/")) {
          const [, , , n, a] = path.split("/");
          result = {
            balance: formatAmount(
              this.balance(n as BlockchainNetwork, a),
              NETWORKS[n as BlockchainNetwork].decimals,
            ),
            pending: "0",
          };
        } else if (path.startsWith("/api/tx-history/")) {
          const [, , , n, a] = path.split("/");
          result = {
            transactions: this.records
              .filter(
                (t) =>
                  t.network === n &&
                  (this.key(n, t.from) === this.key(n, a) ||
                    this.key(n, t.to) === this.key(n, a)),
              )
              .map((t) => ({
                ...t,
                type:
                  this.key(n, t.from) === this.key(n, a) ? "send" : "receive",
              })),
          };
        } else if (path.startsWith("/api/rpc/")) {
          const n = path.split("/").at(-1) as BlockchainNetwork;
          const body = req.postDataJSON();
          const run = (call: any) => ({
            jsonrpc: "2.0",
            id: call.id,
            result: this.rpc(n, call.method, call.params),
          });
          result = Array.isArray(body) ? body.map(run) : run(body);
        } else if (path === "/api/bitcoin") {
          const q = url.searchParams,
            a = q.get("address") || "",
            id = q.get("txid") || "";
          if (req.method() === "POST") {
            const t = bitcoin.Transaction.fromHex(req.postData()!);
            const input = t.ins[0];
            const prevId = Buffer.from(input.hash).reverse().toString("hex");
            const prev = this.bitcoins.get(prevId)!;
            const from = bitcoin.address.fromOutputScript(
              prev.outs[input.index].script,
              bitcoin.networks.testnet,
            );
            const to = bitcoin.address.fromOutputScript(
              t.outs[0].script,
              bitcoin.networks.testnet,
            );
            const inputSum = t.ins.reduce((sum, i) => {
              const tid = Buffer.from(i.hash).reverse().toString("hex");
              this.spent.add(`${tid}:${i.index}`);
              return sum + this.bitcoins.get(tid)!.outs[i.index].value;
            }, 0n);
            const fee = inputSum - t.outs.reduce((s, o) => s + o.value, 0n);
            this.bitcoins.set(t.getId(), t);
            this.add("bitcoin", from, to, t.outs[0].value, fee, t.getId());
            result = { hash: t.getId() };
          } else {
            let data: any;
            switch (q.get("action")) {
              case "fees":
                data = { hourFee: 1 };
                break;
              case "height":
                data = "101";
                break;
              case "utxos":
                this.funding(a);
                data = [...this.bitcoins.values()].flatMap((t) =>
                  t.outs.flatMap((o, index) =>
                    bitcoin.address.fromOutputScript(
                      o.script,
                      bitcoin.networks.testnet,
                    ) === a && !this.spent.has(`${t.getId()}:${index}`)
                      ? [
                          {
                            txid: t.getId(),
                            vout: index,
                            value: Number(o.value),
                            status: { confirmed: true },
                          },
                        ]
                      : [],
                  ),
                );
                break;
              case "hex":
                data = this.bitcoins.get(id)!.toHex();
                break;
              case "tx":
                data = {
                  status: { confirmed: true, block_height: 100 },
                  fee: Number(
                    BigInt(
                      Math.round(
                        Number(this.records.find((t) => t.hash === id)!.fee) *
                          1e8,
                      ),
                    ),
                  ),
                };
                break;
              default:
                throw new Error("Unexpected Bitcoin API action");
            }
            result = { data };
          }
        } else
          return route.fulfill({
            status: 503,
            json: { error: "Cloud backup disabled in isolated tests" },
          });
        await route.fulfill({ json: result });
      } catch (e) {
        await route.fulfill({ status: 500, json: { error: String(e) } });
      }
    });
  }
  rpc(n: BlockchainNetwork, method: string, p: any[]): any {
    if (n === "solana")
      switch (method) {
        case "getBalance":
          return {
            context: { slot: 100 },
            value: Number(this.balance(n, p[0])),
          };
        case "getLatestBlockhash":
          return {
            context: { slot: 100 },
            value: {
              blockhash: "11111111111111111111111111111111",
              lastValidBlockHeight: 1000,
            },
          };
        case "getAccountInfo":
          return {
            context: { slot: 100 },
            value: {
              data: ["", "base64"],
              executable: false,
              lamports: Number(this.balance(n, p[0])),
              owner: "11111111111111111111111111111111",
              rentEpoch: 0,
            },
          };
        case "getFeeForMessage":
          return { context: { slot: 100 }, value: 5000 };
        case "getBlockHeight":
          return 100;
        case "getMinimumBalanceForRentExemption":
          return 890880;
        case "sendTransaction": {
          const t = SolTransaction.from(Buffer.from(p[0], "base64"));
          if (!t.verifySignatures()) throw new Error("Invalid SOL signature");
          const transfer = SystemInstruction.decodeTransfer(t.instructions[0]);
          const signature = bs58.encode(t.signature!);
          this.sol.set(signature, t);
          this.add(
            n,
            transfer.fromPubkey.toBase58(),
            transfer.toPubkey.toBase58(),
            transfer.lamports,
            5000n,
            signature,
          );
          return signature;
        }
        case "getSignatureStatuses":
          return {
            context: { slot: 101 },
            value: p[0].map((s: string) =>
              this.sol.has(s)
                ? {
                    slot: 100,
                    confirmations: null,
                    err: null,
                    confirmationStatus: "finalized",
                  }
                : null,
            ),
          };
        case "getTransaction": {
          const t = this.sol.get(p[0])!,
            m = t.compileMessage();
          return {
            slot: 100,
            blockTime: Math.floor(Date.now() / 1000),
            meta: {
              err: null,
              fee: 5000,
              preBalances: m.accountKeys.map(() => 10000000000),
              postBalances: m.accountKeys.map(() => 9999995000),
            },
            transaction: {
              signatures: [p[0]],
              message: {
                header: m.header,
                accountKeys: m.accountKeys.map((k) => k.toBase58()),
                recentBlockhash: m.recentBlockhash,
                instructions: m.instructions,
              },
            },
          };
        }
        default:
          throw new Error(`Unexpected Solana RPC ${method}`);
      }
    switch (method) {
      case "eth_chainId":
        return hex(NETWORKS[n].chainId!);
      case "eth_getBalance":
        return hex(this.balance(n, p[0]));
      case "eth_getTransactionCount":
        return hex(this.nonces.get(this.key(n, p[0])) || 0);
      case "eth_gasPrice":
        return hex(1000000000n);
      case "eth_maxPriorityFeePerGas":
        return hex(1000000000n);
      case "eth_blockNumber":
        return "0x65";
      case "eth_estimateGas":
        return "0x5208";
      case "eth_call":
        return "0x" + "0".repeat(64);
      case "eth_getBlockByNumber":
        return {
          hash,
          parentHash: hash,
          number: "0x64",
          timestamp: "0x6553f100",
          nonce: "0x0000000000000000",
          difficulty: "0x0",
          gasLimit: "0x1c9c380",
          gasUsed: "0x5208",
          miner: "0x" + "00".repeat(20),
          extraData: "0x",
          transactions: [],
          baseFeePerGas: hex(1000000000n),
        };
      case "eth_sendRawTransaction": {
        const t = EvmTransaction.from(p[0]);
        if (!t.signature || t.chainId !== BigInt(NETWORKS[n].chainId!))
          throw new Error("Wrong signed chain ID");
        this.evm.set(t.hash!, t);
        this.nonces.set(this.key(n, t.from!), Number(t.nonce) + 1);
        this.add(n, t.from!, t.to!, t.value, 21000n * 1000000000n, t.hash!);
        return t.hash;
      }
      case "eth_getTransactionReceipt": {
        const t = this.evm.get(p[0]);
        if (!t) return null;
        return {
          transactionHash: t.hash,
          transactionIndex: "0x0",
          blockHash: hash,
          blockNumber: "0x64",
          from: t.from,
          to: t.to,
          cumulativeGasUsed: "0x5208",
          gasUsed: "0x5208",
          effectiveGasPrice: hex(1000000000n),
          contractAddress: null,
          logs: [],
          logsBloom: "0x" + "00".repeat(256),
          status: "0x1",
          type: "0x2",
        };
      }
      default:
        throw new Error(`Unexpected EVM RPC ${method}`);
    }
  }
}
async function address(page: Page, n: BlockchainNetwork) {
  await page.getByLabel("Network", { exact: true }).selectOption(n);
  await expect(page.locator(".balance")).not.toContainText("—", {
    timeout: 15000,
  });
  return (await page.locator(".wallet-home").getAttribute("data-address"))!;
}
async function transfer(
  sender: Page,
  receiver: Page,
  n: BlockchainNetwork,
  to: string,
) {
  await sender.bringToFront();
  await sender.getByRole("button", { name: "Send", exact: true }).click();
  await sender.getByLabel("Recipient address").fill(to);
  await sender
    .getByLabel("Amount", { exact: true })
    .fill(n === "bitcoin" ? "0.0001" : "0.001");
  await sender.getByRole("button", { name: "Review transfer" }).click();
  await expect(
    sender.getByRole("heading", { name: "Review transfer" }),
  ).toBeVisible({ timeout: 15000 });
  await sender.getByRole("button", { name: "Confirm and send" }).click();
  await expect(
    sender.getByRole("heading", { name: "Transaction submitted" }),
  ).toBeVisible({ timeout: 15000 });
  await sender.getByRole("button", { name: "Track in wallet" }).click();
  await expect(sender.locator(".transaction .status").first()).toHaveText(
    /confirmed|finalized/,
    { timeout: 20000 },
  );
  await receiver.bringToFront();
  await expect(
    receiver.locator(".transaction").filter({ hasText: "Received" }).first(),
  ).toBeVisible({ timeout: 20000 });
}
for (const n of CHAINS) {
  test(`SIMULATED: ${n} signs and receives both directions in independent browsers`, async ({
    browser,
  }) => {
    test.setTimeout(90000);
    const ledger = new SimulatedNetwork();
    const a = await browser.newContext(),
      b = await browser.newContext();
    await ledger.routes(a);
    await ledger.routes(b);
    const pa = await a.newPage(),
      pb = await b.newPage();
    await createWallet(pa);
    await createWallet(pb);
    const aa = await address(pa, n),
      ba = await address(pb, n);
    expect(aa).not.toEqual(ba);
    if (n === "bitcoin") {
      ledger.funding(aa);
      ledger.funding(ba);
    }
    await transfer(pa, pb, n, ba);
    await transfer(pb, pa, n, aa);
    expect(ledger.records).toHaveLength(2);
    if (n === "bitcoin")
      await pa.screenshot({
        path: test.info().outputPath("simulated-transfers.png"),
        fullPage: true,
      });
    await a.close();
    await b.close();
  });
}
