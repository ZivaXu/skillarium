import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SkillariumManifest } from "../types.js";
import { renderFitnessCard } from "./card.js";

function inlineJson(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

export async function renderSite(args: {
  manifest: SkillariumManifest;
  outputDir: string;
}): Promise<void> {
  const templateDir = new URL("../../site-template/", import.meta.url);
  const outputDir = path.resolve(args.outputDir);
  await mkdir(outputDir, { recursive: true });
  await cp(templateDir, outputDir, { recursive: true });

  const indexPath = path.join(outputDir, "index.html");
  const template = await readFile(indexPath, "utf8");
  const html = template
    .replace("__SKILLARIUM_TITLE__", args.manifest.project.title)
    .replace("__SKILLARIUM_DATA__", inlineJson(args.manifest));

  await Promise.all([
    writeFile(indexPath, html),
    writeFile(path.join(outputDir, "manifest.json"), `${JSON.stringify(args.manifest, null, 2)}\n`),
    writeFile(path.join(outputDir, "card.svg"), renderFitnessCard(args.manifest, "light")),
    writeFile(path.join(outputDir, "card-dark.svg"), renderFitnessCard(args.manifest, "dark")),
  ]);
}
