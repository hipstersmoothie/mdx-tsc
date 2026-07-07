import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as path from "node:path";
import { LspClient } from "./lsp-client.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const project = path.join(root, "fixtures", "frontmatter");

function fixture(rel: string): string {
  return path.join(project, rel);
}

describe("language server (editor squiggles)", () => {
  let client: LspClient;

  beforeAll(async () => {
    client = new LspClient();
    await client.start(project);
  });

  afterAll(() => client?.stop());

  test("publishes frontmatter value diagnostics matching the CLI", async () => {
    const file = fixture("blog/value-wrong-type.mdx");
    const uri = client.openMdx(file, readFileSync(file, "utf8"));
    const diagnostics = await client.waitForDiagnostics(uri);

    const wrongType = diagnostics.find((d) => d.code === 2322);
    expect(wrongType).toBeDefined();
    expect(wrongType!.message).toContain("date: number");
  });

  test("publishes no diagnostics for a valid document", async () => {
    const file = fixture("blog/valid.mdx");
    const uri = client.openMdx(file, readFileSync(file, "utf8"));
    const diagnostics = await client.settle(uri);
    expect(diagnostics).toEqual([]);
  });
});
