# mdx-tsc for VS Code

Live type-checking for [MDX](https://mdxjs.com/) — the same checks as the
[`mdx-tsc`](https://github.com/hipstersmoothie/mdx-tsc) CLI, as you type:

- MDX type errors, `{expression}` checks, and JSX component props
- provided components (`MDXProvider` / `mdx-components.tsx`)
- **frontmatter typing and value validation** against your schema

## Use it alongside the official MDX extension

mdx-tsc is **additive** — it publishes only type/frontmatter diagnostics and
nothing else, so it complements the official
[MDX extension](https://marketplace.visualstudio.com/items?itemName=unifiedjs.vscode-mdx)
rather than replacing it:

1. Keep the **official MDX extension** installed (highlighting, hover,
   completion, markdown features, parse errors).
2. Install **mdx-tsc** for the type + frontmatter squiggles.
3. In your `tsconfig.json`, set **`"mdx": { "checkMdx": false }`** so the
   official extension stops emitting type errors — mdx-tsc owns those now, so
   they aren't reported twice.

## Requirements

Your project needs a `tsconfig.json` that includes your `.mdx` files. Frontmatter
schemas are declared in the `"mdx"` section. See the main
[mdx-tsc README](../../README.md).

## Develop

From the repo root:

```sh
pnpm install
pnpm build          # builds the mdx-tsc server, then bundles this extension
```

Press <kbd>F5</kbd> (**Test mdx-tsc extension (playground)**) to open an
Extension Development Host with the demo project loaded.

The extension and the language server are bundled with esbuild into
`dist/extension.js` and `dist/server.js`, so the packaged `.vsix` is
self-contained. The TypeScript SDK is resolved via `@volar/vscode`
(`typescript.tsdk` setting or VS Code's bundled TypeScript), so checking matches
your workspace.

## Publishing

`pnpm --filter mdx-tsc-vscode run package` builds a `.vsix`. Releases are
automated: bump `version`, push a `vscode-v<version>` tag, and the
[publish workflow](../../.github/workflows/publish-extension.yml) runs
`vsce publish` (needs a `VSCE_PAT` secret).
