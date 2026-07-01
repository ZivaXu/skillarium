# Contributing to Skillarium

Thanks for helping make agent skills more inspectable and testable.

## Development Setup

```bash
npm install
npm run verify
```

Build the example observatory:

```bash
node dist/cli.js build --root examples/team-skills --out-dir ../../docs/demo
```

## Contribution Rules

- Keep scanning local-first and non-executing by default.
- Treat readiness and evaluation evidence as separate claims.
- Add a fixture and test for every new parser or check.
- Keep generated SVGs free of scripts, remote fonts, and external images.
- Preserve deterministic ordering and layout.
- Do not add an LLM dependency for a check that can be deterministic.

## Pull Requests

Describe the user-visible outcome, include the command used to verify it, and attach screenshots for observatory changes. Small pull requests with one independently testable behavior are preferred.

By participating, you agree to follow the [Code of Conduct](./CODE_OF_CONDUCT.md).
