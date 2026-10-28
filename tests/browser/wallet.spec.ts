import { test, expect, BrowserContext } from "@playwright/test";
import { createWallet, password } from "./helpers";
import { readFile } from "node:fs/promises";
async function mockReads(context: BrowserContext, historyNotice?: string) {
  await context.route("**/api/balance/**", (route) =>
    route.fulfill({ json: { balance: "0", pending: "0" } }),
  );
  await context.route("**/api/tx-history/**", (route) =>
    route.fulfill({
      json: {
        transactions: [],
        ...(historyNotice ? { notice: historyNotice } : {}),
      },
    }),
  );
}
test("email setup saves a wallet that locks and unlocks without reopening setup", async ({
  page,
  context,
}) => {
  await mockReads(context);
  await page.goto("/?screen=wallet-setup");
  await page.getByRole("button", { name: "Generate recovery phrase" }).click();
  await page
    .getByLabel("Local vault passphrase", { exact: true })
    .fill(password);
  await page.getByLabel("Repeat passphrase").fill(password);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Save encrypted wallet" }).click();
  await expect(page.locator(".wallet-home")).toBeVisible();
  const address = await page
    .locator(".wallet-home")
    .getAttribute("data-address");
  await page.getByRole("button", { name: "Lock", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Unlock wallet" }),
  ).toBeVisible();
  await page
    .getByLabel("Local vault passphrase", { exact: true })
    .fill(password);
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(page.locator(".wallet-home")).toHaveAttribute(
    "data-address",
    address!,
  );
});

test("six-network funding reports confirmed, pending and failed reads without exposing keys", async ({
  page,
  context,
}) => {
  await mockReads(context);
  await page.setViewportSize({ width: 375, height: 812 });
  await createWallet(page);
  let failed = true;
  await context.route("**/api/balance/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes("/polygon/") && failed)
      return route.fulfill({
        status: 502,
        json: { error: "Test-network provider unavailable" },
      });
    return route.fulfill({
      json: {
        balance: path.includes("/solana/") ? "0.5" : "0",
        pending: path.includes("/bitcoin/") ? "0.0001" : "0",
      },
    });
  });
  await page
    .getByRole("button", { name: "Receive / fund", exact: true })
    .click();
  await page.getByRole("button", { name: "Fund all six networks" }).click();
  await expect(
    page.getByRole("button", { name: "Check balances", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".funding-card")).toHaveCount(6);
  const solana = page.getByRole("region", { name: "Solana Devnet" });
  const bitcoin = page.getByRole("region", { name: "Bitcoin Signet" });
  const polygon = page.getByRole("region", { name: "Polygon Amoy" });
  await expect(solana).toContainText("Funds detected");
  await expect(solana).toContainText("0.5 SOL");
  await expect(bitcoin).toContainText("No confirmed funds yet");
  await expect(bitcoin).toContainText("Pending net change: 0.0001 BTC");
  await expect(polygon).toContainText("Balance unavailable");
  await expect(polygon).not.toContainText("No confirmed funds");
  await expect(
    solana.getByRole("link", { name: "Open faucet" }),
  ).toHaveAttribute("href", "https://faucet.solana.com/");
  const binance = page.getByRole("region", { name: "BNB Testnet" });
  await expect(
    binance.getByRole("link", { name: "Open faucet" }),
  ).toHaveAttribute("href", "https://pow.zalalena.com/bsc");
  await expect(page.getByText("How funding works")).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Ethereum Sepolia" })
      .getByRole("link", { name: "Open faucet" }),
  ).toHaveAttribute("href", "https://sepolia-faucet.pk910.de/");
  await expect(
    page
      .getByRole("region", { name: "Polygon Amoy" })
      .getByRole("link", { name: "Open faucet" }),
  ).toHaveAttribute("href", "https://pow.zalalena.com/polygon");
  await expect(
    page
      .getByRole("region", { name: "Base Sepolia" })
      .getByRole("link", { name: "Open faucet" }),
  ).toHaveAttribute("href", "https://pow.zalalena.com/base");
  await expect(
    bitcoin.getByRole("link", { name: "Open faucet" }),
  ).toHaveAttribute("href", "https://bitcoinsignetfaucet.com/");
  await expect(
    solana.getByRole("link", { name: "Check deposits on explorer" }),
  ).toHaveAttribute("href", /\?cluster=devnet$/);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await solana.getByRole("button", { name: "Copy address" }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(await solana.locator("p.break").textContent());
  await binance.getByText("Faucet not working? Other options").click();
  await binance.getByRole("button", { name: "Copy faucet link" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "https://pow.zalalena.com/bsc",
  );
  await expect(
    binance.getByRole("link", { name: "BNB Chain support options" }),
  ).toBeVisible();
  const pendingDownload = page.waitForEvent("download");
  await page.getByText("Export public addresses").click();
  await page
    .getByRole("button", { name: "Download public receiving addresses" })
    .click();
  const downloaded = await pendingDownload;
  const exported = JSON.parse(
    await readFile((await downloaded.path())!, "utf8"),
  );
  expect(Object.keys(exported).sort()).toEqual(["accounts", "environment"]);
  expect(exported.environment).toBe("testnet");
  expect(exported.accounts).toHaveLength(6);
  for (const account of exported.accounts)
    expect(Object.keys(account).sort()).toEqual([
      "address",
      "name",
      "network",
      "networkId",
      "symbol",
    ]);
  failed = false;
  await page
    .getByRole("button", { name: "Check balances", exact: true })
    .click();
  await expect(polygon).toContainText("No confirmed funds yet");
  await expect(polygon).not.toContainText("provider unavailable");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(375);
  await page.screenshot({
    path: test.info().outputPath("funding-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.locator(".wallet-home")).toBeVisible();
});

test("coin buttons stay centered under the pointer while pressed", async ({
  page,
  context,
}) => {
  await mockReads(context);
  await page.setViewportSize({ width: 375, height: 812 });
  await createWallet(page);
  const orbit = page.locator(".orbit-stage");
  await orbit.scrollIntoViewIfNeeded();
  for (const network of [
    "solana",
    "ethereum",
    "polygon",
    "binance",
    "base",
    "bitcoin",
  ]) {
    const tile = orbit.locator(`.network-tile.${network}`);
    const before = await tile.boundingBox();
    if (!before) throw new Error("Coin bounds unavailable");
    await page.mouse.move(before.x + before.width / 2, before.y + 25);
    await page.mouse.down();
    const pressed = await tile.boundingBox();
    if (!pressed) throw new Error("Pressed coin bounds unavailable");
    expect(
      Math.abs(pressed.x + pressed.width / 2 - before.x - before.width / 2),
    ).toBeLessThan(1);
    await page.mouse.up();
    await expect(page.getByLabel("Network", { exact: true })).toHaveValue(
      network,
    );
  }
});

test("coin selector accepts repeated left and right taps, drags, and keyboard input", async ({
  page,
  context,
}) => {
  await mockReads(context);
  await page.setViewportSize({ width: 375, height: 812 });
  await createWallet(page);
  const orbit = page.locator(".orbit-stage");
  await orbit.scrollIntoViewIfNeeded();
  for (let i = 0; i < 3; i += 1) {
    for (const network of ["solana", "ethereum", "base", "bitcoin"] as const) {
      await orbit.locator(`.network-tile.${network}`).click();
      await expect(page.getByLabel("Network", { exact: true })).toHaveValue(
        network,
      );
      await expect(orbit.locator(`.network-tile.${network}`)).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    }
  }
  const ethereum = orbit.locator(".network-tile.ethereum .network-coin");
  const start = await ethereum.boundingBox();
  const bounds = await orbit.boundingBox();
  if (!start || !bounds) throw new Error("Coin selector bounds unavailable");
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 50, bounds.y + 220, {
    steps: 12,
  });
  await page.mouse.up();
  await expect(page.getByLabel("Network", { exact: true })).not.toHaveValue(
    "bitcoin",
  );
  await orbit.locator(".network-tile.bitcoin").click();
  await expect(page.getByLabel("Network", { exact: true })).toHaveValue(
    "bitcoin",
  );
  await orbit.focus();
  const beforeKey = await page
    .getByLabel("Network", { exact: true })
    .inputValue();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByLabel("Network", { exact: true })).not.toHaveValue(
    beforeKey,
  );
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByLabel("Network", { exact: true })).toHaveValue(
    beforeKey,
  );
});

for (const imported of [false, true]) {
  test(`coin wheel follows circular drags with ${imported ? "four imported" : "six"} networks`, async ({
    page,
    context,
  }) => {
    await mockReads(context);
    await page.setViewportSize({ width: 375, height: 812 });
    if (imported) {
      await page.goto("/");
      await page
        .getByRole("button", { name: "Create or import wallet" })
        .click();
      await page.getByLabel("Wallet source").selectOption("key");
      await page
        .getByLabel("Private key", { exact: true })
        .fill("01".repeat(32));
      await page
        .getByLabel("Local vault passphrase", { exact: true })
        .fill(password);
      await page.getByLabel("Repeat passphrase").fill(password);
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "Save encrypted wallet" }).click();
      await expect(page.locator(".wallet-home")).toBeVisible();
    } else {
      await createWallet(page);
    }
    const orbit = page.locator(".orbit-stage");
    await orbit.scrollIntoViewIfNeeded();
    const networks = await orbit
      .locator(".network-tile")
      .evaluateAll((elements) =>
        elements.map((e) => e.getAttribute("data-network")!),
      );
    expect(networks).toHaveLength(imported ? 4 : 6);
    const initial = await page
      .getByLabel("Network", { exact: true })
      .inputValue();
    const bounds = await orbit.boundingBox();
    if (!bounds) throw new Error("Coin selector bounds unavailable");
    const x = bounds.x + bounds.width / 2,
      y = bounds.y + 140;
    for (const direction of [1, -1]) {
      await page.mouse.move(x, y - 102);
      await page.mouse.down();
      for (let i = 1; i <= 16; i += 1) {
        const angle =
          -Math.PI / 2 +
          (direction * ((2 * Math.PI) / networks.length + 0.1) * i) / 16;
        await page.mouse.move(
          x + Math.cos(angle) * 102,
          y + Math.sin(angle) * 102,
        );
      }
      await page.mouse.up();
      const expected =
        direction === 1
          ? networks[
              (networks.indexOf(initial) - 1 + networks.length) %
                networks.length
            ]
          : initial;
      await expect(page.getByLabel("Network", { exact: true })).toHaveValue(
        expected,
      );
      await page.waitForTimeout(350);
      await expect(page.getByLabel("Network", { exact: true })).toHaveValue(
        expected,
      );
    }
    await orbit.locator(".network-tile.base").click();
    await expect(page.getByLabel("Network", { exact: true })).toHaveValue(
      "base",
    );
  });
}

