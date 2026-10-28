import { test, expect } from "@playwright/test";
import { Interface } from "ethers";
import { createWallet } from "./helpers";

test("native balances keep updating while transaction history is slow", async ({
  page,
  context,
}) => {
  let release!: () => void;
  const historyGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let reads = 0,
    historyReads = 0;
  await context.route("**/api/balance/**", (route) => {
    reads++;
    return route.fulfill({
      json: { balance: reads === 1 ? "0.0000182" : "0.00002", pending: "0" },
    });
  });
  await context.route("**/api/tx-history/**", async (route) => {
    historyReads++;
    await historyGate;
    await route.fulfill({ json: { transactions: [] } });
  });
  try {
    await createWallet(page);
    await expect(page.locator(".balance")).toHaveText("0.0000182");
    await page
      .getByRole("button", { name: "Open wallet menu", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Refresh", exact: true }),
    ).toBeEnabled();
    await expect(page.locator(".balance")).toHaveText("0.00002", {
      timeout: 8000,
    });
    expect(reads).toBeGreaterThan(1);
    expect(historyReads).toBe(1);
  } finally {
    release();
  }
});

test("a slow tracked token does not delay native balance or block refresh", async ({
  page,
  context,
}) => {
  const abi = new Interface([
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function balanceOf(address) view returns (uint256)",
  ]);
  let release!: () => void;
  const tokenGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let native = "0.1",
    tokenReads = 0;
  await context.route("**/api/balance/**", (route) =>
    route.fulfill({ json: { balance: native, pending: "0" } }),
  );
  await context.route("**/api/tx-history/**", (route) =>
    route.fulfill({ json: { transactions: [] } }),
  );
  await context.route("**/api/rpc/ethereum", async (route) => {
    const body = route.request().postDataJSON();
    const calls = Array.isArray(body) ? body : [body];
    if (
      calls.some(
        (call) =>
          call.method === "eth_call" &&
          abi.getFunction(call.params[0].data.slice(0, 10))?.name ===
            "balanceOf",
      )
    ) {
      tokenReads++;
      await tokenGate;
    }
    const answers = calls.map((call) => {
      let result;
      if (call.method === "eth_chainId") result = "0xaa36a7";
      else if (call.method === "eth_blockNumber") result = "0x1";
      else if (call.method === "eth_getLogs") result = [];
      else if (call.method === "eth_call") {
        const name = abi.getFunction(call.params[0].data.slice(0, 10))!.name;
        result = abi.encodeFunctionResult(name, [
          name === "name"
            ? "Test Token"
            : name === "symbol"
              ? "TEST"
              : name === "decimals"
                ? 18
                : 1n,
        ]);
      } else throw new Error(`Unexpected RPC ${call.method}`);
      return { jsonrpc: "2.0", id: call.id, result };
    });
    await route.fulfill({ json: Array.isArray(body) ? answers : answers[0] });
  });
  try {
    await createWallet(page);
    await page.getByLabel("Network", { exact: true }).selectOption("ethereum");
    await page
      .getByRole("button", { name: "Open wallet menu", exact: true })
      .click();
    await page.getByRole("button", { name: "Add token", exact: true }).click();
    await page.getByLabel("Contract address").fill("0x" + "33".repeat(20));
    await page.getByRole("button", { name: "Look up token" }).click();
    native = "0.25";
    await page.getByRole("button", { name: "Add verified contract" }).click();
    await expect.poll(() => tokenReads).toBe(1);
    await expect(page.locator(".balance")).toHaveText("0.25");
    await page
      .getByRole("button", { name: "Open wallet menu", exact: true })
      .click();
    native = "0.5";
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(page.locator(".balance")).toHaveText("0.5");
    expect(tokenReads).toBe(1);
  } finally {
    release();
  }
});

test("a late previous-network balance cannot replace the selected network", async ({
  page,
  context,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let ethereumStarted = false;
  await context.route("**/api/tx-history/**", (route) =>
    route.fulfill({ json: { transactions: [] } }),
  );
  await context.route("**/api/balance/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes("/ethereum/")) {
      ethereumStarted = true;
      await gate;
    }
    await route.fulfill({
      json: { balance: path.includes("/solana/") ? "2" : "1", pending: "0" },
    });
  });
  try {
    await createWallet(page);
    await page.getByLabel("Network", { exact: true }).selectOption("ethereum");
    await expect.poll(() => ethereumStarted).toBe(true);
    await page.getByLabel("Network", { exact: true }).selectOption("solana");
    await expect(page.locator(".balance")).toHaveText("2");
    const late = page.waitForResponse((response) =>
      response.url().includes("/api/balance/ethereum/"),
    );
    release();
    await late;
    await expect(page.locator(".balance")).toHaveText("2");
  } finally {
    release();
  }
});
