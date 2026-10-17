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
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await expect(page.locator(".welcome-hero")).toBeVisible();
  expect(
    await page.evaluate(() => getComputedStyle(document.body).fontFamily),
  ).toContain("Athelas");
  expect(
    await page
      .locator(".screen-header h1")
      .evaluate((el) => getComputedStyle(el).fontFamily),
  ).toContain("Vanguard CF");
  await page.screenshot({
    path: test.info().outputPath("welcome-mobile.png"),
    fullPage: true,
  });
  await createWallet(page);
  await expect(page.locator(".balance-card")).toBeVisible();
  const loadedBinanceFonts = await page.evaluate(async () =>
    document.fonts.load("16px BinancePlex"),
  );
  expect(loadedBinanceFonts.length).toBeGreaterThan(0);
  expect(
    await page
      .locator(".balance")
      .evaluate((el) => getComputedStyle(el).fontFamily),
  ).toContain("BinancePlex");
  expect(
    await page
      .locator(".wallet-address-button")
      .evaluate((el) => getComputedStyle(el).fontFamily),
  ).toContain("BinancePlex");
  await expect(page.locator(".wallet-primary-actions")).toBeVisible();
  await expect(page.locator(".balance")).toContainText("0");
  await page.screenshot({
    path: test.info().outputPath("dashboard-mobile.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(375);
  const orbit = page.locator(".orbit-stage");
  await expect(orbit).toBeVisible();
  await expect(orbit.locator(".network-tile")).toHaveCount(6);
  await expect(orbit.locator(".network-logo")).toHaveCount(6);
  for (const network of [
    "ethereum",
    "polygon",
    "binance",
    "base",
    "solana",
    "bitcoin",
  ]) {
    const coin = orbit.locator(`.network-tile.${network}`);
    await coin.click();
    expect(
      await coin.evaluate((el) => getComputedStyle(el).backgroundColor),
    ).toBe("rgba(0, 0, 0, 0)");
    await expect(coin).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel("Network", { exact: true })).toHaveValue(
      network,
    );
    await page.waitForTimeout(300);
    const bounds = await orbit.boundingBox();
    if (!bounds) throw new Error("Circular coin selector is not laid out");
    const centers = await orbit.locator(".network-coin").evaluateAll((els) =>
      els.map((el) => {
        const rect = el.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      }),
    );
    for (const center of centers) {
      const radius = Math.hypot(
        (center.x - (bounds.x + bounds.width / 2)) / 110,
        (center.y - (bounds.y + 140)) / 102,
      );
      expect(radius).toBeCloseTo(1, 1);
    }
  }
  const orbitGeometry = await orbit
    .locator(".network-coin")
    .evaluateAll((els) =>
      els.map((el) => {
        const rect = el.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      }),
    );
  const orbitBounds = await orbit.boundingBox();
  if (!orbitBounds) throw new Error("Circular coin selector is not laid out");
  expect(orbitGeometry).toHaveLength(6);
  const centerX = orbitBounds.x + orbitBounds.width / 2;
  const centerY = orbitBounds.y + 140;
  for (let i = 0; i < orbitGeometry.length; i += 1) {
    const point = orbitGeometry[i];
    expect(point.x).toBeGreaterThanOrEqual(20);
    expect(point.x).toBeLessThanOrEqual(355);
    const radius = Math.hypot(
      (point.x - centerX) / 110,
      (point.y - centerY) / 102,
    );
    expect(radius).toBeCloseTo(1, 1);
    for (let j = i + 1; j < orbitGeometry.length; j += 1) {
      const other = orbitGeometry[j];
      expect(Math.hypot(point.x - other.x, point.y - other.y)).toBeGreaterThan(
        61,
      );
    }
  }
  for (const network of [
    "ethereum",
    "polygon",
    "binance",
    "base",
    "solana",
    "bitcoin",
  ]) {
    const coin = orbit.locator(`.network-tile.${network}`);
    await coin.click();
    await expect(coin).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel("Network", { exact: true })).toHaveValue(
      network,
    );
  }
  await page.waitForTimeout(300);
  const menuBox = await page.locator(".tray-menu").boundingBox();
  const labelBoxes = await orbit
    .locator(".network-tile > span:last-child")
    .evaluateAll((els) =>
      els.map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
        };
      }),
    );
  if (!menuBox) throw new Error("Wallet menu control is not laid out");
  for (const label of labelBoxes) {
    expect(
      menuBox.x < label.right &&
        menuBox.x + menuBox.width > label.left &&
        menuBox.y < label.bottom &&
        menuBox.y + menuBox.height > label.top,
    ).toBe(false);
  }
  const beforeDrag = await page
    .getByLabel("Network", { exact: true })
    .inputValue();
  const dragBounds = await orbit.boundingBox();
  if (!dragBounds)
    throw new Error("Coin selector is not laid out for dragging");
  const originX = dragBounds.x + dragBounds.width / 2;
  const originY = dragBounds.y + 140;
  await page.mouse.move(originX + 40, originY);
  await page.mouse.down();
  await page.mouse.move(originX + 27, originY + 48, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByLabel("Network", { exact: true })).not.toHaveValue(
    beforeDrag,
  );
  await page.getByLabel("Network", { exact: true }).selectOption("ethereum");
  await page
    .locator(".wallet-primary-actions")
    .getByRole("button", { name: "Open menu" })
    .click();
  await expect(page.getByRole("button", { name: "Add token" })).toBeVisible();
  await page
    .locator(".wallet-primary-actions")
    .getByRole("button", { name: "Open menu" })
    .click();
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
  await page.getByRole("button", { name: "Back", exact: true }).click();
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
  await expect(page.locator(".wallet-home")).toBeVisible();
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
  await expect(page.getByText("Connection interrupted")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry network connection" }),
  ).toBeVisible();
  await expect(page.locator(".balance")).toContainText("—");
  await context.unroute("**/api/balance/**");
  await context.route("**/api/balance/**", (route) =>
    route.fulfill({ json: { balance: "0", pending: "0" } }),
  );
  await page.getByRole("button", { name: "Retry network connection" }).click();
  await expect(page.locator(".balance")).toContainText("0");
  await expect(page.getByText("Connection interrupted")).toHaveCount(0);
});
test("offline guidance and failed transfer review preserve user input", async ({
  page,
  context,
}) => {
  await mockReads(context);
  await createWallet(page);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await expect(page.getByText("You’re offline")).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByText("You’re offline")).toHaveCount(0);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByLabel("Recipient address").fill("invalid-address");
  await page.getByLabel("Amount", { exact: true }).fill("0.01");
  await page.getByRole("button", { name: "Review transfer" }).click();
  await expect(page.getByText("Could not review transfer")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Try review again" }),
  ).toBeVisible();
  await expect(page.getByLabel("Recipient address")).toHaveValue(
    "invalid-address",
  );
  await expect(page.getByLabel("Amount", { exact: true })).toHaveValue("0.01");
});
test("wallet controls open settings, backup, exports, and keep the active vault", async ({
  page,
  context,
}) => {
  await mockReads(context);
  await createWallet(page);
  await page.getByRole("button", { name: "Open wallet menu" }).click();
  await expect(
    page.getByRole("heading", { name: "Quick actions" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await page
    .getByRole("button", { name: "Export encrypted wallet / recovery keys" })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Export and recovery" }),
  ).toBeVisible();
  const vaultDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download encrypted wallet" }).click();
  expect((await vaultDownload).suggestedFilename()).toBe(
    "extrust-testnet-wallet.json",
  );
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page
    .locator(".wallet-primary-actions")
    .getByRole("button", { name: "Open menu" })
    .click();
  await page
    .getByRole("button", { name: "Cloud backup and restore" })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Backup and restore" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  const evidenceDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export transaction evidence" })
    .click();
  expect((await evidenceDownload).suggestedFilename()).toBe(
    "transactions-bitcoin.json",
  );
  await page.getByText("Wallet settings and recovery").click();
  await expect(
    page.getByRole("button", { name: "Remove local wallet" }),
  ).toBeVisible();
  await expect(page.locator(".wallet-home")).toBeVisible();
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
    .locator(".wallet-home")
    .getAttribute("data-address");
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
  await expect(page.locator(".wallet-home")).toBeVisible();
  await expect(page.locator(".wallet-home")).toHaveAttribute(
    "data-address",
    originalAddress!,
  );
});
