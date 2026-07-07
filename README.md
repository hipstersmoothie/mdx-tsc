# mdx-tsc

Type-checking for [MDX](https://mdxjs.com/) — a `tsc`-style CLI, a language
server, and a VS Code extension. This is the monorepo.

## Packages

| Package                         | Path               | What it is                                                                                    |
| ------------------------------- | ------------------ | --------------------------------------------------------------------------------------------- |
| [`mdx-tsc`](./packages/mdx-tsc) | `packages/mdx-tsc` | The `mdx-tsc` CLI + `mdx-tsc-language-server`. **Start here** for usage docs.                 |
| `mdx-tsc-vscode`                | `editors/vscode`   | VS Code extension — additive type/frontmatter squiggles alongside the official MDX extension. |
| `mdx-tsc-playground`            | `playground`       | A demo MDX project for trying it in the editor.                                               |

Full documentation (CLI, frontmatter schemas, provided components, editor setup)
lives in the [`mdx-tsc` package README](./packages/mdx-tsc/README.md).

## Develop

```sh
pnpm install
pnpm build      # build every package
pnpm test       # run the mdx-tsc test suite
pnpm lint       # oxlint
pnpm format     # oxfmt (write); `pnpm format:check` to verify
```

### Try the extension

Press <kbd>F5</kbd> (**Test mdx-tsc extension (playground)**) to build everything
and open the `playground` in an Extension Development Host. Install the official
[MDX extension](https://marketplace.visualstudio.com/items?itemName=unifiedjs.vscode-mdx)
too for syntax highlighting — mdx-tsc is additive and only adds diagnostics.

## Releasing

Publishing is done **locally** (no CI publish workflow). Only `mdx-tsc` goes to
npm; the extension and playground are private.

**npm (`mdx-tsc`)** — versioned with
[changesets](https://github.com/changesets/changesets):

```sh
pnpm changeset          # record a change (bump + summary)
pnpm changeset version  # apply pending changesets to versions + changelogs
pnpm release            # build + `changeset publish` (needs `npm login`)
```

**VS Code extension** — build a `.vsix` and upload it to the Marketplace
manually:

```sh
pnpm --filter mdx-tsc-vscode run package   # -> editors/vscode/mdx-tsc-vscode-<version>.vsix
```

## License

[MIT](./LICENSE)
