import { NextRequest, NextResponse } from "next/server";
import { isNetwork } from "@/config/networks";
import { getRpcUrl } from "@/lib/serverNetworks";
import { verifyNetwork } from "@/lib/serverRpc";
import { guard, jsonBody, failure, HttpError, upstreamJson } from "@/lib/http";
import { validateRpc } from "@/lib/rpcPolicy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ chain: string }> },
) {
  try {
    guard(request);
    const { chain } = await context.params;
    if (!isNetwork(chain) || chain === "bitcoin")
      throw new HttpError("Unsupported test network");
    const body = await jsonBody(request);
    let calls;
    try {
      calls = validateRpc(chain, body);
    } catch {
      throw new HttpError(
        "RPC method, parameters, or transaction network not allowed",
        403,
      );
    }
    await verifyNetwork(chain);
    // Broadcast separately on Base's documented submission endpoint when using its public RPC.
    const responses = await Promise.all(
      calls.map(async (call) => {
        const url =
          chain === "base" &&
          call.method === "eth_sendRawTransaction" &&
          !process.env.TEST_RPC_BASE
            ? "https://sepolia-sequencer.base.org"
            : getRpcUrl(chain);
        const response = await upstreamJson(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(call),
        });
        // Do not relay upstream error data: providers may include credential-bearing URLs.
        if (response.error)
          return {
            jsonrpc: "2.0",
            id: call.id,
            error: {
              code: -32000,
              message:
                "Network rejected the request. Check balance, fee, address, and transaction status before retrying.",
            },
          };
        return response;
      }),
    );
    return NextResponse.json(Array.isArray(body) ? responses : responses[0], {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
