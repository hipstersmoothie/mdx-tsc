import { describe, expect, test } from "vitest";
import { forFile, runCli } from "./helpers.js";

const project = "fixtures/undefined-components/tsconfig.json";

describe("undefined components", () => {
  test("flags a capitalized component that is neither imported nor provided", async () => {
    const { diagnostics, exitCode } = await runCli(["--project", project, "--pretty", "false"]);
    expect(exitCode).not.toBe(0);

    const doc = forFile(diagnostics, "doc.mdx");
    // <Widget> and <Missing.Sub> are unknown -> errors (not silently `any`).
    expect(doc).toContainEqual(
      expect.objectContaining({
        line: 5,
        code: "TS2339",
        message: expect.stringContaining("Widget"),
      }),
    );
    expect(doc).toContainEqual(
      expect.objectContaining({
        line: 7,
        code: "TS2339",
        message: expect.stringContaining("Missing"),
      }),
    );
  });

  test("does not flag an imported component", async () => {
    const { diagnostics } = await runCli(["--project", project, "--pretty", "false"]);
    // `<Button>` is imported and used on line 3 — no diagnostic there.
    const onButtonLine = forFile(diagnostics, "doc.mdx").filter((d) => d.line === 3);
    expect(onButtonLine).toEqual([]);
  });
});
