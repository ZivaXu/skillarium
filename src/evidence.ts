import { readFile } from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import type { EvidenceReceipt, SkillEvidence } from "./types.js";

function isReceipt(value: unknown): value is EvidenceReceipt {
  if (!value || typeof value !== "object") return false;
  const receipt = value as Record<string, unknown>;
  return (
    receipt.schemaVersion === 1 &&
    typeof receipt.skillId === "string" &&
    typeof receipt.skillDigest === "string" &&
    typeof receipt.criteriaDigest === "string" &&
    typeof receipt.runAt === "string" &&
    Number.isInteger(receipt.cases) &&
    Number.isInteger(receipt.passed) &&
    Number(receipt.cases) >= 0 &&
    Number(receipt.passed) >= 0 &&
    Number(receipt.passed) <= Number(receipt.cases)
  );
}

export async function loadEvidence(root: string, evidenceDir: string): Promise<EvidenceReceipt[]> {
  const absoluteDir = path.resolve(root, evidenceDir);
  const files = await fg("**/*.json", { cwd: absoluteDir, absolute: true, onlyFiles: true });
  const receipts: EvidenceReceipt[] = [];
  for (const file of files.sort()) {
    try {
      const parsed: unknown = JSON.parse(await readFile(file, "utf8"));
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      candidates.filter(isReceipt).forEach((receipt) => receipts.push(receipt));
    } catch {
      // Invalid receipts are ignored so scanning the skill repository remains robust.
    }
  }
  return receipts;
}

export function summarizeEvidence(
  skillId: string,
  skillDigest: string,
  receipts: EvidenceReceipt[],
): SkillEvidence {
  const relevant = receipts.filter((receipt) => receipt.skillId === skillId);
  const current = relevant.filter((receipt) => receipt.skillDigest === skillDigest);
  const cases = current.reduce((sum, receipt) => sum + receipt.cases, 0);
  const passed = current.reduce((sum, receipt) => sum + receipt.passed, 0);
  const passRate = cases > 0 ? passed / cases : null;
  const latestRunAt = current
    .map((receipt) => receipt.runAt)
    .sort((a, b) => b.localeCompare(a))[0] ?? null;
  const strength = current.length === 0
    ? "none"
    : cases >= 10 && passRate !== null && passRate >= 0.9
      ? "strong"
      : "limited";

  return {
    status: current.length > 0 ? "current" : relevant.length > 0 ? "stale" : "none",
    strength,
    currentReceipts: current.length,
    staleReceipts: relevant.length - current.length,
    cases,
    passed,
    passRate,
    criteriaDigests: [...new Set(current.map((receipt) => receipt.criteriaDigest))].sort(),
    latestRunAt,
  };
}
