import { createHash } from "node:crypto";
import { access } from "node:fs/promises";
import path from "node:path";
import { unified } from "unified";
import remarkParse from "remark-parse";
import { visit } from "unist-util-visit";
import type { CheckResult, RiskFlag } from "./types.js";

export function digestContent(content: string): string {
  return createHash("sha256").update(content.replace(/\r\n/g, "\n")).digest("hex").slice(0, 16);
}

export function validSkillName(name: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) && name.length <= 64;
}

async function localLinks(markdown: string): Promise<string[]> {
  const tree = unified().use(remarkParse).parse(markdown);
  const links: string[] = [];
  const collect = (url: string) => {
    if (
      url &&
      !url.startsWith("#") &&
      !url.startsWith("http://") &&
      !url.startsWith("https://") &&
      !url.startsWith("mailto:") &&
      !url.startsWith("data:")
    ) {
      links.push(url.split("#")[0]);
    }
  };
  visit(tree, "link", (node) => collect(node.url));
  visit(tree, "image", (node) => collect(node.url));
  return [...new Set(links)];
}

export async function analyzeReadiness(args: {
  sourcePath: string;
  raw: string;
  body: string;
  frontmatterParsed: boolean;
  name: string;
  description: string;
}): Promise<{ score: number; checks: CheckResult[] }> {
  const { sourcePath, raw, body, frontmatterParsed, name, description } = args;
  const checks: CheckResult[] = [];
  const add = (check: CheckResult) => checks.push(check);

  add({
    code: "frontmatter.parse",
    label: "Frontmatter",
    status: frontmatterParsed ? "pass" : "fail",
    message: frontmatterParsed ? "YAML frontmatter parsed" : "YAML frontmatter is missing or invalid",
    penalty: frontmatterParsed ? 0 : 40,
  });

  const nameValid = validSkillName(name);
  add({
    code: "frontmatter.name",
    label: "Skill name",
    status: nameValid ? "pass" : "fail",
    message: nameValid ? "Name follows the Agent Skills convention" : "Name must be lowercase kebab-case and 64 characters or fewer",
    penalty: nameValid ? 0 : 20,
  });

  const descriptionValid = description.length > 0 && description.length <= 1024;
  add({
    code: "frontmatter.description",
    label: "Description",
    status: descriptionValid ? "pass" : "fail",
    message: descriptionValid ? "Description is present" : "Description is missing or longer than 1024 characters",
    penalty: descriptionValid ? 0 : 15,
  });

  const hasTrigger = /\buse when\b/i.test(description);
  add({
    code: "description.trigger",
    label: "Activation cue",
    status: hasTrigger ? "pass" : "warn",
    message: hasTrigger ? "Description states when to use the skill" : "Add a concise 'Use when' activation cue",
    penalty: hasTrigger ? 0 : 10,
  });

  const directoryName = path.basename(path.dirname(sourcePath));
  const directoryMatches = !nameValid || directoryName === name;
  add({
    code: "name.directory-match",
    label: "Directory match",
    status: directoryMatches ? "pass" : "warn",
    message: directoryMatches ? "Directory and skill name agree" : `Directory '${directoryName}' differs from '${name}'`,
    penalty: directoryMatches ? 0 : 5,
  });

  const bodyPresent = body.trim().length >= 40;
  add({
    code: "instructions.body",
    label: "Instructions",
    status: bodyPresent ? "pass" : "fail",
    message: bodyPresent ? "Instruction body is present" : "Instruction body is empty or too short to be actionable",
    penalty: bodyPresent ? 0 : 20,
  });

  const links = await localLinks(body);
  const missingLinks: string[] = [];
  for (const link of links) {
    try {
      await access(path.resolve(path.dirname(sourcePath), decodeURIComponent(link)));
    } catch {
      missingLinks.push(link);
    }
  }
  add({
    code: "references.local",
    label: "Local references",
    status: missingLinks.length === 0 ? "pass" : "warn",
    message: missingLinks.length === 0 ? `${links.length} local reference${links.length === 1 ? "" : "s"} resolved` : `Missing: ${missingLinks.join(", ")}`,
    penalty: Math.min(15, missingLinks.length * 5),
  });

  const absolutePaths = raw.match(/(?:\/Users\/[^\s`'\")]+|[A-Za-z]:\\[^\s`'\")]+)/g) ?? [];
  add({
    code: "portability.absolute-paths",
    label: "Portability",
    status: absolutePaths.length === 0 ? "pass" : "warn",
    message: absolutePaths.length === 0 ? "No machine-specific absolute paths found" : `${absolutePaths.length} machine-specific path${absolutePaths.length === 1 ? "" : "s"} found`,
    penalty: absolutePaths.length === 0 ? 0 : 10,
  });

  const wordCount = body.trim().split(/\s+/).filter(Boolean).length;
  const progressive = wordCount <= 3000 || links.length > 0;
  add({
    code: "scope.progressive-disclosure",
    label: "Context size",
    status: progressive ? "pass" : "warn",
    message: progressive ? `${wordCount} instruction words` : "Long instruction body has no progressive-disclosure references",
    penalty: progressive ? 0 : 5,
  });

  return {
    score: Math.max(0, 100 - checks.reduce((sum, check) => sum + check.penalty, 0)),
    checks,
  };
}

const RISK_PATTERNS: Array<{ code: string; severity: RiskFlag["severity"]; message: string; pattern: RegExp }> = [
  { code: "destructive-shell", severity: "critical", message: "Contains a destructive shell command", pattern: /\brm\s+-rf\b|git\s+reset\s+--hard/gi },
  { code: "credential-access", severity: "high", message: "Mentions credentials, secrets, keychains, or SSH material", pattern: /\.ssh\b|keychain|credential|api[_ -]?key|secret\b/gi },
  { code: "network-access", severity: "warning", message: "Can call external URLs or network tools", pattern: /https?:\/\/|\bcurl\b|\bwget\b/gi },
  { code: "dependency-install", severity: "warning", message: "Can install packages or system dependencies", pattern: /\b(?:npm|pnpm|yarn|pip|uv|brew)\s+(?:install|add)\b/gi },
  { code: "git-mutation", severity: "warning", message: "Can mutate git state", pattern: /\bgit\s+(?:add|commit|push|checkout|switch|reset|rebase)\b/gi },
];

export function analyzeRisks(raw: string): RiskFlag[] {
  return RISK_PATTERNS.filter(({ pattern }) => {
    pattern.lastIndex = 0;
    return pattern.test(raw);
  }).map(({ code, severity, message }) => ({ code, severity, message }));
}
