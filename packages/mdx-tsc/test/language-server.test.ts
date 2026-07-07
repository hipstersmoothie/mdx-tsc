import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as path from "node:path";
import { LspClient } from "./lsp-client.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const project = path.join(root, "fixtures", "frontmatter");

function fixture(rel: string): string {
  return path.join(project, rel);
}

/** Position just inside `marker` (default 1 char in) within `text`. */
function positionOf(text: string, marker: string, into = 1): { line: number; character: number } {
  const idx = text.indexOf(marker) + into;
  const pre = text.slice(0, idx);
  return { line: pre.split("\n").length - 1, character: idx - (pre.lastIndexOf("\n") + 1) };
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

  test("resolves frontmatter YAML keys to their schema field (hover + completion)", async () => {
    const file = fixture("blog/valid.mdx");
    const text = readFileSync(file, "utf8");
    const uri = client.openMdx(file, text);
    const at = positionOf(text, "title:");

    // Hover on the YAML key shows the schema field's type, not `unknown`.
    const hover = await client.hover(uri, at);
    expect(hover).toContain("BlogFrontmatter.title");
    expect(hover).toContain("string");

    // Completing at the key offers the schema's fields.
    const labels = await client.completionLabels(uri, at);
    expect(labels).toEqual(expect.arrayContaining(["title", "date", "tags"]));
  });

  test("completes a half-typed frontmatter key before its colon lands", async () => {
    // A new key `dr` with no colon yet — the block doesn't parse cleanly, but
    // completion should still offer the schema's fields.
    const text = `---\ntitle: Hi\ndate: "x"\ntags: [a]\ndr\n---\n\n# {frontmatter.title}\n`;
    const uri = pathToFileURL(fixture("blog/half-typed.mdx")).href;
    client.notify("textDocument/didOpen", {
      textDocument: { uri, languageId: "mdx", version: 1, text },
    });
    const labels = await client.completionLabels(uri, positionOf(text, "dr\n", 2));
    expect(labels).toEqual(expect.arrayContaining(["title", "date", "tags", "draft?"]));
  });

  test("completes schema fields on a blank frontmatter line", async () => {
    const text = `---\ntitle: Hi\n\n---\n\n# {frontmatter.title}\n`;
    const uri = pathToFileURL(fixture("blog/blank-line.mdx")).href;
    client.notify("textDocument/didOpen", {
      textDocument: { uri, languageId: "mdx", version: 1, text },
    });
    // The empty line is line index 2 (after `---` and `title: Hi`).
    const labels = await client.completionLabels(uri, { line: 2, character: 0 });
    expect(labels).toEqual(expect.arrayContaining(["title", "date", "tags", "draft?"]));
  });
});
