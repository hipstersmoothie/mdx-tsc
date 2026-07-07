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

Only `mdx-tsc` is published to npm (the extension and playground are private).
Releases are managed with [changesets](https://github.com/changesets/changesets):

```sh
pnpm changeset          # record a change (choose the bump + write a summary)
```

On push to `main`, the [Release workflow](.github/workflows/release.yml) either
opens a "Version Packages" PR (when changesets are pending) or, once that PR is
merged, runs `pnpm release` (`build` + `changeset publish`) to publish to npm.

**One-time setup:** add an `NPM_TOKEN` repository secret with publish rights. The
first push after that publishes the current `0.1.0` (no changeset needed for the
initial release). To publish manually instead: `pnpm release`.

## License

[MIT](./LICENSE)
