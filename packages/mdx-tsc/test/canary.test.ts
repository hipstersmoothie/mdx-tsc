import { describe, expect, test } from "vitest";
import { createMdxTsLanguagePlugin } from "../src/plugin.js";
import type { MdxTsOptions } from "../src/options.js";

/**
 * Guards the assumptions mdx-tsc makes about @mdx-js/language-service's virtual
 * output. If an upstream update changes this shape, this fails in our CI rather
 * than silently degrading users' type checking.
 */
function virtualJsxFor(mdx: string, options: Partial<MdxTsOptions> = {}): string {
  const plugin = createMdxTsLanguagePlugin({
    jsxImportSource: "react",
    frontmatter: [],
    ...options,
  }) as {
    createVirtualCode: (
      uri: string,
      languageId: string,
      snapshot: unknown,
    ) => {
      embeddedCodes?: {
        snapshot: { getText(s: number, e: number): string; getLength(): number };
      }[];
    };
  };

  const snapshot = {
    getText: (start: number, end: number) => mdx.slice(start, end),
    getLength: () => mdx.length,
    getChangeRange: () => undefined,
  };

  const code = plugin.createVirtualCode("/virtual/doc.mdx", "mdx", snapshot);
  const embedded = code.embeddedCodes?.[0];
  if (!embedded) throw new Error("no embedded code produced");
  return embedded.snapshot.getText(0, embedded.snapshot.getLength());
}

describe("upstream virtual-code shape", () => {
  test("projects MDX to a JSX module with the expected structure", () => {
    const jsx = virtualJsxFor('export const title = "Hi"\n\n# {title}\n');
    // The anchors mdx-tsc relies on across the upstream API.
    expect(jsx).toContain("@jsxImportSource react");
    expect(jsx).toContain("function _createMdxContent(");
    expect(jsx).toContain("MDXContent");
    expect(jsx).toContain("// @ts-check"); // enabled by checkMdx
  });

  test("emits our typed frontmatter export when a schema matches", () => {
    const jsx = virtualJsxFor("---\ntitle: Hi\n---\n\n# {frontmatter.title}\n", {
      frontmatter: [
        {
          glob: "**/*.mdx",
          absoluteGlob: "/**/*.mdx",
          module: "/abs/schema.ts",
          typeName: "BlogFrontmatter",
        },
      ],
    });
    expect(jsx).toContain("export const frontmatter");
    expect(jsx).toContain('import("/abs/schema").BlogFrontmatter');
  });
});
