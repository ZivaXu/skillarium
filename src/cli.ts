#!/usr/bin/env node

import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Command, Option } from "commander";
import { loadConfig } from "./config.js";
import { initializeProject } from "./init.js";
import { renderSite } from "./render/site.js";
import { scanRepository } from "./scanner.js";
import type { Severity, SkillariumManifest } from "./types.js";

const program = new Command();

program
  .name("skillarium")
  .description("Build a GitHub-native fitness frontier for agent skills")
  .version("0.1.0");

program
  .command("init")
  .description("Create Skillarium config and GitHub Pages workflow")
  .option("--root <path>", "project root", ".")
  .option("--force", "overwrite existing generated files", false)
  .action(async (options: { root: string; force: boolean }) => {
    const root = path.resolve(options.root);
    const result = await initializeProject(root, options.force);
    result.files.forEach((file) => console.log(`${file.status.padEnd(7)} ${file.path}`));
    console.log("\nREADME embed after Pages is enabled:\n");
    console.log(result.embed);
  });

async function manifestFor(options: {
  root: string;
  config?: string;
  paths: string[];
}): Promise<{ manifest: SkillariumManifest; root: string; outputDir: string; failOn: "critical" | "high" | "never" }> {
  const root = path.resolve(options.root);
  const { config } = await loadConfig(root, options.config);
  const manifest = await scanRepository({ root, inputs: options.paths, config });
  return {
    manifest,
    root,
    outputDir: path.resolve(root, config.outputDir),
    failOn: config.failOn,
  };
}

program
  .command("scan")
  .description("Scan SKILL.md files and emit a typed manifest")
  .argument("[paths...]", "explicit skill files or directories")
  .option("--root <path>", "project root", ".")
  .option("--config <path>", "config path")
  .option("-o, --output <path>", "write JSON to a file instead of stdout")
  .action(async (paths: string[], options: { root: string; config?: string; output?: string }) => {
    const result = await manifestFor({ ...options, paths });
    const json = `${JSON.stringify(result.manifest, null, 2)}\n`;
    if (options.output) {
      const output = path.resolve(result.root, options.output);
      await mkdir(path.dirname(output), { recursive: true });
      await writeFile(output, json);
      console.log(`manifest ${path.relative(result.root, output)}`);
    } else {
      process.stdout.write(json);
    }
  });

function hasFailure(manifest: SkillariumManifest, threshold: "critical" | "high" | "never"): boolean {
  if (threshold === "never") return false;
  const severities: Severity[] = threshold === "high" ? ["high", "critical"] : ["critical"];
  return manifest.skills.some(
    (skill) => skill.readiness.status === "blocked" || skill.risks.some((risk) => severities.includes(risk.severity)),
  );
}

async function writeGithubSummary(manifest: SkillariumManifest, siteDir: string): Promise<void> {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  const lines = [
    "## Skillarium Fitness Frontier",
    "",
    `| Skills | Readiness | Current evidence | High risks | Status |`,
    `| ---: | ---: | ---: | ---: | --- |`,
    `| ${manifest.summary.skillCount} | ${manifest.summary.averageReadiness} | ${manifest.summary.currentEvidence}/${manifest.summary.skillCount} | ${manifest.summary.highRiskFlags} | ${manifest.summary.status} |`,
    "",
    `Generated site: \`${siteDir}\``,
    "",
  ];
  await appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join("\n"));
}

program
  .command("build")
  .description("Generate manifest, Fitness Frontier cards, and static observatory")
  .argument("[paths...]", "explicit skill files or directories")
  .option("--root <path>", "project root", ".")
  .option("--config <path>", "config path")
  .option("--out-dir <path>", "override generated site directory")
  .addOption(new Option("--fail-on <severity>", "CI failure threshold").choices(["critical", "high", "never"]))
  .action(async (paths: string[], options: { root: string; config?: string; outDir?: string; failOn?: "critical" | "high" | "never" }) => {
    const result = await manifestFor({ ...options, paths });
    const outputDir = options.outDir ? path.resolve(result.root, options.outDir) : result.outputDir;
    await renderSite({ manifest: result.manifest, outputDir });
    await writeGithubSummary(result.manifest, path.relative(result.root, outputDir));
    const summary = result.manifest.summary;
    console.log(`built ${path.relative(result.root, outputDir)} · ${summary.skillCount} skills · readiness ${summary.averageReadiness} · evidence ${summary.currentEvidence}/${summary.skillCount} · ${summary.status}`);
    if (hasFailure(result.manifest, options.failOn ?? result.failOn)) process.exitCode = 2;
  });

program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`skillarium: ${message}`);
  process.exitCode = 1;
});