test.describe("touch coin wheel", () => {
  test.use({ hasTouch: true, viewport: { width: 375, height: 812 } });
  test("touch taps and a circular swipe select once and allow the next tap", async ({
    page,
    context,
  }) => {
    await mockReads(context);
    await createWallet(page);
    const orbit = page.locator(".orbit-stage");
    await orbit.scrollIntoViewIfNeeded();
    for (const network of ["solana", "ethereum", "bitcoin"]) {
      const coin = await orbit
        .locator(`.network-tile.${network} .network-coin`)
        .boundingBox();
      if (!coin) throw new Error("Coin bounds unavailable");
      await page.touchscreen.tap(
        coin.x + coin.width / 2,
        coin.y + coin.height / 2,
      );
      await expect(page.getByLabel("Network", { exact: true })).toHaveValue(
        network,
      );
    }
    const bounds = await orbit.boundingBox();
    if (!bounds) throw new Error("Coin selector bounds unavailable");
    const x = bounds.x + bounds.width / 2,
      y = bounds.y + 140;
    const touch = await context.newCDPSession(page);
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ id: 0, x, y: y - 102 }],
    });
    await orbit.dispatchEvent("pointerdown", {
      pointerId: 999,
      pointerType: "touch",
      isPrimary: false,
      button: 0,
    });
    await orbit.dispatchEvent("pointerup", {
      pointerId: 999,
      pointerType: "touch",
      isPrimary: false,
      button: 0,
    });
    for (let i = 1; i <= 16; i += 1) {
      const angle = -Math.PI / 2 + ((Math.PI / 3 + 0.1) * i) / 16;
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          { id: 0, x: x + Math.cos(angle) * 102, y: y + Math.sin(angle) * 102 },
        ],
      });
    }
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect(page.getByLabel("Network", { exact: true })).toHaveValue(
      "solana",
    );
    await page.waitForTimeout(350);
    await expect(page.getByLabel("Network", { exact: true })).toHaveValue(
      "solana",
    );
    const bitcoin = await orbit
      .locator(".network-tile.bitcoin .network-coin")
      .boundingBox();
    if (!bitcoin) throw new Error("Coin bounds unavailable");
    await page.touchscreen.tap(
      bitcoin.x + bitcoin.width / 2,
      bitcoin.y + bitcoin.height / 2,
    );
    await expect(page.getByLabel("Network", { exact: true })).toHaveValue(
      "bitcoin",
    );
    await touch.detach();
  });
});

