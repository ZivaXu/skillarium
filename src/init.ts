import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

async function writeTemplate(args: {
  templateName: string;
  destination: string;
  replacements?: Record<string, string>;
  force: boolean;
}): Promise<"created" | "skipped"> {
  const templateUrl = new URL(`../templates/${args.templateName}`, import.meta.url);
  let content = await readFile(templateUrl, "utf8");
  for (const [needle, replacement] of Object.entries(args.replacements ?? {})) {
    content = content.replaceAll(needle, replacement);
  }
  await mkdir(path.dirname(args.destination), { recursive: true });
  try {
    await writeFile(args.destination, content, { flag: args.force ? "w" : "wx" });
    return "created";
  } catch (error) {
    if (!args.force && (error as NodeJS.ErrnoException).code === "EEXIST") return "skipped";
    throw error;
  }
}

export async function initializeProject(root: string, force = false): Promise<{
  files: Array<{ path: string; status: "created" | "skipped" }>;
  embed: string;
}> {
  const projectName = path.basename(path.resolve(root));
  const configPath = path.join(root, ".skillarium.yml");
  const workflowPath = path.join(root, ".github", "workflows", "skillarium.yml");
  const files = [
    {
      path: configPath,
      status: await writeTemplate({
        templateName: "skillarium.yml",
        destination: configPath,
        replacements: { "__PROJECT_TITLE__": projectName },
        force,
      }),
    },
    {
      path: workflowPath,
      status: await writeTemplate({
        templateName: "skillarium-workflow.yml",
        destination: workflowPath,
        force,
      }),
    },
  ];
  const embed = `<picture>\n  <source media="(prefers-color-scheme: dark)" srcset="https://OWNER.github.io/REPO/card-dark.svg">\n  <img alt="Skillarium Fitness Frontier" src="https://OWNER.github.io/REPO/card.svg">\n</picture>`;
  return {
    files: files.map((file) => ({ ...file, path: path.relative(root, file.path) })),
    embed,
  };
}
