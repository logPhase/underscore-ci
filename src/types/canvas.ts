import { ComponentFunction } from "@/types/analysis";

// ── Call chain edge computation ──
export interface CallChainEdge {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  type: "caller" | "callee";
  scope: "same-file" | "cross-file" | "cross-service";
  targetName: string;
  targetFqn: string;
}

// ── Method Layout ──
export interface MethodLayoutPosition {
  fn: ComponentFunction;
  mx: number;
  my: number;
  methodR: number;
  angle: number;
}
