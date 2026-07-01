const manifest = JSON.parse(document.querySelector("#skillarium-data").textContent);

const state = {
  channel: "all",
  showLinks: true,
  showRisk: true,
  selectedId: manifest.skills[0]?.id ?? null,
};

const el = {
  linkLayer: document.querySelector("#link-layer"),
  orbitLayer: document.querySelector("#orbit-layer"),
  starLayer: document.querySelector("#star-layer"),
  labelLayer: document.querySelector("#label-layer"),
  skillList: document.querySelector("#skill-list"),
  visibleCount: document.querySelector("#visible-count"),
  metricSkills: document.querySelector("#metric-skills"),
  metricReadiness: document.querySelector("#metric-readiness"),
  metricEvidence: document.querySelector("#metric-evidence"),
  metricRisk: document.querySelector("#metric-risk"),
  selectedChannel: document.querySelector("#selected-channel"),
  selectedHealth: document.querySelector("#selected-health"),
  selectedName: document.querySelector("#selected-name"),
  selectedSummary: document.querySelector("#selected-summary"),
  selectedSource: document.querySelector("#selected-source"),
  selectedDigest: document.querySelector("#selected-digest"),
  scoreReadiness: document.querySelector("#score-readiness"),
  scoreEvidence: document.querySelector("#score-evidence"),
  scorePassRate: document.querySelector("#score-pass-rate"),
  scoreRisk: document.querySelector("#score-risk"),
  checkCount: document.querySelector("#check-count"),
  checkList: document.querySelector("#check-list"),
  riskCount: document.querySelector("#risk-count"),
  riskList: document.querySelector("#risk-list"),
  captionPrimary: document.querySelector("#caption-primary"),
  captionSecondary: document.querySelector("#caption-secondary"),
  emptyState: document.querySelector("#empty-state"),
  toast: document.querySelector("#toast"),
  toggleLinks: document.querySelector("#toggle-links"),
  toggleRisk: document.querySelector("#toggle-risk"),
};

const COLORS = {
  healthy: "#7be0aa",
  "review-ready": "#edc34f",
  attention: "#ff8b54",
  blocked: "#ff6555",
  evidence: "#69bff5",
};

function svg(tag, attrs = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
}

