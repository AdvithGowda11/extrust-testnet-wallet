import { test, expect } from "@playwright/test";
import { createWallet } from "./helpers";

for (const [name, width, height] of [
  ["desktop", 1440, 900],
  ["phone", 430, 932],
  ["short phone", 375, 667],
] as const) {
  test(`${name} keeps long wallet content inside a scrollable phone screen`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height });
    await context.route("**/api/balance/**", (route) =>
      route.fulfill({ json: { balance: "0", pending: "0" } }),
    );
    await context.route("**/api/tx-history/**", (route) =>
      route.fulfill({ json: { transactions: [] } }),
    );
    await createWallet(page);
    const frame = page.locator(".mobile-container");
    expect(await frame.evaluate((element) => element.scrollTop)).toBe(0);
    await page.screenshot({ path: test.info().outputPath(`wallet-frame-${name}.png`) });
    await page
      .getByRole("button", { name: "Receive / fund", exact: true })
      .click();
    expect(await frame.evaluate((element) => element.scrollTop)).toBe(0);
    await page.getByRole("button", { name: "Fund all six networks" }).click();
    await expect(page.locator(".funding-card")).toHaveCount(6);

    const initial = await frame.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
        scrollbarWidth: getComputedStyle(element).scrollbarWidth,
      };
    });
    expect(initial.scrollHeight).toBeGreaterThan(initial.clientHeight);
    expect(initial.scrollbarWidth).toBe("none");
    if (width > 520) {
      expect(initial.height).toBeLessThanOrEqual(height - 32);
      expect(initial.width / initial.height).toBeCloseTo(1320 / 2868, 2);
    } else {
      expect(initial.width).toBe(width);
      expect(initial.height).toBe(height);
    }

    await page.mouse.move(width / 2, height / 2);
    await page.mouse.wheel(0, 450);
    await expect
      .poll(() => frame.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
    await page.getByRole("region", { name: "Bitcoin Signet" }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("region", { name: "Bitcoin Signet" })).toBeInViewport();
    expect(await frame.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: test.info().outputPath(`funding-frame-${name}.png`),
    });
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(page.locator(".wallet-home")).toBeVisible();
    expect(await frame.evaluate((element) => element.scrollTop)).toBe(0);
  });
}
