/**
 * linkTerms — render prose with known vocabulary terms as links into the
 * glossary. Discovery where you already read: a narrative that says
 * "occupancy window" links to the term's entry instead of assuming you
 * know the house language.
 *
 * Matching is deliberately dumb and safe: case-insensitive, whole-word,
 * longest-name-first (so "occupancy window" wins over "occupancy"), each
 * term linked at most once per text (the first mention — linking every
 * repetition turns prose into a link farm).
 */
import React from "react";
import { Link } from "react-router-dom";
import type { VocabTerm } from "@/types/vocabulary";

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function linkTerms(text: string, terms: VocabTerm[]): React.ReactNode {
  if (!text || terms.length === 0) return text;
  const byLength = [...terms].sort((a, b) => b.name.length - a.name.length);
  const pattern = new RegExp(
    `\\b(${byLength.map(t => escapeRe(t.name)).join("|")})\\b`, "gi");
  const lookup = new Map(terms.map(t => [t.name.toLowerCase(), t]));

  const out: React.ReactNode[] = [];
  const linked = new Set<string>();
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    const term = lookup.get(m[0].toLowerCase());
    if (!term || linked.has(term.slug)) continue;
    linked.add(term.slug);
    out.push(text.slice(last, m.index));
    out.push(
      <Link
        key={`${term.slug}-${m.index}`}
        to="/vocabulary"
        title={term.definition}
        className="underline decoration-dotted underline-offset-2"
        style={{ color: "inherit", textDecorationColor: "var(--bpmn-mint)" }}
      >
        {m[0]}
      </Link>,
    );
    last = (m.index ?? 0) + m[0].length;
  }
  if (last === 0) return text;
  out.push(text.slice(last));
  return out;
}