function displayName(name) {
  return name
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function filteredSkills() {
  if (state.channel === "all") return manifest.skills;
  return manifest.skills.filter((skill) => skill.channel === state.channel);
}

function selectedSkill() {
  return manifest.skills.find((skill) => skill.id === state.selectedId) ?? filteredSkills()[0] ?? null;
}

function layout(skills) {
  const count = Math.max(skills.length, 1);
  return skills.map((skill, index) => {
    const angle = index * 2.399963 + 0.2;
    const radius = 86 + Math.sqrt((index + 1) / count) * 245;
    return {
      skill,
      x: 500 + Math.cos(angle) * radius * 1.28,
      y: 345 + Math.sin(angle) * radius * 0.78,
    };
  });
}

function related(a, b) {
  return a.sourceRoot === b.sourceRoot || a.tags.some((tag) => b.tags.includes(tag));
}

function renderConstellation() {
  [el.linkLayer, el.orbitLayer, el.starLayer, el.labelLayer].forEach((layer) => layer.replaceChildren());
  const visible = filteredSkills();
  const points = layout(visible);
  el.emptyState.hidden = visible.length > 0;

  if (state.showLinks) {
    points.forEach((point, index) => {
      const target = [...points.slice(0, index)].reverse().find((candidate) => related(point.skill, candidate.skill));
      if (!target) return;
      el.linkLayer.appendChild(svg("line", {
        class: "link-line",
        x1: point.x,
        y1: point.y,
        x2: target.x,
        y2: target.y,
      }));
    });
  }

  points.forEach(({ skill, x, y }, index) => {
    const color = skill.evidence.status === "current" && skill.health !== "blocked"
      ? COLORS.evidence
      : COLORS[skill.health];
    const orbit = svg("ellipse", {
      class: `orbit evidence-${skill.evidence.status}`,
      cx: x,
      cy: y,
      rx: 34 + Math.max(0, 100 - skill.readiness.score) * 0.28,
      ry: 20 + Math.max(0, 100 - skill.readiness.score) * 0.14,
    });
    orbit.style.stroke = color;
    orbit.style.animationDuration = `${20 + index * 3}s`;
    el.orbitLayer.appendChild(orbit);

    if (state.showRisk && skill.risks.some((risk) => risk.severity === "high" || risk.severity === "critical")) {
      const flare = svg("polygon", {
        class: "risk-flare",
        points: `${x},${y - 48} ${x + 14},${y - 13} ${x + 48},${y} ${x + 14},${y + 13} ${x},${y + 48} ${x - 14},${y + 13} ${x - 48},${y} ${x - 14},${y - 13}`,
      });
      el.starLayer.appendChild(flare);
    }

    const radius = 14 + Math.max(0, skill.readiness.score - 50) / 5;
    const core = svg("circle", {
      class: `star-core ${state.selectedId === skill.id ? "is-selected" : ""}`,
      cx: x,
      cy: y,
      r: radius,
      fill: color,
      "data-id": skill.id,
      tabindex: "0",
      role: "button",
      "aria-label": `${displayName(skill.name)}, readiness ${skill.readiness.score}`,
    });
    const hit = svg("circle", {
      class: "star-hit",
      cx: x,
      cy: y,
      r: Math.max(34, radius + 12),
      "data-id": skill.id,
    });
    el.starLayer.append(core, hit);

    const label = svg("text", { class: "star-label", x: x + radius + 12, y: y - 3 });
    label.textContent = displayName(skill.name);
    const sub = svg("tspan", { x: x + radius + 12, dy: 16 });
    sub.textContent = `${skill.readiness.score} readiness · ${skill.evidence.status} evidence`;
    label.appendChild(sub);
    el.labelLayer.appendChild(label);
  });

  document.querySelectorAll(".star-core, .star-hit").forEach((node) => {
    const select = () => selectSkill(node.dataset.id);
    node.addEventListener("click", select);
    node.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") select();
    });
  });
}

function renderMetrics() {
  const visible = filteredSkills();
  const readiness = visible.length
    ? Math.round(visible.reduce((sum, skill) => sum + skill.readiness.score, 0) / visible.length)
    : 0;
  const evidence = visible.filter((skill) => skill.evidence.status === "current").length;
  const highRisk = visible.reduce(
    (sum, skill) => sum + skill.risks.filter((risk) => risk.severity === "high" || risk.severity === "critical").length,
    0,
  );
  el.metricSkills.textContent = visible.length;
  el.metricReadiness.textContent = readiness;
  el.metricEvidence.textContent = `${evidence}/${visible.length}`;
  el.metricRisk.textContent = highRisk;
}

function renderSkillList() {
  const visible = filteredSkills();
  el.skillList.replaceChildren();
  visible.forEach((skill) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `skill-row ${state.selectedId === skill.id ? "is-selected" : ""}`;
    const dot = document.createElement("span");
    dot.className = "skill-dot";
    dot.style.background = COLORS[skill.health];
    const copy = document.createElement("span");
    const name = document.createElement("strong");
    name.textContent = displayName(skill.name);
    const meta = document.createElement("span");
    meta.textContent = `${skill.channel} · ${skill.evidence.status}`;
    copy.append(name, meta);
    const score = document.createElement("span");
    score.className = "health-pill";
    score.textContent = skill.readiness.score;
    button.append(dot, copy, score);
    button.addEventListener("click", () => selectSkill(skill.id));
    el.skillList.appendChild(button);
  });
  el.visibleCount.textContent = `${visible.length} visible`;
}

