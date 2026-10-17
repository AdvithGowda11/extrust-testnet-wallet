import { NextRequest, NextResponse } from "next/server";
import { isNetwork, isEVM } from "@/config/networks";
import { rpc, verifyNetwork } from "@/lib/serverRpc";
import { bitcoinApi } from "@/lib/bitcoinServer";
import { guard, failure, HttpError } from "@/lib/http";
import { formatAmount } from "@/lib/amounts";
import { isAddress } from "ethers";
import { PublicKey } from "@solana/web3.js";
import { address as bitcoinAddress, networks } from "bitcoinjs-lib";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ chain: string; address: string }> },
) {
  try {
    guard(request);
    const { chain, address } = await context.params;
    if (!isNetwork(chain) || address.length > 100)
      throw new HttpError("Invalid network or address");
    let balance: string,
      pending = "0";
    if (isEVM(chain)) {
      if (!isAddress(address)) throw new HttpError("Invalid address");
      await verifyNetwork(chain);
      balance = formatAmount(
        BigInt(await rpc(chain, "eth_getBalance", [address, "latest"])),
        18,
      );
    } else if (chain === "solana") {
      try {
        new PublicKey(address);
      } catch {
        throw new HttpError("Invalid Solana address");
      }
      await verifyNetwork(chain);
      const result = await rpc(chain, "getBalance", [
        address,
        { commitment: "confirmed" },
      ]);
      if (!Number.isSafeInteger(result.value))
        throw new HttpError("Unsupported balance precision", 502);
      balance = formatAmount(BigInt(result.value), 9);
    } else {
      try {
        bitcoinAddress.toOutputScript(address, networks.testnet);
      } catch {
        throw new HttpError("Invalid Signet address");
      }
      const result = await bitcoinApi(`address/${address}`);
      balance = formatAmount(
        BigInt(result.chain_stats.funded_txo_sum) -
          BigInt(result.chain_stats.spent_txo_sum),
        8,
      );
      pending = formatAmount(
        BigInt(result.mempool_stats.funded_txo_sum) -
          BigInt(result.mempool_stats.spent_txo_sum),
        8,
      );
    }
    return NextResponse.json(
      { balance, pending },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
