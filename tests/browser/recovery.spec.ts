import { test, expect, Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { password } from "./helpers";

async function addresses(page: Page) {
  const result: Record<string, string> = {};
  for (const network of [
    "ethereum",
    "polygon",
    "binance",
    "base",
    "solana",
    "bitcoin",
  ]) {
    await page.getByLabel("Network", { exact: true }).selectOption(network);
    result[network] = (await page
      .locator(".wallet-home")
      .getAttribute("data-address"))!;
  }
  return result;
}

test("12-word recovery restores all six original addresses and unlocks with the new password", async ({
  page,
  context,
}) => {
  page.setDefaultTimeout(10000);
  await context.route("**/api/balance/**", (route) =>
    route.fulfill({ json: { balance: "0", pending: "0" } }),
  );
  await context.route("**/api/tx-history/**", (route) =>
    route.fulfill({ json: { transactions: [] } }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Recover wallet", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Recover wallet", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Generate recovery phrase" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page
    .getByRole("button", { name: "Create wallet", exact: true })
    .click();
  await page.getByRole("button", { name: "Generate recovery phrase" }).click();
  const phrase = (await page
    .getByLabel("Recovery phrase", { exact: true })
    .textContent())!;
  await page
    .getByLabel("Local vault passphrase", { exact: true })
    .fill(password);
  await page.getByLabel("Repeat passphrase").fill(password);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Save encrypted wallet" }).click();
  await expect(page.locator(".wallet-home")).toBeVisible();
  const originalAddresses = await addresses(page);
  const originalVault = await page.evaluate(() =>
    localStorage.getItem("extrust:testnet:v2:vault"),
  );
  await page.getByRole("button", { name: "Lock", exact: true }).click();
  await page
    .getByRole("button", { name: "Recover wallet", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Recover wallet", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Generate recovery phrase" }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Wallet source")).toHaveCount(0);
  const backupDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download current encrypted vault" })
    .click();
  expect(await readFile((await (await backupDownload).path())!, "utf8")).toBe(
    originalVault,
  );
  const newPassword = "New recovery browser password 2026";
  await page
    .getByRole("textbox", { name: "Recovery phrase", exact: true })
    .fill("abandon ".repeat(12).trim());
  await page
    .getByLabel("New local vault passphrase", { exact: true })
    .fill(newPassword);
  await page.getByLabel("Repeat passphrase").fill("different password");
  await expect(
    page.getByText("Passphrases do not match.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Repeat passphrase").fill(newPassword);
  await page
    .getByLabel(
      "I saved my recovery information and am using test assets only.",
    )
    .check();
  await expect(
    page.getByRole("button", { name: "Recover wallet", exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate(() => localStorage.getItem("extrust:testnet:v2:vault")),
  ).toBe(originalVault);
  await page
    .getByLabel(
      "I saved the current encrypted vault and understand that continuing replaces this browser’s active wallet.",
    )
    .check();
  await page
    .getByRole("button", { name: "Recover wallet", exact: true })
    .click();
  await expect(page.locator(".notice.error").last()).toContainText(
    "Invalid recovery phrase",
  );
  await expect(page.locator(".notice.error").last()).toContainText(
    "checksum does not match",
  );
  await expect(page.locator(".notice.error").last()).not.toContainText(
    "abandon",
  );
  await expect(page.locator("#recovery-word-count")).toContainText("12 words");
  expect(
    await page.evaluate(() => localStorage.getItem("extrust:testnet:v2:vault")),
  ).toBe(originalVault);
  await page
    .getByRole("textbox", { name: "Recovery phrase", exact: true })
    .fill(phrase.toUpperCase().split(" ").join("\n"));
  await page
    .getByRole("button", { name: "Recover wallet", exact: true })
    .click();
  await expect(page.locator(".wallet-home")).toBeVisible();
  expect(await addresses(page)).toEqual(originalAddresses);
  await page.getByRole("button", { name: "Lock", exact: true }).click();
  await page.reload();
  await page
    .getByLabel("Local vault passphrase", { exact: true })
    .fill(password);
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(page.locator(".notice.error")).toContainText(
    "Incorrect passphrase",
  );
  await page
    .getByLabel("Local vault passphrase", { exact: true })
    .fill(newPassword);
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(page.locator(".wallet-home")).toBeVisible();
  expect(await addresses(page)).toEqual(originalAddresses);
});
