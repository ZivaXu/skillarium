export type Channel = "stable" | "beta" | "candidate" | "deprecated";
export type Ecosystem = "agent-skills" | "codex" | "claude" | "unknown";
export type CheckStatus = "pass" | "warn" | "fail";
export type Severity = "info" | "warning" | "high" | "critical";
export type ReadinessStatus = "ready" | "review" | "attention" | "blocked";
export type EvidenceStatus = "none" | "stale" | "current";
export type EvidenceStrength = "none" | "limited" | "strong";
export type HealthStatus = "healthy" | "review-ready" | "attention" | "blocked";

export interface SkillariumConfig {
  version: 1;
  title: string;
  include: string[];
  exclude: string[];
  outputDir: string;
  evidenceDir: string;
  repositoryUrl?: string;
  failOn: "critical" | "high" | "never";
  overrides: Record<
    string,
    {
      channel?: Channel;
      tags?: string[];
    }
  >;
}

export interface CheckResult {
  code: string;
  label: string;
  status: CheckStatus;
  message: string;
  penalty: number;
}

export interface RiskFlag {
  code: string;
  severity: Severity;
  message: string;
}

export interface EvidenceReceipt {
  schemaVersion: 1;
  skillId: string;
  skillDigest: string;
  criteriaDigest: string;
  runAt: string;
  cases: number;
  passed: number;
  source?: {
    name?: string;
    url?: string;
  };
}

export interface SkillEvidence {
  status: EvidenceStatus;
  strength: EvidenceStrength;
  currentReceipts: number;
  staleReceipts: number;
  cases: number;
  passed: number;
  passRate: number | null;
  criteriaDigests: string[];
  latestRunAt: string | null;
}

export interface SkillRecord {
  id: string;
  name: string;
  description: string;
  channel: Channel;
  sourcePath: string;
  sourceRoot: string;
  digest: string;
  ecosystems: Ecosystem[];
  tags: string[];
  readiness: {
    score: number;
    status: ReadinessStatus;
    checks: CheckResult[];
  };
  evidence: SkillEvidence;
  risks: RiskFlag[];
  health: HealthStatus;
}

export interface SkillariumManifest {
  schemaVersion: 1;
  generatedAt: string;
  project: {
    title: string;
    root: string;
    repositoryUrl?: string;
  };
  summary: {
    skillCount: number;
    averageReadiness: number;
    currentEvidence: number;
    highRiskFlags: number;
    status: HealthStatus;
  };
  skills: SkillRecord[];
}
