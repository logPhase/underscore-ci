# Enrichment and privacy

The single design tension in underscore-ci is: **the client's code must not
leave their runner unless they explicitly opt in.** This explains the two
operating modes, exactly what crosses the boundary, and how the whole thing
soft-degrades so enrichment can never break a client's pipeline.

## Two modes, one removed secret apart

|  | Structural-only | Enriched |
|---|---|---|
| **Requires** | nothing (omit `INTENT_DRIFT_TOKEN`) | `INTENT_DRIFT_URL` + `INTENT_DRIFT_TOKEN` |
| Call graph, journeys, PR impact overlay, chapter deep-dives | ✅ | ✅ |
| BPMN business-flow diagrams | ❌ | ✅ |
| PR overview narrative | ❌ | ✅ (pr mode only) |
| Per-journey summaries / journey knowledge | ❌ | ✅ |
| Correctness findings | ❌ | ✅ (`findings: on`) |
| **Data leaving the runner** | **none** | PR diff + changed method bodies |
| Cost | free compute on the runner | metered per-PR via analyzer credits |

Structural-only is a deliberate **privacy mode**, not a degraded fallback:
remove one secret and analysis runs entirely on the runner with nothing leaving.

## What actually crosses the boundary

In enriched mode, the **Clojure CLI** (not the runner shell, not the browser)
POSTs to the hosted analyzer at `INTENT_DRIFT_URL`:

1. `POST /sessions` — stages the PR's artifacts: journeys (call-tree paths),
   source snippets, and changed method bodies.
2. `POST /bpmn`, `/overview`, `/summarize`, optionally `/review/correctness` —
   read those staged artifacts back and return diagrams / narrative / findings.

So: **PR diffs and changed method bodies flow to our analyzer, and from there to
Anthropic.** Nothing else. The analyzer never gets a checkout path — it cannot
run git or touch a filesystem. `ANTHROPIC_API_KEY` lives on the analyzer; it is
**never** required in client CI.

## How the modes are selected — the env plumbing

`entrypoint.sh` gates purely on `INTENT_DRIFT_TOKEN`:

```
token present, pr mode:    FLOW_ENABLED=1 FLOW_ANALYZER=1 OVERVIEW_ENABLED=1
                           (+ FINDINGS_ENABLED=1 if the `findings` input is "on")
token present, full mode:  FLOW_ENABLED=1 FLOW_ANALYZER=1 FLOW_WORKBOOK_ENABLED=1
                           (no OVERVIEW_ENABLED — the /overview route is pr-only)
token absent:              none of the above → structural-only
```

`full` mode deliberately omits the PR overview: it is a PR-delta artifact and
the analyzer's `/overview` has no whole-repo mode. `full` mode instead enables
the journey **workbook** summaries. Optional `BPMN_MAX_JOURNEYS` caps BPMN cost
in full mode (a large repo can have 40+ journeys).

## Soft-degradation: enrichment can never break the pipeline

This is a hard rule. A missing/expired token or an unreachable analyzer must
**never fail the run** — the client simply gets the structural report. This
mirrors the analyzer's own "best-effort is pervasive" discipline (additive
features degrade, the core path stays strict). Two layers enforce it:

- **In the CLI**, enrichment calls soft-degrade to the structural report.
- **In `entrypoint.sh`**, the PR comment upsert and findings review are wrapped
  best-effort (`|| echo ::warning::`), so a `gh` failure *after* successful
  analysis never reddens the check. And the default `fail-on-error: false`
  means even an analysis failure posts a "failed, see logs" comment and exits
  green — Underscore never blocks a client's pipeline. (`full` mode is the one
  exception: an analysis failure always fails the step, because there is no PR
  to comment on and a green no-op would be misleading.)

## The three monetization levers (why any of this is gated)

Privacy and monetization share the same machinery:

1. **We host the analyzer.** Tokens/credits/ledger only protect us while we
   control the Neo4j and the admin account.
2. **Credits** gate enrichment spend (`ensure_credits` → HTTP 402); the balance
   is the spend cap.
3. **The private GHCR image** is granted per client and revocable; versioned
   tags (`v2`, `v2.x.y`) control what clients run.

For what happens on the *other* side of the wire — the agents, caching, the
knowledge graph — read the analyzer's own `docs/explanation/system-overview.md`.
</content>
