# mdx-tsc

## 0.2.0

### Minor Changes

- 7613367: Editor language features for frontmatter, powered by the mdx-tsc language server.

  - **New `mdx-tsc.languageFeatures` setting** (`scoped` | `full` | `off`, default `scoped`). In `scoped` mode the server contributes hover, go-to-definition, and completion **only** for the typed `frontmatter` — the thing the official MDX extension can't type — and stays silent elsewhere, so nothing is duplicated. `full` exposes the whole TypeScript service; `off` keeps mdx-tsc diagnostics-only.
  - **Frontmatter YAML keys resolve to their schema field:** hovering a key shows its real type (e.g. `title: string`) instead of `unknown`, go-to-definition jumps to the schema, and completion offers the schema's fields — including while a key is still being typed (before its colon lands) and on blank lines in the block.
  - **VS Code extension:** enables quick suggestions in `.mdx` files so key completion auto-triggers as you type, and prompts to reload when `mdx-tsc.languageFeatures` changes.
