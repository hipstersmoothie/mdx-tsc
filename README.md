# mdx-ts

**A `tsc`-style CLI that type-checks your [MDX](https://mdxjs.com/).**

MDX lets you use imports, JSX components, and `{expressions}` inside Markdown —
but until now there was no way to type-check it in CI. Editors could show errors
(via the official [`mdx-analyzer`](https://github.com/mdx-js/mdx-analyzer)), yet
nothing failed your build when an MDX file passed the wrong prop to a component
or referenced a field that doesn't exist.

`mdx-ts` is that missing piece. Its `mdx-tsc` command is a drop-in `tsc`: it
type-checks `.mdx` alongside your `.ts`/`.tsx`, reports errors at the exact spot
in the MDX source, and exits non-zero when something is wrong.

```
$ mdx-tsc --project tsconfig.json
posts/intro.mdx(8,9): error TS2322: Type 'number' is not assignable to type 'string'.
posts/intro.mdx(10,21): error TS2339: Property 'toUpperCase' does not exist on type 'number'.
```

It is built on the same Volar-based engine as the official MDX editor tooling
(`@mdx-js/language-service`) driven through Volar's `runTsc`, so its results
match what you see in your editor.

## Install

```sh
npm install --save-dev mdx-ts typescript
```

`typescript` is a peer dependency — `mdx-tsc` uses whichever version your project
already has.

## Usage

`mdx-tsc` forwards every argument to `tsc`, so anything `tsc` accepts works:

```sh
mdx-tsc --project tsconfig.json     # check once (CI)
mdx-tsc -p tsconfig.json --watch    # re-check on change
```

Add it to your scripts:

```json
{
  "scripts": {
    "typecheck": "mdx-tsc --project tsconfig.json"
  }
}
```

### A tsconfig that checks MDX

Point `include` at your `.mdx` files and turn on MDX checking:

```jsonc
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "react",
    "module": "preserve",
    "moduleResolution": "bundler",
    "allowJs": true,
    "checkJs": true,
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
  },
  // Enable strict MDX type-checking (on by default in mdx-tsc; set false to relax).
  "mdx": { "checkMdx": true },
  "include": ["**/*.mdx", "**/*.ts", "**/*.tsx"],
}
```

## Frontmatter typing

`mdx-ts` can type each document's `frontmatter` against a schema you declare,
matched by glob, in an `"mdx-ts"` section of your tsconfig:

```jsonc
{
  "mdx-ts": {
    "frontmatter": {
      "content/blog/**/*.mdx": "./src/content.ts#BlogFrontmatter",
      "content/docs/**/*.mdx": "./src/content.ts#DocFrontmatter",
    },
  },
}
```

Each value is `./module#ExportedType`. The referenced type can be a plain
TypeScript type or a [Zod](https://zod.dev/) inferred type — mdx-ts only reads
the static type, it never runs your schema:

```ts
// src/content.ts
export interface BlogFrontmatter {
  title: string;
  date: string;
  tags: string[];
}

import { z } from "zod";
export const docSchema = z.object({ title: z.string(), order: z.number() });
export type DocFrontmatter = z.infer<typeof docSchema>;
```

Both the **frontmatter values** and body **usages** of `frontmatter` are then
checked against the schema:

```mdx
---
title: Hello
date: 20260706 # error: number is not assignable to string
tags: [intro]
author: Jane # error: 'author' does not exist in type 'BlogFrontmatter'
---

# {frontmatter.title}

Posted {frontmatter.publishedAt}. {/* error: publishedAt is not on BlogFrontmatter */}
```

Wrong value types, unknown keys, and missing required fields are reported on the
offending line of the YAML. Files that match no glob keep an untyped (`any`)
`frontmatter`, so this is opt-in per content collection.

## Provided components (MDXProvider / `mdx-components.tsx`)

Components you inject through `MDXProvider` or Next.js's `mdx-components.tsx` are
used in MDX without an import. Tell the type system about them once by augmenting
the global `MDXProvidedComponents` interface, and their props get checked
everywhere:

```ts
// mdx-env.d.ts
import type { Chart } from "./components.js";

declare global {
  interface MDXProvidedComponents {
    Chart: typeof Chart;
  }
}
export {};
```

```mdx
<Chart data={42} /> {/* error: number is not assignable to number[] */}
```

Make sure the `.d.ts` is covered by your tsconfig `include`.

## In CI (GitHub Actions)

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 22
- run: npm ci
- run: npx mdx-tsc --project tsconfig.json
```

## Editor support (squiggles)

The same checks are available live in your editor through the **mdx-ts language
server** (`mdx-ts-language-server`), which embeds the official
`@mdx-js/language-service` — so it is a superset of the official MDX tooling.

- **VS Code**: the extension in [`editors/vscode`](./editors/vscode) launches the
  server for `.mdx` files. Enable it *instead of* the official MDX extension.
- **Neovim / Zed / Helix / any LSP editor**: point the editor at the
  `mdx-ts-language-server` binary (stdio), passing
  `initializationOptions.typescript.tsdk` (your TypeScript `lib` directory).

## What it checks

- ESM `import`/`export` resolution in MDX
- `{expression}` types
- JSX component props (imported **and** provider-injected components)
- Frontmatter, against a per-glob schema you declare
- MDX **parse errors** — a document that can't be parsed is reported at the
  offending location (with the reason), so broken MDX fails the check instead
  of slipping through

## Limitations

- **MDX must be valid JavaScript + JSDoc.** Like all MDX, the ESM in a document
  is JavaScript — TypeScript-only syntax such as `export const x: number = …`
  is not valid. Use JSDoc (`/** @type {number} */`) for annotations.
- **Remark/rehype transformers aren't applied** (an upstream
  `@mdx-js/language-service` constraint), so syntax added by transformer plugins
  is not reflected in types.

## How it works

`mdx-tsc` runs the real TypeScript compiler through Volar's `runTsc`, which
swaps in a program that understands `.mdx`. Each document is projected to a
virtual JSX module (via `@mdx-js/language-service`) with source maps back to the
MDX, so diagnostics land on the original file. mdx-ts adds frontmatter typing on
top of that projection and reads its configuration from your tsconfig.

## License

[MIT](./LICENSE)
