# mdx-ts

Type-checking for [MDX](https://mdxjs.com/) — a `tsc`-style CLI, a language
server, and a VS Code extension. This is the monorepo.

## Packages

| Package                       | Path              | What it is                                                                                    |
| ----------------------------- | ----------------- | --------------------------------------------------------------------------------------------- |
| [`mdx-ts`](./packages/mdx-ts) | `packages/mdx-ts` | The `mdx-tsc` CLI + `mdx-ts-language-server`. **Start here** for usage docs.                  |
| `mdx-ts-vscode`               | `editors/vscode`  | VS Code extension — additive type/frontmatter squiggles alongside the official MDX extension. |
| `mdx-ts-playground`           | `playground`      | A demo MDX project for trying it in the editor.                                               |

Full documentation (CLI, frontmatter schemas, provided components, editor setup)
lives in the [`mdx-ts` package README](./packages/mdx-ts/README.md).

## Develop

```sh
pnpm install
pnpm build      # build every package
pnpm test       # run the mdx-ts test suite
pnpm lint       # oxlint
pnpm format     # oxfmt (write); `pnpm format:check` to verify
```

### Try the extension

Press <kbd>F5</kbd> (**Test mdx-ts extension (playground)**) to build everything
and open the `playground` in an Extension Development Host. Install the official
[MDX extension](https://marketplace.visualstudio.com/items?itemName=unifiedjs.vscode-mdx)
too for syntax highlighting — mdx-ts is additive and only adds diagnostics.

## License

[MIT](./LICENSE)
