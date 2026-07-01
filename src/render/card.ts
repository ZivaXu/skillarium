import type { HealthStatus, SkillariumManifest } from "../types.js";

const palette = {
  light: {
    background: "#f3f0e7",
    panel: "#fffdf7",
    ink: "#181914",
    muted: "#65675e",
    line: "#c8c6bc",
    ready: "#16845b",
    evidence: "#1677ba",
    warning: "#d44b37",
    accent: "#d4a72c",
  },
  dark: {
    background: "#11120f",
    panel: "#181914",
    ink: "#f4f0e6",
    muted: "#aaa89f",
    line: "#3b3c35",
    ready: "#7be0aa",
    evidence: "#69bff5",
    warning: "#ff785f",
    accent: "#edc34f",
  },
} as const;

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function statusLabel(status: HealthStatus): string {
  return status.replace("-", " ").toUpperCase();
}

function pointFor(index: number, total: number): { x: number; y: number } {
  const count = Math.max(total, 1);
  const angle = index * 2.399963 + 0.4;
  const radius = 12 + Math.sqrt((index + 1) / count) * 72;
  return {
    x: 110 + Math.cos(angle) * radius,
    y: 108 + Math.sin(angle) * radius * 0.68,
  };
}

export function renderFitnessCard(
  manifest: SkillariumManifest,
  theme: keyof typeof palette = "dark",
): string {
  const colors = palette[theme];
  const points = manifest.skills.map((skill, index) => ({
    ...pointFor(index, manifest.skills.length),
    skill,
  }));
  const links = points.slice(1).map((point, index) => {
    const previous = points[Math.max(0, index - 1)];
    return `<line x1="${previous.x.toFixed(1)}" y1="${previous.y.toFixed(1)}" x2="${point.x.toFixed(1)}" y2="${point.y.toFixed(1)}" stroke="${colors.line}" stroke-width="1" opacity="0.6"/>`;
  }).join("");
  const stars = points.map(({ x, y, skill }) => {
    const color = skill.health === "healthy"
      ? colors.ready
      : skill.health === "blocked" || skill.health === "attention"
        ? colors.warning
        : skill.evidence.status === "current"
          ? colors.evidence
          : colors.accent;
    const radius = 4 + Math.max(0, skill.readiness.score - 60) / 13;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${radius.toFixed(1)}" fill="${color}"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(radius + 5).toFixed(1)}" fill="none" stroke="${color}" opacity="0.22"/>`;
  }).join("");
  const generatedDate = manifest.generatedAt.slice(0, 10);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="220" viewBox="0 0 900 220" role="img" aria-label="${escapeXml(manifest.project.title)} fitness frontier">
  <rect width="900" height="220" rx="8" fill="${colors.background}"/>
  <rect x="1" y="1" width="898" height="218" rx="7" fill="none" stroke="${colors.line}"/>
  <rect x="24" y="20" width="198" height="180" rx="6" fill="${colors.panel}" stroke="${colors.line}"/>
  <g>${links}${stars}</g>
  <text x="250" y="42" fill="${colors.accent}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="12">SKILLARIUM / FITNESS FRONTIER</text>
  <text x="250" y="79" fill="${colors.ink}" font-family="Georgia, Times New Roman, serif" font-size="30" font-weight="700">${escapeXml(manifest.project.title)}</text>
  <text x="250" y="105" fill="${colors.muted}" font-family="Avenir Next, Segoe UI, sans-serif" font-size="14">${statusLabel(manifest.summary.status)} · generated ${generatedDate}</text>
  <line x1="250" y1="126" x2="872" y2="126" stroke="${colors.line}"/>
  <text x="250" y="151" fill="${colors.muted}" font-family="Avenir Next, Segoe UI, sans-serif" font-size="11">SKILLS</text>
  <text x="250" y="182" fill="${colors.ink}" font-family="Georgia, Times New Roman, serif" font-size="27">${manifest.summary.skillCount}</text>
  <text x="372" y="151" fill="${colors.muted}" font-family="Avenir Next, Segoe UI, sans-serif" font-size="11">READINESS</text>
  <text x="372" y="182" fill="${colors.ready}" font-family="Georgia, Times New Roman, serif" font-size="27">${manifest.summary.averageReadiness}</text>
  <text x="530" y="151" fill="${colors.muted}" font-family="Avenir Next, Segoe UI, sans-serif" font-size="11">CURRENT EVIDENCE</text>
  <text x="530" y="182" fill="${colors.evidence}" font-family="Georgia, Times New Roman, serif" font-size="27">${manifest.summary.currentEvidence}/${manifest.summary.skillCount}</text>
  <text x="730" y="151" fill="${colors.muted}" font-family="Avenir Next, Segoe UI, sans-serif" font-size="11">HIGH RISKS</text>
  <text x="730" y="182" fill="${manifest.summary.highRiskFlags > 0 ? colors.warning : colors.ink}" font-family="Georgia, Times New Roman, serif" font-size="27">${manifest.summary.highRiskFlags}</text>
</svg>`;
}
