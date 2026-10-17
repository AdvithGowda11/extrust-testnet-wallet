import test from "node:test";
import assert from "node:assert/strict";
import { Interface } from "ethers";
import { tokenTransfer } from "../lib/tokenHistory";
import { mergeHistory } from "../lib/history";
const abi = new Interface([
  "event Transfer(address indexed from,address indexed to,uint256 value)",
]);
const owner = "0x" + "11".repeat(20),
  other = "0x" + "22".repeat(20);
const token = {
  address: "0x" + "33".repeat(20),
  symbol: "TEST",
  name: "Test",
  network: "ethereum" as const,
  decimals: 18,
};
function log(from: string, to: string, value: bigint, index = 7) {
  return {
    ...abi.encodeEventLog(abi.getEvent("Transfer")!, [from, to, value]),
    transactionHash: "hash",
    index,
  };
}
test("ERC-20 history keeps one wei exact and identifies incoming, outgoing and self transfers", () => {
  assert.equal(
    tokenTransfer(log(other, owner, 1n), token, owner, 100)!.value,
    "0.000000000000000001",
  );
  assert.equal(
    tokenTransfer(log(other, owner, 1n), token, owner, 100)!.type,
    "receive",
  );
  assert.equal(
    tokenTransfer(log(owner, other, 1n), token, owner, 100)!.type,
    "send",
  );
  assert.equal(
    tokenTransfer(log(owner, owner, 1n), token, owner, 100)!.type,
    "self",
  );
  assert.equal(
    tokenTransfer(
      { ...log(other, owner, 1n), removed: true },
      token,
      owner,
      100,
    ),
    null,
  );
  assert.equal(tokenTransfer(log(other, other, 1n), token, owner, 100), null);
});
test("chain token events replace local submission without collapsing multiple events", () => {
  const chain = tokenTransfer(log(owner, other, 1n), token, owner, 100)!;
  const local = {
    ...chain,
    eventIndex: undefined,
    signedTransaction: "raw",
    nonce: 1,
    status: "pending" as const,
  };
  const result = mergeHistory([local], [chain, { ...chain, eventIndex: 8 }]);
  assert.equal(result.length, 2);
  assert.equal(result[0].nonce, 1);
  assert.equal(mergeHistory(result, [chain]).length, 2);
});

test("token history queries both directions, deduplicates self events and pages in bounded ranges", async () => {
  const { BlockchainService } = await import("../services/blockchainService");
  const original = BlockchainService.provider;
  const filters: any[] = [];
  const event = { ...log(owner, owner, 1n), blockNumber: 2500 };
  BlockchainService.provider = (() => ({
    getBlockNumber: async () => 3000,
    getLogs: async (filter: any) => {
      filters.push(filter);
      return [event];
    },
    getBlock: async () => ({ timestamp: 42 }),
  })) as unknown as typeof original;
  try {
    const result = await BlockchainService.getTokenHistory(owner, token);
    assert.equal(result.transactions.length, 1);
    assert.equal(result.transactions[0].timestamp, 42000);
    assert.equal(result.nextBlock, 1000);
    assert.equal(filters.length, 2);
    assert.equal(filters[0].fromBlock, 1001);
    assert.equal(filters[0].toBlock, 3000);
    assert.equal(filters[1].topics[1], null);
    await assert.rejects(
      () => BlockchainService.getTokenHistory(owner, token, 3001),
      /cursor/,
    );
  } finally {
    BlockchainService.provider = original;
  }
});
