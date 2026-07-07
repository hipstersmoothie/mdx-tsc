import { describe, expect, test } from "vitest";
import { forFile, runCli } from "./helpers.js";

const project = "fixtures/parse-errors/tsconfig.json";

describe("MDX parse errors", () => {
  test("reports unparseable MDX as a diagnostic instead of passing silently", async () => {
    const { diagnostics, exitCode } = await runCli(["--project", project, "--pretty", "false"]);

    expect(exitCode).not.toBe(0);

    // Invalid JavaScript in an ESM block — reported at the offending token.
    const esm = forFile(diagnostics, "invalid-esm.mdx");
    expect(esm).toHaveLength(1);
    expect(esm[0]).toMatchObject({ line: 1, column: 19 });
    expect(esm[0]!.message).toContain("MDX parse error");

    // A never-closed expression — reported where parsing gave up.
    const expr = forFile(diagnostics, "unclosed-expression.mdx");
    expect(expr).toHaveLength(1);
    expect(expr[0]!.message).toContain("MDX parse error");
  });

  test("valid documents alongside broken ones are unaffected", async () => {
    const { diagnostics } = await runCli(["--project", project, "--pretty", "false"]);
    expect(forFile(diagnostics, "valid.mdx")).toEqual([]);
  });
});
