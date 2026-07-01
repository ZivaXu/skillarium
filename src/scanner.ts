import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import matter from "gray-matter";
import { analyzeReadiness, analyzeRisks, digestContent, validSkillName } from "./analysis.js";
import { loadEvidence, summarizeEvidence } from "./evidence.js";
import type {
  Channel,
  Ecosystem,
  HealthStatus,
  SkillRecord,
  SkillariumConfig,
  SkillariumManifest,
} from "./types.js";

function inferEcosystem(sourcePath: string): Ecosystem[] {
  const normalized = sourcePath.split(path.sep).join("/");
  if (normalized.includes("/.codex/skills/") || normalized.startsWith(".codex/skills/")) return ["codex"];
  if (normalized.includes("/.claude/skills/") || normalized.startsWith(".claude/skills/")) return ["claude"];
  if (normalized.includes("/.agents/skills/") || normalized.startsWith(".agents/skills/") || normalized.startsWith("skills/")) {
    return ["agent-skills"];
  }
  return ["unknown"];
}

function inferChannel(data: Record<string, unknown>): Channel {
  const direct = data.channel;
  const metadata = data.metadata && typeof data.metadata === "object"
    ? (data.metadata as Record<string, unknown>)
    : null;
  const skillarium = metadata?.skillarium && typeof metadata.skillarium === "object"
    ? (metadata.skillarium as Record<string, unknown>)
    : null;
  const candidate = skillarium?.channel ?? direct;
  return candidate === "stable" || candidate === "beta" || candidate === "deprecated"
    ? candidate
    : "candidate";
}

function inferTags(data: Record<string, unknown>): string[] {
  const metadata = data.metadata && typeof data.metadata === "object"
    ? (data.metadata as Record<string, unknown>)
    : null;
  const skillarium = metadata?.skillarium && typeof metadata.skillarium === "object"
    ? (metadata.skillarium as Record<string, unknown>)
    : null;
  const tags = skillarium?.tags;
  return Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === "string") : [];
}

function readinessStatus(score: number, hasBlockingCheck: boolean): SkillRecord["readiness"]["status"] {
  if (hasBlockingCheck) return "blocked";
  if (score >= 90) return "ready";
  if (score >= 75) return "review";
  return "attention";
}

function healthStatus(skill: Pick<SkillRecord, "readiness" | "evidence" | "risks">): HealthStatus {
  if (skill.readiness.status === "blocked" || skill.risks.some((risk) => risk.severity === "critical")) return "blocked";
  if (skill.readiness.status === "attention" || skill.risks.some((risk) => risk.severity === "high")) return "attention";
  if (skill.readiness.status === "ready" && skill.evidence.strength === "strong") return "healthy";
  return "review-ready";
}

async function resolveInputFiles(root: string, inputs: string[], config: SkillariumConfig): Promise<string[]> {
  if (inputs.length === 0) {
    return fg(config.include, {
      cwd: root,
      ignore: config.exclude,
      absolute: true,
      onlyFiles: true,
      unique: true,
    });
  }

  const files = new Set<string>();
  for (const input of inputs) {
    const absolute = path.resolve(root, input);
    let inputStat;
    try {
      inputStat = await stat(absolute);
    } catch {
      throw new Error(`Scan input does not exist: ${input}`);
    }
    if (inputStat.isFile()) {
      if (path.basename(absolute) !== "SKILL.md") throw new Error(`Expected SKILL.md, received: ${input}`);
      files.add(absolute);
    } else if (inputStat.isDirectory()) {
      const nested = await fg("**/SKILL.md", {
        cwd: absolute,
        ignore: config.exclude,
        absolute: true,
        onlyFiles: true,
      });
      nested.forEach((file) => files.add(file));
    }
  }
  return [...files];
}

function uniqueIds(records: SkillRecord[]): void {
  const grouped = new Map<string, SkillRecord[]>();
  records.forEach((record) => grouped.set(record.id, [...(grouped.get(record.id) ?? []), record]));
  grouped.forEach((duplicates) => {
    if (duplicates.length < 2) return;
    duplicates
      .sort((a, b) => a.sourcePath.localeCompare(b.sourcePath))
      .forEach((record) => {
        record.id = `${record.id}-${digestContent(record.sourcePath).slice(0, 6)}`;
        record.readiness.checks.push({
          code: "identity.duplicate",
          label: "Unique identity",
          status: "warn",
          message: "Duplicate skill name detected; manifest ID includes a path digest",
          penalty: 5,
        });
        record.readiness.score = Math.max(0, record.readiness.score - 5);
      });
  });
}

