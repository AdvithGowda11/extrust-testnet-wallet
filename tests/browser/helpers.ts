import { expect, Page } from "@playwright/test";
export const password = "A long browser test passphrase";
export async function createWallet(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create or import wallet" }).click();
  await page.getByRole("button", { name: "Generate recovery phrase" }).click();
  await page
    .getByLabel("Local vault passphrase", { exact: true })
    .fill(password);
  await page.getByLabel("Repeat passphrase").fill(password);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Save encrypted wallet" }).click();
  await expect(
    page.getByRole("heading", { name: "Wallet", exact: true }),
  ).toBeVisible();
}
