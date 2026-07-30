---
name: writing-docs
description: Use BEFORE creating or editing ANY documentation — docs/, README.md, CLAUDE.md, ADRs — in underscore repos. Decides whether the content belongs in git at all, which Diátaxis quadrant it goes in, and enforces the house writing style (inverted pyramid, mermaid, naming).
---

# Writing Docs (underscore convention)

> Canonical copy: `intent-drift-analyzer/.claude/skills/writing-docs/SKILL.md`. Edit there first, then copy to sibling repos.

Documentation is an on-ramp for people and agents. **Code is the authority.** A doc earns its place by being true *now*; if you can't commit to maintaining it, don't commit it.

## Step 1 — Does this belong in git at all? (tier test)

| Question | Answer → destination |
|---|---|
| Written to *do* work (spec, plan, brainstorm, task brief, session notes, research dump)? | `.dev-docs/` (gitignored scratch). Never commit. |
| Dated or session-bound? | `.dev-docs/`. Always. |
| A decision that will still matter when the code has changed? | ADR in `docs/decisions/` |
| Describes current behavior, and you accept the maintenance obligation? | Living doc in `docs/` |
| None of the above | Don't write it. |

**Distill-before-merge:** before your branch merges, move anything durable from `.dev-docs/` up into a living doc or ADR. The scratch original is disposable.

## Step 2 — Which quadrant? (living docs only)

- Reader is **learning by doing** → `docs/tutorials/`
- Reader has a **task to complete now** → `docs/how-to/`
- Reader needs to **look up a fact** (flags, contracts, API shapes) → `docs/reference/`
- Reader wants to **understand why/how it works** → `docs/explanation/`

One quadrant per doc. A how-to that starts explaining *why* links to an explanation doc instead. Don't create empty quadrant directories — structure emerges one doc at a time.

## Step 3 — Write it (style rules)

1. **Opening paragraph** states purpose, scope, non-scope, and audience.
2. **Inverted pyramid, fractally:** the most important sentence comes first in the doc, in every section, in every paragraph. A reader who stops anywhere still has the gist.
3. **Headings are conclusions, not topics:** "Ingest is idempotent", not "Ingest".
4. **Mermaid for flows.** Any flow, lifecycle, or multi-party interaction gets a diagram:
   - flowchart → branching / data flow / architecture (subgraphs; C4 syntax is experimental — avoid)
   - sequence → time-ordered interactions (APIs, handshakes)
   - state → lifecycle of one entity
   - One concern per diagram, ~10 nodes max. A diagram you wouldn't update on the next refactor shouldn't exist. ASCII trees only for directory layouts.
5. **Naming:** `kebab-case.md`. No dates, no SCREAMING-CASE.
6. **Register the doc:** add a one-line entry to `docs/README.md` (the map). A doc not in the map is an orphan.

## ADRs (`docs/decisions/NNNN-title-with-dashes.md`)

Half a page to two pages, "a conversation with a future developer":

```markdown
# NNNN. <Title — short noun phrase>
Status: proposed | accepted | deprecated | superseded by NNNN
Date: YYYY-MM-DD

## Context
<forces at play, value-neutral>
## Decision
<active voice, full sentences>
## Consequences
<all of them, including the negative ones>
```

Numbers are sequential and never reused. **Never edit an accepted ADR** — write a superseding one.

## CLAUDE.md rules

Instructions + routing, never content:
- House rules, gotchas, non-guessable commands; a pointer to `docs/README.md` for everything else.
- Per-line test: *would removing this line cause Claude to make mistakes? If not, cut it.*
- ≤100 lines target, 200 hard max. No architecture trees, no file tours, no duplicated design principles, no generic LLM-behavior boilerplate, no stale-doc warning banners (fix or delete the doc instead).
- Nested CLAUDE.md files contain only what differs from the root one.

## Anti-patterns (reject in review)

- Dated filenames anywhere under `docs/`
- Warning banners on stale docs
- The same content in two files (link instead)
- Empty scaffolding directories
- Docs describing planned-but-unbuilt behavior (that's a `.dev-docs/` spec or an ADR marked `proposed`)
- Anything in `docs-attic/` being edited or linked from living docs — the attic is a quarantined, unmaintained snapshot pending deletion
