import { NextRequest, NextResponse } from "next/server";
import { address as btcAddress, networks, Transaction } from "bitcoinjs-lib";
import { bitcoinApi } from "@/lib/bitcoinServer";
import { guard, failure, HttpError, limitedText } from "@/lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    guard(request);
    const q = request.nextUrl.searchParams,
      action = q.get("action");
    const address = q.get("address"),
      txid = q.get("txid");
    let path: string;
    if (["address", "utxos", "history"].includes(action || "")) {
      if (!address || address.length > 100)
        throw new HttpError("Invalid address");
      try {
        btcAddress.toOutputScript(address, networks.testnet);
      } catch {
        throw new HttpError("Expected a Signet address");
      }
      path = `address/${address}${action === "utxos" ? "/utxo" : action === "history" ? "/txs" : ""}`;
      const after = q.get("after");
      if (action === "history" && after) {
        if (!/^[a-f0-9]{64}$/.test(after))
          throw new HttpError("Invalid cursor");
        path += `/chain/${after}`;
      }
    } else if (action === "fees") path = "v1/fees/recommended";
    else if (action === "height") path = "blocks/tip/height";
    else if (
      ["tx", "hex"].includes(action || "") &&
      txid &&
      /^[a-f0-9]{64}$/.test(txid)
    )
      path = `tx/${txid}${action === "hex" ? "/hex" : ""}`;
    else throw new HttpError("Unsupported Bitcoin request");
    return NextResponse.json(
      { data: await bitcoinApi(path) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: NextRequest) {
  try {
    guard(request);
    const raw = await limitedText(request, 100000);
    if (!/^[a-f0-9]+$/i.test(raw) || raw.length % 2)
      throw new HttpError("Invalid signed transaction");
    let tx;
    try {
      tx = Transaction.fromHex(raw);
    } catch {
      throw new HttpError("Invalid transaction");
    }
    if (!tx.ins.length || tx.ins.some((input) => !input.witness.length))
      throw new HttpError("A signed SegWit transaction is required");
    const txid = await bitcoinApi("tx", raw);
    if (txid !== tx.getId())
      throw new HttpError(
        "Provider returned an unexpected transaction ID",
        502,
      );
    return NextResponse.json({ hash: txid });
  } catch (e) {
    return failure(e);
  }
}
