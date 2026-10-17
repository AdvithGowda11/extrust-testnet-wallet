import test from "node:test";
import assert from "node:assert/strict";
import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
import { ECPair } from "../services/walletService";
import { selectCoins, createPsbt, Utxo } from "../lib/bitcoin";
import { bitcoinHistory, solanaHistory, mergeHistory } from "../lib/history";
const key = ECPair.fromPrivateKey(new Uint8Array(32).fill(1), {
  network: bitcoin.networks.testnet,
});
const from = bitcoin.payments.p2wpkh({
  pubkey: key.publicKey,
  network: bitcoin.networks.testnet,
}).address!;
const to = bitcoin.payments.p2wpkh({
  pubkey: ECPair.fromPrivateKey(new Uint8Array(32).fill(2)).publicKey,
  network: bitcoin.networks.testnet,
}).address!;
function funding(value = 100000) {
  const tx = new bitcoin.Transaction();
  tx.addInput(new Uint8Array(32), 0);
  tx.addOutput(
    bitcoin.address.toOutputScript(from, bitcoin.networks.testnet),
    BigInt(value),
  );
  return tx;
}
const tx = funding();
const utxo: Utxo = {
  txid: tx.getId(),
  vout: 0,
  value: 100000,
  status: { confirmed: true },
};
test("Bitcoin PSBT signs, balances inputs/change/fee and verifies signatures", () => {
  const plan = selectCoins([utxo], from, to, 10000n, 2);
  const psbt = createPsbt(plan, { [tx.getId()]: tx.toHex() });
  psbt.signAllInputs(key);
  assert.ok(
    psbt.validateSignaturesOfAllInputs((pub, h, sig) =>
      ecc.verify(h, pub, sig),
    ),
  );
  psbt.finalizeAllInputs();
  const signed = psbt.extractTransaction();
  assert.equal(signed.outs[0].value, 10000n);
  assert.equal(
    signed.outs.reduce((n, o) => n + o.value, 0n) + psbt.getFee(),
    100000n,
  );
  assert.ok(psbt.getFee() >= BigInt(signed.virtualSize() * 2));
});
test("Bitcoin rejects dust, insufficient funds, unconfirmed and forged UTXOs", () => {
  assert.throws(() => selectCoins([utxo], from, to, 1n, 1));
  assert.throws(() => selectCoins([utxo], from, to, 100000n, 1));
  assert.throws(() =>
    selectCoins(
      [{ ...utxo, status: { confirmed: false } }],
      from,
      to,
      1000n,
      1,
    ),
  );
  const plan = selectCoins([{ ...utxo, value: 200000 }], from, to, 10000n, 1);
  assert.throws(() => createPsbt(plan, { [tx.getId()]: tx.toHex() }));
});
test("Bitcoin Max reserves fee and creates no change", () => {
  const plan = selectCoins([utxo], from, to, 0n, 2, true);
  assert.equal(plan.change, "0");
  assert.equal(BigInt(plan.amount) + BigInt(plan.fee), 100000n);
});
test("Bitcoin outgoing history shows payment rather than change", () => {
  const history = bitcoinHistory(
    {
      txid: "a",
      vin: [{ prevout: { scriptpubkey_address: from, value: 100000 } }],
      vout: [
        { scriptpubkey_address: to, value: 10000 },
        { scriptpubkey_address: from, value: 89000 },
      ],
      fee: 1000,
      status: { confirmed: true, block_time: 1 },
    },
    from,
  );
  assert.equal(history.type, "send");
  assert.equal(history.value, "0.0001");
  assert.equal(history.to, to);
});
test("Solana parsed history retains exact native amount and direction", () => {
  const tx = {
    blockTime: 10,
    meta: { err: null, fee: 5000 },
    transaction: {
      message: {
        instructions: [
          {
            program: "system",
            parsed: {
              type: "transfer",
              info: { source: "A", destination: "B", lamports: 1 },
            },
          },
        ],
      },
    },
  };
  const rows = solanaHistory(tx, "signature", "B");
  assert.equal(rows[0].value, "0.000000001");
  assert.equal(rows[0].type, "receive");
});
test("chain failure replaces a stale local success", () => {
  const tx = bitcoinHistory(
    {
      txid: "a",
      vin: [],
      vout: [{ scriptpubkey_address: to, value: 1000 }],
      fee: 10,
      status: { confirmed: true },
    },
    to,
  );
  assert.equal(
    mergeHistory([tx], [{ ...tx, status: "failed" }])[0].status,
    "failed",
  );
});

test("multiple Solana transfers in one signature survive merge without charging fee twice", () => {
  const instruction = (lamports: number) => ({
    program: "system",
    parsed: {
      type: "transfer",
      info: { source: "A", destination: "B", lamports },
    },
  });
  const rows = solanaHistory(
    {
      blockTime: 10,
      meta: { err: null, fee: 5000 },
      transaction: {
        message: { instructions: [instruction(1), instruction(2)] },
      },
    },
    "same-signature",
    "B",
  );
  const merged = mergeHistory(rows, rows);
  assert.equal(merged.length, 2);
  assert.deepEqual(
    merged.map((t) => t.value),
    ["0.000000001", "0.000000002"],
  );
  assert.equal(merged.filter((t) => t.fee !== undefined).length, 1);
});

test("parsed Solana history does not downgrade an observed finalized status", () => {
  const tx = {
    hash: "sig",
    network: "solana" as const,
    networkId: "solana:devnet",
    from: "A",
    to: "B",
    value: "1",
    timestamp: 1,
    type: "receive" as const,
    status: "finalized" as const,
  };
  assert.equal(
    mergeHistory([tx], [{ ...tx, status: "confirmed" }])[0].status,
    "finalized",
  );
  assert.equal(
    mergeHistory([tx], [{ ...tx, status: "failed" }])[0].status,
    "failed",
  );
});
