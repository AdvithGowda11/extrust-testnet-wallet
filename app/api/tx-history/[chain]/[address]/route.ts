import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "ethers";
import { PublicKey } from "@solana/web3.js";
import { address as btcAddress, networks } from "bitcoinjs-lib";
import { NETWORKS, isNetwork, isEVM } from "@/config/networks";
import { BlockchainNetwork, Transaction } from "@/types";
import { bitcoinApi } from "@/lib/bitcoinServer";
import { rpc, verifyNetwork } from "@/lib/serverRpc";
import { guard, HttpError, failure, upstreamJson } from "@/lib/http";
import { bitcoinHistory, solanaHistory, direction } from "@/lib/history";
import { formatAmount } from "@/lib/amounts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function evmHistory(
  chain: BlockchainNetwork,
  address: string,
  cursor: string,
) {
  await verifyNetwork(chain);
  // Explorer indexing is optional. Do not make live receipt detection depend on it.
  if (process.env.ETHERSCAN_API_KEY && !cursor.startsWith("block:")) {
    try {
      const page = cursor ? Number(cursor) : 1;
      if (!Number.isSafeInteger(page) || page < 1 || page > 10000)
        throw new Error("Invalid page");
      const query = new URLSearchParams({
        chainid: String(NETWORKS[chain].chainId),
        module: "account",
        action: "txlist",
        address,
        page: String(page),
        offset: "25",
        sort: "desc",
        apikey: process.env.ETHERSCAN_API_KEY,
      });
      const result = await upstreamJson(
        `https://api.etherscan.io/v2/api?${query}`,
      );
      if (result.status === "1" && Array.isArray(result.result))
        return {
          transactions: result.result.map((t: any): Transaction => ({
            hash: t.hash,
            network: chain,
            networkId: NETWORKS[chain].id,
            from: t.from,
            to: t.to || "",
            value: formatAmount(BigInt(t.value), 18),
            type: direction(chain, address, t.from, t.to || ""),
            timestamp: Number(t.timeStamp) * 1000,
            status: t.isError === "0" ? "confirmed" : "failed",
            fee: formatAmount(BigInt(t.gasUsed) * BigInt(t.gasPrice), 18),
          })),
          nextCursor:
            result.result.length === 25 ? String(page + 1) : undefined,
          notice:
            "Explorer native-transaction history. Token sends are also recorded locally.",
        };
    } catch {
      /* A bounded block scan remains usable if indexing or API access fails. */
    }
  }
  const tip = Number(BigInt(await rpc(chain, "eth_blockNumber")));
  const end = cursor.startsWith("block:") ? Number(cursor.slice(6)) : tip;
  if (!Number.isSafeInteger(end) || end < 0 || end > tip)
    throw new HttpError("Invalid block cursor");
  const start = Math.max(0, end - 11),
    transactions: Transaction[] = [];
  for (let block = end; block >= start; block -= 3) {
    const heights = Array.from(
      { length: Math.min(3, block - start + 1) },
      (_, i) => block - i,
    );
    const blocks = await Promise.all(
      heights.map((n) =>
        rpc(chain, "eth_getBlockByNumber", [`0x${n.toString(16)}`, true]),
      ),
    );
    for (const b of blocks)
      for (const t of b?.transactions || []) {
        if (
          ![t.from, t.to].some(
            (v) => v?.toLowerCase() === address.toLowerCase(),
          )
        )
          continue;
        const receipt = await rpc(chain, "eth_getTransactionReceipt", [t.hash]);
        transactions.push({
          hash: t.hash,
          network: chain,
          networkId: NETWORKS[chain].id,
          from: t.from,
          to: t.to || "",
          value: formatAmount(BigInt(t.value), 18),
          timestamp: Number(BigInt(b.timestamp)) * 1000,
          type: direction(chain, address, t.from, t.to || ""),
          status: receipt
            ? BigInt(receipt.status) === 1n
              ? "confirmed"
              : "failed"
            : "pending",
          fee: receipt
            ? formatAmount(
                BigInt(receipt.gasUsed) * BigInt(receipt.effectiveGasPrice) +
                  BigInt(receipt.l1Fee || 0) +
                  BigInt(receipt.operatorFee || 0),
                18,
              )
            : undefined,
        });
      }
  }
  return {
    transactions,
    nextCursor: start ? `block:${start - 1}` : undefined,
    notice: `Live native activity from blocks ${start}–${end}. Load older to scan earlier blocks; an explorer key enables indexed history.`,
  };
}
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ chain: string; address: string }> },
) {
  try {
    guard(request);
    const { chain, address } = await context.params;
    const cursor = request.nextUrl.searchParams.get("cursor") || "";
    if (!isNetwork(chain) || address.length > 100 || cursor.length > 100)
      throw new HttpError("Invalid history request");
    let data;
    if (isEVM(chain)) {
      if (!isAddress(address)) throw new HttpError("Invalid address");
      data = await evmHistory(chain, address, cursor);
    } else if (chain === "solana") {
      try {
        new PublicKey(address);
      } catch {
        throw new HttpError("Invalid address");
      }
      await verifyNetwork(chain);
      const signatures = await rpc(chain, "getSignaturesForAddress", [
        address,
        {
          limit: 10,
          ...(cursor ? { before: cursor } : {}),
          commitment: "confirmed",
        },
      ]);
      const rows: Transaction[] = [];
      for (const s of signatures)
        rows.push(
          ...solanaHistory(
            await rpc(chain, "getTransaction", [
              s.signature,
              {
                encoding: "jsonParsed",
                maxSupportedTransactionVersion: 0,
                commitment: "confirmed",
              },
            ]),
            s.signature,
            address,
          ),
        );
      data = {
        transactions: rows,
        nextCursor:
          signatures.length === 10 ? signatures.at(-1).signature : undefined,
        notice:
          "Native SOL transfers. Other program activity is available in the explorer.",
      };
    } else {
      try {
        btcAddress.toOutputScript(address, networks.testnet);
      } catch {
        throw new HttpError("Invalid Signet address");
      }
      if (cursor && !/^[a-f0-9]{64}$/.test(cursor))
        throw new HttpError("Invalid cursor");
      const rows = await bitcoinApi(
        `address/${address}/txs${cursor ? `/chain/${cursor}` : ""}`,
      );
      const confirmed = rows.filter((t: any) => t.status.confirmed);
      data = {
        transactions: rows.map((t: any) => bitcoinHistory(t, address)),
        nextCursor: confirmed.length >= 25 ? confirmed.at(-1).txid : undefined,
      };
    }
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
