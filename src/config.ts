import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import type { SkillariumConfig } from "./types.js";

export const DEFAULT_CONFIG: SkillariumConfig = {
  version: 1,
  title: "Skillarium Observatory",
  include: [
    "skills/**/SKILL.md",
    ".agents/skills/**/SKILL.md",
    ".codex/skills/**/SKILL.md",
    ".claude/skills/**/SKILL.md",
  ],
  exclude: ["**/node_modules/**", "**/.git/**", ".skillarium/site/**"],
  outputDir: ".skillarium/site",
  evidenceDir: ".skillarium/evidence",
  failOn: "critical",
  overrides: {},
};

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function findConfig(root: string): Promise<string | null> {
  const candidates = [
    path.join(root, ".skillarium.yml"),
    path.join(root, ".skillarium.yaml"),
    path.join(root, ".skillarium", "config.yml"),
  ];
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  return null;
}

export async function loadConfig(
  root: string,
  explicitPath?: string,
): Promise<{ config: SkillariumConfig; configPath: string | null }> {
  const configPath = explicitPath
    ? path.resolve(root, explicitPath)
    : await findConfig(root);
  if (!configPath) return { config: { ...DEFAULT_CONFIG }, configPath: null };

  const raw = parse(await readFile(configPath, "utf8")) as Partial<SkillariumConfig> | null;
  if (!raw || (raw.version !== undefined && raw.version !== 1)) {
    throw new Error(`Unsupported Skillarium config at ${configPath}`);
  }

  return {
    config: {
      ...DEFAULT_CONFIG,
      ...raw,
      include: raw.include ?? DEFAULT_CONFIG.include,
      exclude: raw.exclude ?? DEFAULT_CONFIG.exclude,
      overrides: raw.overrides ?? {},
    },
    configPath,
  };
}
