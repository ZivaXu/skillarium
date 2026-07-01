import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { expect, test } from "@playwright/test";

const outputDir = path.resolve(".skillarium/e2e-site");
const pageUrl = pathToFileURL(path.join(outputDir, "index.html")).href;

test.beforeAll(() => {
  execFileSync(
    process.execPath,
    ["dist/cli.js", "build", "--root", "examples/team-skills", "--out-dir", outputDir, "--fail-on", "never"],
    { stdio: "pipe" },
  );
});

test("renders real repository telemetry and supports selection", async ({ page }) => {
  await page.goto(pageUrl);
  await expect(page.getByRole("heading", { name: "Fitness Frontier" })).toBeVisible();
  await expect(page.locator("#metric-skills")).toHaveText("5");
  await expect(page.locator("#metric-evidence")).toHaveText("2/5");
  await page.locator(".skill-row", { hasText: "Market Scan" }).click();
  await expect(page.locator("#selected-name")).toHaveText("Market Scan");
  await expect(page.locator("#score-evidence")).toHaveText("none");
  await expect(page.locator("#risk-list")).toContainText("external URLs");
});

test("filters release channels without horizontal overflow", async ({ page }) => {
  await page.goto(pageUrl);
  await page.getByRole("button", { name: "Stable", exact: true }).click();
  await expect(page.locator("#visible-count")).toHaveText("3 visible");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
