---
name: docs-audit
description: Use when asked to audit, health-check, or clean up documentation in an underscore repo — before releases or when docs feel drifty. Finds stale, orphaned, and misplaced docs and proposes fixes. Read-only - it never deletes or rewrites on its own.
---

# Docs Audit (underscore convention)

> Canonical copy: `intent-drift-analyzer/.claude/skills/docs-audit/SKILL.md`. Edit there first, then copy to sibling repos.

Audit the repo's documentation against the three-tier convention (see the `writing-docs` skill). Output is a **proposal list for human approval** — never delete, move, or rewrite anything as part of the audit itself.

**Exemption:** `docs-attic/` is quarantined by design — skip its contents entirely. Only flag the attic if something in living docs or CLAUDE.md *links into it*.

## Checks — fan out one subagent per check for anything non-trivial

1. **Staleness:** for each doc in `docs/` (excluding `decisions/`), extract its concrete claims (named files, commands, flags, endpoints, flows) and verify each against current code. Report every contradiction with doc line + code file. ADRs are exempt (immutable history) — only check that `superseded by` chains resolve.
2. **Orphans & broken links:** every doc under `docs/` must be linked from `docs/README.md`; every relative link in `docs/**` and every CLAUDE.md must resolve to an existing file. Report both directions (orphaned docs; broken links).
3. **Tier violations:** dated filenames (`\d{4}-\d{2}-\d{2}`) under `docs/`; scratch-shaped files (plans, specs, worklogs, briefs, session notes) in the repo root or under `docs/`; tracked files under `.dev-docs/` (`git ls-files .dev-docs` must be empty).
4. **CLAUDE.md:** line count vs the 100/200 rule; content that duplicates a doc (should be a link); routing entries pointing at missing files; generic boilerplate paragraphs; stale-doc warning banners.
5. **Quadrant drift:** how-to docs that explain rationale at length; reference docs containing procedures; explanation docs with step-by-step instructions. Flag, don't rewrite.

## Report format

One section per check. Each finding: `path:line — problem — proposed action (fix|move|delete|link)`. End with a summary table: counts per check, and the top 5 highest-value fixes. Present to the human; act only on what they approve.
