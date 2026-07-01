import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { renderFitnessCard } from "../src/render/card.js";
import { renderSite } from "../src/render/site.js";
import { scanRepository } from "../src/scanner.js";

const outputs: string[] = [];

afterEach(async () => {
  await Promise.all(outputs.splice(0).map((output) => rm(output, { recursive: true, force: true })));
});

describe("rendering", () => {
  it("renders a self-contained GitHub-safe SVG", async () => {
    const root = path.resolve("examples/team-skills");
    const { config } = await loadConfig(root);
    const manifest = await scanRepository({ root, config, now: new Date("2026-06-30T00:00:00.000Z") });
    const svg = renderFitnessCard(manifest, "dark");

    expect(svg).toContain("<svg");
    expect(svg).toContain("FITNESS FRONTIER");
    expect(svg).toContain("CURRENT EVIDENCE");
    expect(svg).not.toContain("<script");
    expect(svg).not.toMatch(/(?:href|src)=["']https?:/);
  });

  it("generates a directly openable site and both card themes", async () => {
    const root = path.resolve("examples/team-skills");
    const { config } = await loadConfig(root);
    const manifest = await scanRepository({ root, config });
    const outputDir = await mkdtemp(path.join(os.tmpdir(), "skillarium-site-"));
    outputs.push(outputDir);
    await renderSite({ manifest, outputDir });

    const [html, app, card, darkCard, json] = await Promise.all([
      readFile(path.join(outputDir, "index.html"), "utf8"),
      readFile(path.join(outputDir, "app.js"), "utf8"),
      readFile(path.join(outputDir, "card.svg"), "utf8"),
      readFile(path.join(outputDir, "card-dark.svg"), "utf8"),
      readFile(path.join(outputDir, "manifest.json"), "utf8"),
    ]);

    expect(html).toContain("Northstar Agent Skills");
    expect(html).not.toContain("__SKILLARIUM_DATA__");
    expect(app).toContain("manifest.skills");
    expect(html).toContain("readiness and evidence are measured separately");
    expect(card).not.toEqual(darkCard);
    expect(JSON.parse(json).summary.currentEvidence).toBe(2);
  });
});
