# mdx-ts for VS Code

Live type-checking for [MDX](https://mdxjs.com/) — the same checks as the
[`mdx-tsc`](https://github.com/mdx-js/mdx-ts) CLI, as you type:

- MDX type errors, `{expression}` checks, and JSX component props
- provided components (`MDXProvider` / `mdx-components.tsx`)
- **frontmatter typing and value validation** against your schema
- MDX parse errors

It runs the `mdx-ts` language server, which embeds the official
`@mdx-js/language-service`, so it is a superset of the official **MDX**
extension. **Enable only one** — this extension warns if both are active.

## Requirements

Your project needs a `tsconfig.json` that includes your `.mdx` files and turns
on MDX checking (`"mdx": { "checkMdx": true }`). Frontmatter schemas are declared
in that same `"mdx"` section. See the main [mdx-ts README](../../README.md).

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
