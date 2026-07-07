# mdx-ts for VS Code

Live type-checking for [MDX](https://mdxjs.com/) — the same checks as the
[`mdx-tsc`](https://github.com/mdx-js/mdx-ts) CLI, as you type:

- MDX type errors, `{expression}` checks, and JSX component props
- provided components (`MDXProvider` / `mdx-components.tsx`)
- **frontmatter typing and value validation** against your schema

## Use it alongside the official MDX extension

mdx-ts is **additive** — it publishes only type/frontmatter diagnostics and
nothing else, so it complements the official
[MDX extension](https://marketplace.visualstudio.com/items?itemName=unifiedjs.vscode-mdx)
rather than replacing it:

1. Keep the **official MDX extension** installed (highlighting, hover,
   completion, markdown features, parse errors).
2. Install **mdx-ts** for the type + frontmatter squiggles.
3. In your `tsconfig.json`, set **`"mdx": { "checkMdx": false }`** so the
   official extension stops emitting type errors — mdx-ts owns those now, so
   they aren't reported twice.

## Requirements

Your project needs a `tsconfig.json` that includes your `.mdx` files. Frontmatter
schemas are declared in the `"mdx"` section. See the main
[mdx-ts README](../../README.md).

## Develop

```sh
# from the repo root, build the server the extension launches
npm run build

# then, in this folder
cd editors/vscode
npm install
npm run compile
```

Press <kbd>F5</kbd> (**Run mdx-ts extension**) to open an Extension Development
Host, then open a project with `.mdx` files to see diagnostics.

The TypeScript SDK is resolved via `@volar/vscode` (`typescript.tsdk` setting or
VS Code's bundled TypeScript), so checking matches your workspace.
