import { Buffer } from "buffer";
import { address, networks, Psbt, Transaction } from "bitcoinjs-lib";
export interface Utxo {
  txid: string;
  vout: number;
  value: number;
  status: { confirmed: boolean };
}
export interface BitcoinPlan {
  inputs: Utxo[];
  to: string;
  from: string;
  amount: string;
  fee: string;
  change: string;
  feeRate: number;
}
export function selectCoins(
  utxos: Utxo[],
  from: string,
  to: string,
  amount: bigint,
  feeRate: number,
  max = false,
): BitcoinPlan {
  const outputSize = (a: string) =>
    8 + 1 + address.toOutputScript(a, networks.testnet).length;
  if (!Number.isFinite(feeRate) || feeRate < 1 || feeRate > 100)
    throw new Error("Fee rate must be between 1 and 100 sat/vB");
  if (!max && amount < 546n)
    throw new Error("Bitcoin transfers must be at least 546 satoshis");
  const candidates = utxos
    .filter((u) => u.status.confirmed)
    .sort((a, b) => b.value - a.value);
  const inputs: Utxo[] = [];
  let total = 0n;
  const ids = new Set<string>();
  for (const u of candidates) {
    if (
      !/^[a-f0-9]{64}$/.test(u.txid) ||
      !Number.isSafeInteger(u.vout) ||
      u.vout < 0 ||
      !Number.isSafeInteger(u.value) ||
      u.value <= 0
    )
      throw new Error("Invalid UTXO response");
    const id = `${u.txid}:${u.vout}`;
    if (ids.has(id)) throw new Error("Duplicate UTXO");
    ids.add(id);
    if (inputs.length >= 100)
      throw new Error(
        "Too many inputs for one transfer. Consolidate smaller groups first.",
      );
    inputs.push(u);
    total += BigInt(u.value);
    const fee = BigInt(
      Math.ceil(
        (11 +
          69 * inputs.length +
          outputSize(to) +
          (max ? 0 : outputSize(from))) *
          feeRate,
      ),
    );
    if (fee > 1_000_000n) throw new Error("Fee exceeds the demo safety limit");
    if (max && inputs.length < candidates.length) continue;
    const sent = max ? total - fee : amount;
    const remainder = total - sent - fee;
    if (sent < 546n || remainder < 0n) continue;
    const change = remainder >= 546n ? remainder : 0n;
    return {
      inputs,
      from,
      to,
      amount: sent.toString(),
      fee: (fee + (change ? 0n : remainder)).toString(),
      change: change.toString(),
      feeRate,
    };
  }
  throw new Error("Insufficient confirmed Bitcoin funds for amount and fee");
}
export function createPsbt(
  plan: BitcoinPlan,
  previous: Record<string, string>,
) {
  const psbt = new Psbt({ network: networks.testnet });
  const script = address.toOutputScript(plan.from, networks.testnet);
  let total = 0n;
  for (const u of plan.inputs) {
    const tx = Transaction.fromHex(previous[u.txid]);
    const output = tx.outs[u.vout];
    if (
      tx.getId() !== u.txid ||
      !output ||
      Buffer.from(output.script).toString("hex") !==
        Buffer.from(script).toString("hex") ||
      output.value !== BigInt(u.value)
    )
      throw new Error("UTXO does not match its funding transaction");
    total += output.value;
    psbt.addInput({
      hash: u.txid,
      index: u.vout,
      sequence: 0xfffffffd,
      witnessUtxo: { script: output.script, value: output.value },
    });
  }
  if (total !== BigInt(plan.amount) + BigInt(plan.change) + BigInt(plan.fee))
    throw new Error("Bitcoin inputs and outputs do not balance");
  psbt.addOutput({ address: plan.to, value: BigInt(plan.amount) });
  if (BigInt(plan.change) > 0n)
    psbt.addOutput({ address: plan.from, value: BigInt(plan.change) });
  return psbt;
}
