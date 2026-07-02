import { ChapterPRStatus } from "@/types/journey";

// ── Hydration helpers (new shape -> in-memory shape) ─────────────────

/** Last-segment of `classFqn` ("App.Foo.BarSvc" -> "BarSvc"). */
export function classNameOf(classFqn: string): string {
  const cf = classFqn || "";
  const i = cf.lastIndexOf(".");
  return i >= 0 ? cf.slice(i + 1) : cf;
}

export const slugifyTitle = (title: string): string => {
  const base = (title || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "chapter";
};

// FNV-1a 32-bit, hex-encoded. Sync, dependency-free, ~16M space \u2014 plenty for
// disambiguating a few hundred journey slugs while keeping URLs stable per-id.
export const shortHash = (input: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0").slice(0, 6);
};

// Last identifier segment of an FQN, with the parameter list stripped:
// "LibraryApp.Services.MemberService.FindMemberByEmail(string)" -> "FindMemberByEmail"
export const shortNameFromFqn = (fqn: string): string => {
  const noParens = (fqn || "").replace(/\(.*$/, "");
  return noParens.split(".").pop() || "";
};

/** Class FQN derived from a method FQN — strip the parameter list and
 *  drop the trailing method-name segment. */
export function classFqnFromFqn(fqn: string): string {
  const noParens = (fqn || "").replace(/\(.*$/, "");
  const parts = noParens.split(".");
  return parts.length >= 2 ? parts.slice(0, -1).join(".") : noParens;
}

export const impactRank = (status?: ChapterPRStatus): number => {
  switch (status) {
    case "removed":
      return 4;
    case "demoted":
      return 3;
    case "affected":
      return 2;
    case "added":
      return 1;
    default:
      return 0;
  }
};
