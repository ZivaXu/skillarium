import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initializeProject } from "../src/init.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("initializeProject", () => {
  it("creates config and workflow without overwriting them by default", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "skillarium-init-"));
    roots.push(root);

    const first = await initializeProject(root);
    const second = await initializeProject(root);
    const workflow = await readFile(path.join(root, ".github/workflows/skillarium.yml"), "utf8");
    const config = await readFile(path.join(root, ".skillarium.yml"), "utf8");

    expect(first.files.map((file) => file.status)).toEqual(["created", "created"]);
    expect(second.files.map((file) => file.status)).toEqual(["skipped", "skipped"]);
    expect(workflow).toContain("actions/deploy-pages@v4");
    expect(config).toContain(path.basename(root));
    expect(first.embed).toContain("card-dark.svg");
  });
});