export async function scanRepository(args: {
  root: string;
  inputs?: string[];
  config: SkillariumConfig;
  now?: Date;
}): Promise<SkillariumManifest> {
  const root = path.resolve(args.root);
  const inputs = args.inputs ?? [];
  const files = (await resolveInputFiles(root, inputs, args.config)).sort();
  const receipts = await loadEvidence(root, args.config.evidenceDir);
  const records: SkillRecord[] = [];

  for (const absolutePath of files) {
    const raw = await readFile(absolutePath, "utf8");
    let data: Record<string, unknown> = {};
    let body = raw;
    let frontmatterParsed = true;
    try {
      const parsed = matter(raw);
      data = parsed.data as Record<string, unknown>;
      body = parsed.content;
      frontmatterParsed = raw.trimStart().startsWith("---");
    } catch {
      frontmatterParsed = false;
    }
    const directoryName = path.basename(path.dirname(absolutePath));
    const rawName = typeof data.name === "string" ? data.name.trim() : directoryName;
    const id = validSkillName(rawName) ? rawName : directoryName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unnamed-skill";
    const description = typeof data.description === "string" ? data.description.trim() : "";
    const relativePath = path.relative(root, absolutePath);
    const readiness = await analyzeReadiness({
      sourcePath: absolutePath,
      raw,
      body,
      frontmatterParsed,
      name: rawName,
      description,
    });
    const override = args.config.overrides[id] ?? {};
    const digest = digestContent(raw);
    const record: SkillRecord = {
      id,
      name: rawName || directoryName,
      description,
      channel: override.channel ?? inferChannel(data),
      sourcePath: relativePath.split(path.sep).join("/"),
      sourceRoot: path.dirname(relativePath).split(path.sep)[0] || ".",
      digest,
      ecosystems: inferEcosystem(relativePath),
      tags: [...new Set([...(inferTags(data)), ...(override.tags ?? [])])].sort(),
      readiness: {
        score: readiness.score,
        status: readinessStatus(readiness.score, readiness.checks.some((check) => check.status === "fail")),
        checks: readiness.checks,
      },
      evidence: summarizeEvidence(id, digest, receipts),
      risks: analyzeRisks(raw),
      health: "review-ready",
    };
    record.health = healthStatus(record);
    records.push(record);
  }

  uniqueIds(records);
  records.forEach((record) => {
    record.readiness.status = readinessStatus(record.readiness.score, record.readiness.checks.some((check) => check.status === "fail"));
    record.evidence = summarizeEvidence(record.id, record.digest, receipts);
    record.health = healthStatus(record);
  });

  const averageReadiness = records.length === 0
    ? 0
    : Math.round(records.reduce((sum, record) => sum + record.readiness.score, 0) / records.length);
  const currentEvidence = records.filter((record) => record.evidence.status === "current").length;
  const highRiskFlags = records.reduce(
    (sum, record) => sum + record.risks.filter((risk) => risk.severity === "high" || risk.severity === "critical").length,
    0,
  );
  const summaryStatus: HealthStatus = records.some((record) => record.health === "blocked")
    ? "blocked"
    : records.some((record) => record.health === "attention")
      ? "attention"
      : records.length > 0 && records.every((record) => record.health === "healthy")
        ? "healthy"
        : "review-ready";

  return {
    schemaVersion: 1,
    generatedAt: (args.now ?? new Date()).toISOString(),
    project: {
      title: args.config.title,
      root: ".",
      ...(args.config.repositoryUrl ? { repositoryUrl: args.config.repositoryUrl } : {}),
    },
    summary: {
      skillCount: records.length,
      averageReadiness,
      currentEvidence,
      highRiskFlags,
      status: summaryStatus,
    },
    skills: records.sort((a, b) => a.name.localeCompare(b.name)),
  };
}