function renderSelected() {
  const skill = selectedSkill();
  if (!skill) return;
  state.selectedId = skill.id;
  el.selectedChannel.textContent = skill.channel;
  el.selectedHealth.textContent = skill.health;
  el.selectedHealth.dataset.status = skill.health;
  el.selectedName.textContent = displayName(skill.name);
  el.selectedSummary.textContent = skill.description || "No description supplied.";
  el.selectedSource.textContent = skill.sourcePath;
  el.selectedDigest.textContent = skill.digest;
  el.scoreReadiness.textContent = skill.readiness.score;
  el.scoreEvidence.textContent = skill.evidence.strength;
  el.scorePassRate.textContent = skill.evidence.passRate === null ? "n/a" : `${Math.round(skill.evidence.passRate * 100)}%`;
  el.scoreRisk.textContent = skill.risks.length;
  el.captionPrimary.textContent = `${displayName(skill.name)} selected`;
  el.captionSecondary.textContent = `${skill.health} · ${skill.readiness.status} · ${skill.evidence.status} evidence`;

  el.checkList.replaceChildren();
  skill.readiness.checks.forEach((check) => {
    const item = document.createElement("li");
    item.dataset.status = check.status;
    const marker = document.createElement("span");
    marker.className = "check-marker";
    marker.textContent = check.status === "pass" ? "PASS" : check.status.toUpperCase();
    const copy = document.createElement("span");
    const label = document.createElement("strong");
    label.textContent = check.label;
    const message = document.createElement("span");
    message.textContent = check.message;
    copy.append(label, message);
    item.append(marker, copy);
    el.checkList.appendChild(item);
  });
  el.checkCount.textContent = `${skill.readiness.checks.length} checks`;

  el.riskList.replaceChildren();
  if (skill.risks.length === 0) {
    const item = document.createElement("li");
    item.className = "risk-empty";
    item.textContent = "No static risk patterns detected.";
    el.riskList.appendChild(item);
  } else {
    skill.risks.forEach((risk) => {
      const item = document.createElement("li");
      item.dataset.severity = risk.severity;
      const severity = document.createElement("strong");
      severity.textContent = risk.severity;
      const message = document.createElement("span");
      message.textContent = risk.message;
      item.append(severity, message);
      el.riskList.appendChild(item);
    });
  }
  el.riskCount.textContent = `${skill.risks.length} flag${skill.risks.length === 1 ? "" : "s"}`;
}

function render() {
  renderMetrics();
  renderSkillList();
  renderConstellation();
  renderSelected();
}

function selectSkill(id) {
  state.selectedId = id;
  render();
}

function showToast(message) {
  el.toast.textContent = message;
  el.toast.classList.add("is-visible");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => el.toast.classList.remove("is-visible"), 2200);
}

document.querySelectorAll(".mode-button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".mode-button").forEach((node) => node.classList.remove("is-active"));
    button.classList.add("is-active");
    state.channel = button.dataset.channel;
    if (!filteredSkills().some((skill) => skill.id === state.selectedId)) {
      state.selectedId = filteredSkills()[0]?.id ?? manifest.skills[0]?.id ?? null;
    }
    render();
  });
});

el.toggleLinks.addEventListener("change", () => {
  state.showLinks = el.toggleLinks.checked;
  renderConstellation();
});

el.toggleRisk.addEventListener("change", () => {
  state.showRisk = el.toggleRisk.checked;
  renderConstellation();
});

document.querySelector('[data-action="copy-embed"]').addEventListener("click", async () => {
  const base = new URL(".", window.location.href).href;
  const snippet = `<picture>\n  <source media="(prefers-color-scheme: dark)" srcset="${base}card-dark.svg">\n  <img alt="Skillarium Fitness Frontier" src="${base}card.svg">\n</picture>`;
  try {
    await navigator.clipboard.writeText(snippet);
    showToast("README embed copied");
  } catch {
    showToast("Clipboard access unavailable");
  }
});

render();
