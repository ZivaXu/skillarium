# Security Policy

## Trust Boundary

Skillarium reads configured `SKILL.md` files, parses Markdown and YAML, reads optional JSON evidence receipts, and writes static output. It does not execute discovered skill scripts or follow remote links.

The static risk scanner identifies review surfaces. It is not a malware detector and must not be treated as proof that a skill is safe.

## Reporting

Please report vulnerabilities through GitHub private vulnerability reporting for `ZivaXu/skillarium`. Do not open a public issue containing an exploit, secret, or private repository content.

Include:

- Affected version.
- Reproduction steps.
- Expected and observed behavior.
- Security impact.
- Any suggested remediation.

## Supported Versions

Before `1.0`, only the latest published minor version receives security fixes.