test("encrypted onboarding, six networks, lock/reload/unlock and accessible receive screen", async ({
  page,
  context,
}) => {
  await mockReads(
    context,
    "Live native activity from blocks 50415353–50415364. Load older to scan earlier blocks.",
  );
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
  const historyDetails = page.locator(".history-note");
  await expect(historyDetails).toBeVisible();
  await expect(historyDetails).not.toHaveJSProperty("open", true);
  await expect(historyDetails.locator("p")).toBeHidden();
  await historyDetails.locator("summary").click();
  await expect(historyDetails.locator("p")).toContainText("50415353–50415364");
  await historyDetails.locator("summary").click();
  await expect(historyDetails.locator("p")).toBeHidden();
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
  // Start outside the centered menu and sweep across the empty inner orbit.
  // The earlier path ended on the lower coin and could be treated as a tap.
  await page.mouse.move(originX + 60, originY);
  await page.mouse.down();
  await page.mouse.move(originX, originY - 60, { steps: 8 });
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
  await expect(page.getByRole("link", { name: "Open faucet" })).toHaveAttribute(
    "href",
    "https://bitcoinsignetfaucet.com/",
  );
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
  await expect(
    page.getByRole("heading", { name: "Unlock wallet" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download locked encrypted vault" }),
  ).toBeHidden();
  await page.getByText("Wallet help", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Download locked encrypted vault" }),
  ).toBeVisible();
  await page.getByText("Wallet help", { exact: true }).click();
  await page.screenshot({
    path: "/private/tmp/extrust-unlock-preview.png",
    fullPage: true,
  });
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
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(
    page.getByLabel("Wallet cloud password (not your Google password)"),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Use a separate cloud password with at least 12 characters.",
    ),
  ).toBeVisible();
  await page.getByLabel("Email").fill("wallet-owner@example.com");
  await page
    .getByLabel("Wallet cloud password (not your Google password)")
    .fill("too-short");
  await page
    .getByRole("button", { name: "Create wallet cloud account" })
    .click();
  await expect(
    page.getByText("Use at least 12 characters for the cloud account password"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByText("Wallet settings and recovery").click();
  const evidenceDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export transaction evidence" })
    .click();
  expect((await evidenceDownload).suggestedFilename()).toBe(
    "transactions-bitcoin.json",
  );
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
    .getByRole("button", {
      name: "Restore encrypted file or cloud backup",
    })
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

test("email confirmation opens safe wallet setup instead of the locked vault", async ({
  page,
  context,
}) => {
  await mockReads(context);
  await createWallet(page);
  await page.getByRole("button", { name: "Lock", exact: true }).click();
  await page.goto("/?screen=wallet-setup");
  await expect(
    page.getByRole("heading", { name: "Create or import" }),
  ).toBeVisible();
  await expect(
    page.getByText("A locked wallet already exists on this browser."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Generate recovery phrase" }),
  ).toBeVisible();
  await expect(page).toHaveURL("/");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Unlock wallet" }),
  ).toBeVisible();
});

test("locked wallet offers a safe create or phrase-recovery path", async ({
  page,
  context,
}) => {
  await mockReads(context);
  await createWallet(page);
  await page.getByRole("button", { name: "Lock", exact: true }).click();
  await page.getByText("Wallet help", { exact: true }).click();
  await page
    .getByRole("button", { name: "Create a different wallet", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Generate recovery phrase" }),
  ).toBeVisible();
  await expect(
    page.getByText("A locked wallet already exists on this browser."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download current encrypted vault" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Generate recovery phrase" }).click();
  await page
    .getByLabel("Local vault passphrase", { exact: true })
    .fill(password);
  await page.getByLabel("Repeat passphrase").fill(password);
  await page
    .getByLabel(
      "I saved my recovery information and am using test assets only.",
    )
    .check();
  await expect(
    page.getByRole("button", { name: "Save encrypted wallet" }),
  ).toBeDisabled();
  await page
    .getByLabel(
      "I saved the current encrypted vault and understand that continuing replaces this browser’s active wallet.",
    )
    .check();
  await page.getByRole("button", { name: "Save encrypted wallet" }).click();
  await expect(page.locator(".wallet-home")).toBeVisible();
});
