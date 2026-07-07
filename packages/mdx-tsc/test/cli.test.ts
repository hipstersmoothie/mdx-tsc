import { describe, expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { forFile, runCli } from "./helpers.js";

describe("mdx-tsc on the basic fixture", () => {
  test("reports MDX type errors at exact source positions and exits non-zero", async () => {
    const { diagnostics, exitCode } = await runCli([
      "--project",
      "fixtures/basic/tsconfig.json",
      "--pretty",
      "false",
    ]);

    expect(exitCode).not.toBe(0);

    const errors = forFile(diagnostics, "errors.mdx").map((d) => ({
      line: d.line,
      column: d.column,
      code: d.code,
    }));

    // Positions are mapped back into the .mdx source — the whole point of the tool.
    expect(errors).toContainEqual({ line: 2, column: 23, code: "TS2307" }); // bad import specifier
    expect(errors).toContainEqual({ line: 8, column: 9, code: "TS2322" }); // <Button label={42} />
    expect(errors).toContainEqual({ line: 10, column: 21, code: "TS2339" }); // count.toUpperCase()
  });

  test("produces no diagnostics for a clean document", async () => {
    const { diagnostics } = await runCli([
      "--project",
      "fixtures/basic/tsconfig.json",
      "--pretty",
      "false",
    ]);
    expect(forFile(diagnostics, "clean.mdx")).toEqual([]);
  });
});

describe("project resolution", () => {
  test("exits 2 with guidance when no project can be found", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "mdx-tsc-"));
    try {
      const { exitCode, stderr } = await runCli([], dir);
      expect(exitCode).toBe(2);
      expect(stderr).toContain("no TypeScript project found");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
