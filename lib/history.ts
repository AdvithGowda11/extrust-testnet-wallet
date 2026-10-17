import { Transaction, BlockchainNetwork } from "@/types";
import { NETWORKS, sameAddress } from "@/config/networks";
import { formatAmount } from "@/lib/amounts";
export function bitcoinHistory(tx: any, owner: string): Transaction {
  const ownedInputs = tx.vin.filter(
    (v: any) => v.prevout?.scriptpubkey_address === owner,
  );
  const externalOutputs = tx.vout.filter(
    (v: any) => v.scriptpubkey_address !== owner,
  );
  const received: bigint = tx.vout
    .filter((v: any) => v.scriptpubkey_address === owner)
    .reduce((sum: bigint, v: any) => sum + BigInt(v.value), 0n);
  const spent: bigint = ownedInputs.reduce(
    (sum: bigint, v: any) => sum + BigInt(v.prevout.value),
    0n,
  );
  const outgoing = ownedInputs.length > 0;
  const ownOnly = outgoing && ownedInputs.length === tx.vin.length;
  const self = ownOnly && externalOutputs.length === 0;
  const value = self
    ? 0n
    : outgoing
      ? ownOnly
        ? spent - received - BigInt(tx.fee)
        : spent - received
      : received;
  return {
    hash: tx.txid,
    network: "bitcoin",
    networkId: NETWORKS.bitcoin.id,
    from: outgoing
      ? owner
      : tx.vin[0]?.prevout?.scriptpubkey_address || "Unknown",
    to: outgoing
      ? externalOutputs
          .map((v: any) => v.scriptpubkey_address || "Script output")
          .join(", ") || owner
      : owner,
    value: formatAmount(value < 0n ? -value : value, 8),
    type: self ? "self" : outgoing ? "send" : "receive",
    status: tx.status.confirmed ? "confirmed" : "pending",
    timestamp: tx.status.block_time ? tx.status.block_time * 1000 : Date.now(),
    fee: formatAmount(BigInt(tx.fee), 8),
  };
}
export function solanaHistory(
  tx: any,
  signature: string,
  owner: string,
): Transaction[] {
  if (!tx?.meta || !tx.transaction?.message) return [];
  const instructions = [
    ...tx.transaction.message.instructions,
    ...(tx.meta.innerInstructions || []).flatMap((v: any) => v.instructions),
  ];
  return instructions
    .filter(
      (i: any) =>
        i.program === "system" &&
        ["transfer", "transferWithSeed"].includes(i.parsed?.type) &&
        (i.parsed.info.source === owner || i.parsed.info.destination === owner),
    )
    .map((i: any, index: number) => ({
      eventIndex: index || undefined,
      hash: signature,
      network: "solana",
      networkId: NETWORKS.solana.id,
      from: i.parsed.info.source,
      to: i.parsed.info.destination,
      value: formatAmount(BigInt(i.parsed.info.lamports), 9),
      type:
        i.parsed.info.source === owner
          ? i.parsed.info.destination === owner
            ? "self"
            : "send"
          : "receive",
      timestamp: tx.blockTime ? tx.blockTime * 1000 : Date.now(),
      status: tx.meta.err ? "failed" : "confirmed",
      fee: index === 0 ? formatAmount(BigInt(tx.meta.fee), 9) : undefined,
    }));
}
export function mergeHistory(local: Transaction[], remote: Transaction[]) {
  const merged = new Map(
    local.map((t) => [
      `${t.networkId}:${t.hash}:${(t.tokenAddress || "").toLowerCase()}:${t.eventIndex ?? 0}`,
      t,
    ]),
  );
  for (const tx of remote) {
    const key = `${tx.networkId}:${tx.hash}:${(tx.tokenAddress || "").toLowerCase()}:${tx.eventIndex ?? 0}`;
    let old = merged.get(key);
    if (tx.tokenAddress && tx.eventIndex !== undefined) {
      for (const [pendingKey, pending] of merged) {
        if (
          pending.networkId === tx.networkId &&
          pending.hash === tx.hash &&
          pending.tokenAddress?.toLowerCase() ===
            tx.tokenAddress.toLowerCase() &&
          pending.eventIndex === undefined &&
          pending.signedTransaction
        ) {
          old = pending;
          merged.delete(pendingKey);
          break;
        }
      }
    }
    merged.set(key, {
      ...old,
      ...tx,
      ...(old?.status === "finalized" &&
      tx.status === "confirmed" &&
      tx.network === "solana"
        ? { status: "finalized" as const }
        : {}),
      ...(old?.tokenSymbol ? { tokenSymbol: old.tokenSymbol } : {}),
    });
  }
  return [...merged.values()].sort((a, b) => b.timestamp - a.timestamp);
}
export function direction(
  network: BlockchainNetwork,
  owner: string,
  from: string,
  to: string,
): Transaction["type"] {
  return sameAddress(network, owner, from)
    ? sameAddress(network, owner, to)
      ? "self"
      : "send"
    : "receive";
}
