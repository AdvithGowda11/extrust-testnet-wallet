import { test, expect, BrowserContext } from "@playwright/test";
import { createWallet, password } from "./helpers";
async function mockReads(context: BrowserContext) {
  await context.route("**/api/balance/**", (route) =>
    route.fulfill({ json: { balance: "0", pending: "0" } }),
  );
  await context.route("**/api/tx-history/**", (route) =>
    route.fulfill({ json: { transactions: [] } }),
  );
}
test("encrypted onboarding, six networks, lock/reload/unlock and accessible receive screen", async ({
  page,
  context,
}) => {
  await mockReads(context);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await createWallet(page);
  for (const network of [
    "ethereum",
    "polygon",
    "binance",
    "base",
    "solana",
    "bitcoin",
  ]) {
    await page.getByLabel("Network", { exact: true }).selectOption(network);
    await expect(page.locator(".balance")).toContainText("0");
  }
  await page.getByRole("button", { name: "Receive / fund" }).click();
  await expect(
    page.getByRole("heading", { name: "Receive test coins" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open test-coin funding options" }),
  ).toHaveAttribute("href", "https://signetfaucet.com/");
  await page.screenshot({
    path: test.info().outputPath("receive.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Lock", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Unlock wallet" }),
  ).toBeVisible();
  await page.reload();
  await page.getByLabel("Local vault passphrase").fill("incorrect password");
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(page.locator(".notice.error")).toContainText(
    "Incorrect passphrase",
  );
  await page.getByLabel("Local vault passphrase").fill(password);
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Wallet", exact: true }),
  ).toBeVisible();
  const vault = await page.evaluate(() =>
    localStorage.getItem("extrust:testnet:v2:vault"),
  );
  expect(vault).toContain("ciphertext");
  expect(vault).not.toContain("mnemonic");
  expect(errors).toEqual([]);
});
test("network failure is unavailable rather than a fabricated zero balance", async ({
  page,
  context,
}) => {
  await mockReads(context);
  await createWallet(page);
  await context.unroute("**/api/balance/**");
  await context.route("**/api/balance/**", (route) =>
    route.fulfill({ status: 502, json: { error: "Provider unavailable" } }),
  );
  await page.getByLabel("Network", { exact: true }).selectOption("base");
  await expect(page.locator(".notice.error").first()).toContainText(
    "Provider unavailable",
  );
  await expect(page.locator(".balance")).toContainText("—");
});
test("server rejects mainnet paths, unsafe RPC methods, oversized batches and unauthenticated backups", async ({
  request,
}) => {
  expect((await request.post("/api/rpc/mainnet", { data: {} })).status()).toBe(
    400,
  );
  expect(
    (
      await request.post("/api/rpc/ethereum", {
        data: {
          jsonrpc: "2.0",
          id: 1,
          method: "personal_unlockAccount",
          params: [],
        },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/rpc/ethereum", {
        data: Array(11).fill({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_chainId",
          params: [],
        }),
      })
    ).status(),
  ).toBe(403);
  const backup = await request.get("/api/backup");
  expect([401, 503]).toContain(backup.status());
});

test("restore over a locked vault requires confirmation and preserves account addresses", async ({
  page,
  context,
}) => {
  await mockReads(context);
  await createWallet(page);
  const originalAddress = await page
    .locator(".balance-card > .break")
    .textContent();
  const backup = await page.evaluate(() =>
    localStorage.getItem("extrust:testnet:v2:vault")!,
  );
  await page.getByRole("button", { name: "Lock", exact: true }).click();
  await page
    .getByRole("button", { name: "Restore another encrypted backup" })
    .click();
  await page.getByLabel("Wallet backup file").setInputFiles({
    name: "wallet.json",
    mimeType: "application/json",
    buffer: Buffer.from(backup),
  });
  await page.getByLabel("Backup passphrase", { exact: true }).fill(password);
  await page.getByLabel("New local vault passphrase").fill(password);
  await page.getByLabel("Repeat local passphrase").fill(password);
  await page.getByRole("button", { name: "Restore file", exact: true }).click();
  await expect(page.locator(".notice.error")).toContainText(
    "Confirm replacement",
  );
  expect(
    await page.evaluate(() => localStorage.getItem("extrust:testnet:v2:vault")),
  ).toEqual(backup);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Restore file", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Wallet", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".balance-card > .break")).toHaveText(
    originalAddress!,
  );
});
