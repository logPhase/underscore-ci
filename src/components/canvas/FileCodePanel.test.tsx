import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, it, expect } from "vitest";
import { FileCodePanel } from "./FileCodePanel";
import { useAnalysis } from "@/store/use-analysis-store";
import { useFocusStore } from "@/store/use-focus-store";
import { useSelectionStore } from "@/store/use-selection-store";
import type {
  ComponentFunction,
  MonoFile,
  TransformedData,
} from "@/types/analysis";

const file: MonoFile = {
  id: "F1",
  path: "src/Ledger/Account.cs",
  service: "svc-ledger",
  pkg: "Ledger",
  name: "Account.cs",
  sizeLines: 40,
  testCoverage: 0,
  complexityScore: 3,
  lastModifiedMonths: 1,
  changeCount90Days: 2,
  contributors: [],
  isEntryPoint: false,
  semanticRole: "service",
  aiSummary: "",
  domainConcepts: [],
  confidence: "high",
};

const fns: ComponentFunction[] = [
  {
    id: "F1#Deposit",
    name: "Deposit",
    complexity: 2,
    lines: 4,
    calls: [],
    calledBy: [],
    isPublic: true,
    returnType: "void",
    params: ["decimal amount"],
    description: "",
    role: "service",
    importance: 0.5,
    body: "public void Deposit(decimal amount) {\n  balance += amount;\n}",
  },
  {
    id: "F1#Withdraw",
    name: "Withdraw",
    complexity: 3,
    lines: 5,
    calls: [],
    calledBy: [],
    isPublic: true,
    returnType: "bool",
    params: ["decimal amount"],
    description: "",
    role: "service",
    importance: 0.6,
    body: "public bool Withdraw(decimal amount) {\n  if (amount > balance) return false;\n  balance -= amount;\n  return true;\n}",
  },
];

beforeEach(() => {
  useAnalysis.setState({
    status: "complete",
    error: null,
    transformedData: {
      files: { [file.id]: file },
      functions: { [file.id]: fns },
    } as unknown as TransformedData,
  });
  useSelectionStore.setState({ selectedFunctionCtx: null });
  useFocusStore.setState({ codePanelFileId: null });
});

afterEach(() => {
  cleanup();
  useAnalysis.setState({ status: "idle", error: null, transformedData: null });
});

it("renders nothing when no file is focused", () => {
  const { container } = render(<FileCodePanel />);
  expect(container.firstChild).toBeNull();
});

it("renders each method of the focused file, in order, syntax-highlighted", () => {
  useFocusStore.setState({ codePanelFileId: "F1" });

  const { container } = render(<FileCodePanel />);
  const text = container.textContent ?? "";

  // Header: file identity + counts
  expect(text).toContain("Account.cs");
  expect(text).toContain("src/Ledger/Account.cs");
  expect(text).toContain("2 methods");

  // Method dividers, in source order
  expect(text).toContain("Deposit");
  expect(text).toContain("Withdraw");
  expect(text.indexOf("Deposit")).toBeLessThan(text.indexOf("Withdraw"));

  // Both bodies present...
  expect(text).toContain("balance += amount");
  expect(text).toContain("amount > balance");

  // ...and Prism highlighted them (C# keyword tokens present).
  expect(container.querySelectorAll(".token").length).toBeGreaterThan(0);
  expect(
    container.querySelectorAll(".token.keyword").length
  ).toBeGreaterThan(0);
});

it("renders the resize affordances (drag handle + width steppers) when open", () => {
  useFocusStore.setState({ codePanelFileId: "F1" });

  const { container } = render(<FileCodePanel />);
  // Drag handle + both width steppers are reachable by their aria-labels.
  expect(container.querySelector('[aria-label="Resize panel"]')).not.toBeNull();
  expect(container.querySelector('[aria-label="Make panel wider"]')).not.toBeNull();
  expect(
    container.querySelector('[aria-label="Make panel narrower"]')
  ).not.toBeNull();
});

it("yields the slot when a method is selected (panels never fight)", () => {
  useFocusStore.setState({ codePanelFileId: "F1" });
  useSelectionStore.setState({
    selectedFunctionCtx: {
      functionId: "F1#Deposit",
      fileId: "F1",
      packageId: "Ledger",
      serviceId: "svc-ledger",
      functionName: "Deposit",
    },
  });

  const { container } = render(<FileCodePanel />);
  expect(container.firstChild).toBeNull();
});
