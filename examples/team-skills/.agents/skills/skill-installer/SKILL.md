---
name: skill-installer
description: Inspects and installs agent skills from GitHub repositories. Use when a user provides a repository link or asks to install a skill package.
metadata:
  skillarium:
    channel: stable
    tags: [skill-operations, github]
---

# Skill Installer

Inspect the repository layout before installing anything. Find every real `SKILL.md`, distinguish root-level, nested, and multi-skill packages, and compare destination names against existing local skills.

Use concrete skill paths for installation. Preserve local conflicts instead of overwriting them, verify the installed metadata, and report whether the agent must restart before the skill appears.

For repositories hosted on GitHub, inspect the public source before copying files. Do not execute scripts from an unreviewed skill package.
