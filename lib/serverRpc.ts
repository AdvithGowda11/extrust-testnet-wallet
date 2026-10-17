import "server-only";
import { BlockchainNetwork } from "@/types";
import { NETWORKS } from "@/config/networks";
import { getRpcUrl } from "@/lib/serverNetworks";
import { HttpError, upstreamJson } from "@/lib/http";
const checked = new Map<string, number>();
export async function rpc(
  chain: BlockchainNetwork,
  method: string,
  params: unknown[] = [],
) {
  const result = await upstreamJson(getRpcUrl(chain), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (result.error || !("result" in result))
    throw new HttpError(
      `Network rejected ${method}. Check the transaction or retry.`,
      502,
    );
  return result.result;
}
export async function verifyNetwork(chain: BlockchainNetwork) {
  const key = getRpcUrl(chain);
  if ((checked.get(key) || 0) > Date.now()) return;
  if (chain === "solana") {
    if (
      (await rpc(chain, "getGenesisHash")) !==
      "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG"
    )
      throw new HttpError("RPC is not Solana Devnet. Sending blocked.", 503);
  } else if (
    BigInt(await rpc(chain, "eth_chainId")) !== BigInt(NETWORKS[chain].chainId!)
  )
    throw new HttpError("RPC chain identity mismatch. Sending blocked.", 503);
  checked.set(key, Date.now() + 30_000);
}
