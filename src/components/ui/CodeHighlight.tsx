/**
 * CodeHighlight — Prism-tokenized source rendering, app-themed.
 *
 * One component for every place code shows (code panel, BPMN step
 * functions, drift map strips) so the language coloring, the code font
 * (JetBrains Mono, loaded in main.tsx) and the size are coherent
 * everywhere. Token colors live in index.css (`.token.*`) on the app's
 * own palette — no stock Prism theme import.
 *
 * Language comes from the file extension when known; C# is the
 * default (the analyzed repos are C#/Java/Python).
 */
import React, { useMemo } from 'react';
import Prism from 'prismjs';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-csharp';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-python';

export type CodeLang = 'csharp' | 'java' | 'python';

export function langFromFile(file?: string | null): CodeLang {
  if (file?.endsWith('.java')) return 'java';
  if (file?.endsWith('.py')) return 'python';
  return 'csharp';
}

/** Raw highlighted HTML for one code slice. Used per-LINE by CodeBlock
 *  (line numbers force row-wise rendering; multi-line tokens like block
 *  comments degrade gracefully to plain text on continuation lines). */
export function highlightHtml(code: string, lang: CodeLang = 'csharp'): string {
  const grammar = Prism.languages[lang] ?? Prism.languages.csharp;
  try {
    return Prism.highlight(code, grammar, lang);
  } catch {
    return code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

interface Props {
  code: string;
  lang?: CodeLang;
  /** Extra classes on the <code> element (sizing is preset). */
  className?: string;
}

/** Inline-block of highlighted code — line structure preserved, no
 *  wrapper chrome (callers own borders/scroll/padding). */
export const CodeHighlight: React.FC<Props> = ({ code, lang = 'csharp', className }) => {
  const html = useMemo(() => highlightHtml(code, lang), [code, lang]);
  return (
    <code
      className={`code-surface ${className ?? ''}`}
      // Prism output is generated from the tokenizer over our own
      // source text — script-safe by construction.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

export default CodeHighlight;
