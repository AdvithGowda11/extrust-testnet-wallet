import { test, expect } from "@playwright/test";
import { Interface } from "ethers";
import { createWallet, password } from "./helpers";

test("SIMULATED: added ERC-20 incoming activity persists across lock and reload", async ({
  page,
  context,
}) => {
  const abi = new Interface([
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function balanceOf(address) view returns (uint256)",
    "event Transfer(address indexed from,address indexed to,uint256 value)",
  ]);
  const contract = "0x" + "33".repeat(20),
    sender = "0x" + "22".repeat(20),
    hash = "0x" + "44".repeat(32);
  let owner = "",
    eventsAvailable = true;
  await context.route("**/api/balance/**", (r) =>
    r.fulfill({ json: { balance: "0", pending: "0" } }),
  );
  await context.route("**/api/tx-history/**", (r) =>
    r.fulfill({ json: { transactions: [] } }),
  );
  await context.route("**/api/rpc/ethereum", async (route) => {
    const body = route.request().postDataJSON();
    function answer(call: any) {
      let result: any;
      if (call.method === "eth_chainId") result = "0xaa36a7";
      else if (call.method === "eth_blockNumber") result = "0xbb8";
      else if (call.method === "eth_call") {
        const fn = abi.getFunction(call.params[0].data.slice(0, 10))!.name;
        result = abi.encodeFunctionResult(fn, [
          fn === "name"
            ? "Test Coin"
            : fn === "symbol"
              ? "TEST"
              : fn === "decimals"
                ? 18
                : 1n,
        ]);
      } else if (call.method === "eth_getLogs") {
        const event = abi.encodeEventLog(abi.getEvent("Transfer")!, [
          sender,
          owner,
          1n,
        ]);
        result =
          eventsAvailable && call.params[0].topics[2]
            ? [
                {
                  ...event,
                  address: contract,
                  transactionHash: hash,
                  transactionIndex: "0x0",
                  blockHash: hash,
                  blockNumber: "0xbb8",
                  logIndex: "0x7",
                  removed: false,
                },
              ]
            : [];
      } else if (call.method === "eth_getBlockByNumber")
        result = {
          hash,
          parentHash: hash,
          number: "0xbb8",
          timestamp: "0x6553f100",
          nonce: "0x0000000000000000",
          difficulty: "0x0",
          gasLimit: "0x1c9c380",
          gasUsed: "0x5208",
          miner: sender,
          extraData: "0x",
          transactions: [],
          baseFeePerGas: "0x1",
        };
      else throw new Error(`Unexpected RPC: ${call.method}`);
      return { jsonrpc: "2.0", id: call.id, result };
    }
    await route.fulfill({
      json: Array.isArray(body) ? body.map(answer) : answer(body),
    });
  });
  await createWallet(page);
  await page.getByLabel("Network", { exact: true }).selectOption("ethereum");
  owner = (await page.locator(".wallet-home").getAttribute("data-address"))!;
  await page
    .locator(".wallet-primary-actions")
    .getByRole("button", { name: "Open menu" })
    .click();
  await page.getByRole("button", { name: "Add token", exact: true }).click();
  await page.getByLabel("Contract address").fill(contract);
  await page.getByRole("button", { name: "Look up token" }).click();
  await page.getByRole("button", { name: "Add verified contract" }).click();
  await expect(
    page.locator(".transaction").filter({ hasText: "Received" }),
  ).toContainText("0.000000000000000001 TEST", { timeout: 15000 });
  await expect(
    page.getByRole("button", { name: "Load older TEST transfers" }),
  ).toBeVisible();
  eventsAvailable = false;
  await page.getByRole("button", { name: "Lock", exact: true }).click();
  await page.reload();
  await page.getByLabel("Local vault passphrase").fill(password);
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await page.getByLabel("Network", { exact: true }).selectOption("ethereum");
  await expect(page.locator(".transaction")).toContainText(
    "0.000000000000000001 TEST",
    { timeout: 15000 },
  );
});
