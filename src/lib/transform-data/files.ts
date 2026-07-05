import { ComponentFunction, MonoFile } from "@/types/analysis";
import { FileComponentRef } from "@/types/grouping";
import { RawFile, RawMethod } from "@/types/journey";
import {
  clampConfidence,
  clampFunctionRole,
  clampSemanticRole,
} from "./sanitize";

/** Build the in-memory MonoFile[] from the on-disk Record<path, RawFile>.
 *
 *  When `fileToComponent` is supplied (fileGroups mode), each file's cluster
 *  key (`pkg`) is overridden with the NAME of the functional component that
 *  owns it — but only when a component in the file's OWN service claims it.
 *  The original namespace package is preserved in `namespacePkg`. Files no
 *  component claims keep their namespace package unchanged. */
export function transformFiles(
  raw: Record<string, RawFile>,
  fileToComponent?: Map<string, FileComponentRef>
): Record<string, MonoFile> {
  return Object.fromEntries(
    Object.entries(raw || {}).map(([path, f]) => {
      const ref = fileToComponent?.get(path);
      const claimed = !!ref && ref.service === f.service;
      return [
      path,
      {
        id: path,
        path,
        service: f.service,
        pkg: claimed ? ref!.componentName : f.package,
        ...(claimed ? { namespacePkg: f.package } : {}),
        name: path.split("/").pop() || path,
        sizeLines: f.sizeLines ?? 0,
        testCoverage: 0,
        complexityScore: f.complexityScore ?? 0,
        lastModifiedMonths: 0,
        changeCount90Days: 0,
        contributors: [],
        isEntryPoint: f.isEntryPoint ?? false,
        semanticRole: clampSemanticRole(f.semanticRole),
        aiSummary: "",
        domainConcepts: [],
        confidence: clampConfidence(f.confidence),
        importance: f.importance,
      },
      ];
    })
  );
}

/** Build the per-file ComponentFunction[] view that canvas components expect,
 *  by joining methods registry + calls graph + files registry. */
export function transformFunctions(
  methods: Record<string, RawMethod>,
  calls: Record<string, string[]>,
  files: Record<string, RawFile>
): Record<string, ComponentFunction[]> {
  const result: Record<string, ComponentFunction[]> = {};
  for (const [path, f] of Object.entries(files || {})) {
    result[path] = (f.methods || []).map((fqn) => {
      const m = methods[fqn];
      return {
        id: fqn,
        name: m?.name || "",
        complexity: m?.complexity ?? 1,
        lines: m?.lines ?? 0,
        calls: calls[fqn] || [],
        calledBy: [],
        isPublic: m?.isPublic ?? true,
        returnType: m?.returnType || "void",
        params:
          typeof m?.params === "string"
            ? String(m.params)
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            : [],
        description: m?.description || "",
        role: clampFunctionRole(m?.role || ""),
        importance: m?.importance ?? 0,
        ...(m?.body != null ? { body: m.body } : {}),
      } as ComponentFunction;
    });
  }
  return result;
}
