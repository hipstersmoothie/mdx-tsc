import { describe, expect, test } from "vitest";
import { forFile, runCli } from "./helpers.js";

const project = "fixtures/provided-components/tsconfig.json";

describe("provider-injected components", () => {
  test("checks props of components declared on MDXProvidedComponents", async () => {
    const { diagnostics, exitCode } = await runCli(["--project", project, "--pretty", "false"]);
    expect(exitCode).not.toBe(0);

    // <Chart> is never imported in the .mdx — it is provided via the global
    // MDXProvidedComponents augmentation, yet its props are still checked.
    const bad = forFile(diagnostics, "bad.mdx");
    expect(bad).toHaveLength(1);
    expect(bad[0]).toMatchObject({ line: 5, column: 8, code: "TS2322" });
  });

  test("accepts correct usage of a provided component", async () => {
    const { diagnostics } = await runCli(["--project", project, "--pretty", "false"]);
    expect(forFile(diagnostics, "good.mdx")).toEqual([]);
  });
});
