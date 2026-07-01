import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.js";
import { digestContent } from "../src/analysis.js";
import { scanRepository } from "../src/scanner.js";

const tempRoots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "skillarium-test-"));
  tempRoots.push(root);
  return root;
}

async function writeSkill(root: string, relativeDir: string, content: string): Promise<string> {
  const directory = path.join(root, relativeDir);
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, "SKILL.md");
  await writeFile(file, content);
  return file;
}

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("scanRepository", () => {
  it("separates static readiness from current evidence", async () => {
    const root = await tempRoot();
    const skill = `---\nname: precise-skill\ndescription: Performs a precise workflow. Use when a precise task appears.\n---\n\n# Precise Skill\n\nFollow the verified workflow and report the result with evidence.\n`;
    await writeSkill(root, "skills/precise-skill", skill);
    await mkdir(path.join(root, ".skillarium/evidence"), { recursive: true });
    await writeFile(
      path.join(root, ".skillarium/evidence/precise-skill.json"),
      JSON.stringify({
        schemaVersion: 1,
        skillId: "precise-skill",
        skillDigest: digestContent(skill),
        criteriaDigest: "precise-v1",
        runAt: "2026-06-29T00:00:00.000Z",
        cases: 10,
        passed: 9,
      }),
    );

    const manifest = await scanRepository({
      root,
      config: { ...DEFAULT_CONFIG },
      now: new Date("2026-06-30T00:00:00.000Z"),
    });

    expect(manifest.summary).toMatchObject({
      skillCount: 1,
      averageReadiness: 100,
      currentEvidence: 1,
      status: "healthy",
    });
    expect(manifest.skills[0].evidence).toMatchObject({
      status: "current",
      strength: "strong",
      passRate: 0.9,
    });
  });

  it("marks receipts stale when the skill digest changes", async () => {
    const root = await tempRoot();
    await writeSkill(
      root,
      "skills/changing-skill",
      `---\nname: changing-skill\ndescription: Changes safely. Use when a controlled update is required.\n---\n\n# Changed\n\nThis body is newer than the recorded benchmark receipt.\n`,
    );
    await mkdir(path.join(root, ".skillarium/evidence"), { recursive: true });
    await writeFile(
      path.join(root, ".skillarium/evidence/stale.json"),
      JSON.stringify({
        schemaVersion: 1,
        skillId: "changing-skill",
        skillDigest: "0000000000000000",
        criteriaDigest: "criteria-v1",
        runAt: "2026-06-20T00:00:00.000Z",
        cases: 20,
        passed: 20,
      }),
    );

    const manifest = await scanRepository({ root, config: { ...DEFAULT_CONFIG } });
    expect(manifest.skills[0].evidence).toMatchObject({ status: "stale", strength: "none", staleReceipts: 1 });
    expect(manifest.skills[0].health).toBe("review-ready");
  });

  it("keeps malformed skills visible and blocked", async () => {
    const root = await tempRoot();
    await writeSkill(root, "skills/broken", `---\nname: [broken\n---\n\nShort`);

    const manifest = await scanRepository({ root, config: { ...DEFAULT_CONFIG } });
    expect(manifest.skills).toHaveLength(1);
    expect(manifest.skills[0].readiness.status).toBe("blocked");
    expect(manifest.skills[0].health).toBe("blocked");
    expect(manifest.summary.status).toBe("blocked");
  });

  it("detects critical commands without executing the skill", async () => {
    const root = await tempRoot();
    await writeSkill(
      root,
      "skills/risky-skill",
      `---\nname: risky-skill\ndescription: Removes build output. Use when cleaning generated files.\n---\n\n# Risky\n\nRun \`rm -rf ./build\` to clear output.\n`,
    );

    const manifest = await scanRepository({ root, config: { ...DEFAULT_CONFIG } });
    expect(manifest.skills[0].risks).toContainEqual(expect.objectContaining({ code: "destructive-shell", severity: "critical" }));
    expect(manifest.skills[0].health).toBe("blocked");
  });

  it("creates deterministic unique IDs for duplicate names", async () => {
    const root = await tempRoot();
    const content = `---\nname: shared-name\ndescription: Handles a shared workflow. Use when the workflow is requested.\n---\n\n# Shared\n\nFollow a concrete and independently verifiable process.\n`;
    await writeSkill(root, "skills/first", content);
    await writeSkill(root, "skills/second", content);

    const manifest = await scanRepository({ root, config: { ...DEFAULT_CONFIG } });
    expect(new Set(manifest.skills.map((skill) => skill.id)).size).toBe(2);
    expect(manifest.skills.every((skill) => skill.id.startsWith("shared-name-"))).toBe(true);
    expect(manifest.skills.every((skill) => skill.readiness.checks.some((check) => check.code === "identity.duplicate"))).toBe(true);
  });
});
