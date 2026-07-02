/**
 * BionicText — opt-in "fixation anchor" rendering (Bionic-Reading style)
 * via text-vide: the first chunk of each word is bolded so the eye has a
 * landing point per word.
 *
 * Honesty note: controlled studies (Readwise n=2074; Snell, Acta
 * Psychologica 2024) find NO average speed/comprehension gain — but
 * individual readers consistently report lower tracking fatigue. Hence
 * this is a per-user toggle (default OFF), never a default style.
 *
 * Safety: input text is HTML-escaped BEFORE text-vide processing — our
 * claim/journey texts legitimately contain `<` / `>` (C# generics like
 * IReadOnlyList<FlowStpAuthorizationData>), so the only markup in the
 * final HTML is text-vide's own <b> tags.
 */
import React, { useMemo } from 'react';
import { textVide } from 'text-vide';

const STORAGE_KEY = 'reading-aid-bionic';

export function loadReadingAid(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
}
export function saveReadingAid(on: boolean): void {
  try { localStorage.setItem(STORAGE_KEY, on ? '1' : '0'); } catch { /* ignore */ }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const BionicText: React.FC<{
  text: string;
  enabled: boolean;
  className?: string;
  style?: React.CSSProperties;
}> = ({ text, enabled, className, style }) => {
  const html = useMemo(
    () => (enabled ? textVide(escapeHtml(text)) : null),
    [text, enabled],
  );
  if (!enabled || html === null) {
    return <span className={className} style={style}>{text}</span>;
  }
  return (
    <span
      className={`bionic-text ${className ?? ''}`}
      style={style}
      // Safe: input escaped above; the only tags are text-vide's <b>.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

export default BionicText;
