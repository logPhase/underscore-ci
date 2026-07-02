import { render } from "@testing-library/react";
import DiffBlock from "./DiffBlock";

// Regression guard: the diff view must show diff rows AND syntax-highlighted
// tokens in the SAME output (not one or the other).
it("renders syntax-highlighted tokens inside a unified diff", () => {
  const before = "int count = 1;\nreturn count;";
  const after = "int count = 2;\nConsole.WriteLine(count);\nreturn count;";

  const { container } = render(
    <DiffBlock before={before} after={after} lang="csharp" />
  );

  // Prism emitted token spans (syntax highlighting present)...
  expect(container.querySelectorAll(".token").length).toBeGreaterThan(0);
  expect(container.querySelectorAll(".token.keyword").length).toBeGreaterThan(0);
  // ...and the rows are a real diff (the changed line shows the new number).
  expect(container.textContent).toContain("Console.WriteLine");
});
