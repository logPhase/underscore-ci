import {
  VALID_CONFIDENCES,
  VALID_CRITICALITIES,
  VALID_FUNCTION_ROLES,
  VALID_SEMANTIC_ROLES,
  VALID_STATUSES,
} from "@/data/transform-data";
import { FunctionRole, SemanticRole } from "@/types/analysis";
import { ChapterCriticality, ChapterStatus } from "@/types/journey";

export const clampSemanticRole = (r: string): SemanticRole =>
  (VALID_SEMANTIC_ROLES.has(r) ? r : "business-logic") as SemanticRole;

export const clampFunctionRole = (r: string): FunctionRole =>
  (VALID_FUNCTION_ROLES.has(r) ? r : "utility") as FunctionRole;

export const clampConfidence = (c: string): "high" | "medium" =>
  (VALID_CONFIDENCES.has(c) ? c : "high") as "high" | "medium";

export const clampCriticality = (c: unknown): ChapterCriticality =>
  (typeof c === "string" && VALID_CRITICALITIES.has(c)
    ? c
    : "medium") as ChapterCriticality;

export const clampStatus = (s: unknown): ChapterStatus =>
  (typeof s === "string" && VALID_STATUSES.has(s)
    ? s
    : "ai-draft") as ChapterStatus;
