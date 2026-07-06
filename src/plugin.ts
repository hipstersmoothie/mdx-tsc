import { fileURLToPath } from 'node:url'
import { createMdxLanguagePlugin } from '@mdx-js/language-service'
import type { LanguagePlugin, VirtualCode } from '@volar/language-core'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import { createFrontmatterPlugin } from './frontmatter.js'
import type { MdxTsOptions } from './options.js'
import { injectParseErrorDiagnostic, type ParseError } from './parse-errors.js'

/** The default remark *syntax* plugins enabled for parsing MDX. */
const remarkSyntaxPlugins = [
  [remarkFrontmatter, ['toml', 'yaml']],
  remarkGfm,
]

/**
 * Build the MDX language plugin used for a program: the upstream
 * `@mdx-js/language-service` plugin, extended with frontmatter typing.
 *
 * The frontmatter plugin needs the current file to match schema globs, but the
 * upstream `VirtualCodePlugin` contract passes no filename. We bridge that by
 * wrapping `createVirtualCode` to record the file in a closure variable that the
 * plugin reads during `finalize()` — sound because upstream instantiates and
 * runs plugins synchronously within `createVirtualCode`.
 */
export function createMdxTsLanguagePlugin(
  options: MdxTsOptions,
): LanguagePlugin<string> {
  let currentFile: string | undefined

  const base = createMdxLanguagePlugin(
    // @ts-expect-error -- PluggableList tuple typing is looser at runtime.
    remarkSyntaxPlugins,
    [createFrontmatterPlugin(() => currentFile, options.frontmatter)],
    options.checkMdx,
    options.jsxImportSource,
  ) as unknown as LanguagePlugin<string>

  const originalCreateVirtualCode = base.createVirtualCode?.bind(base)

  return {
    ...base,
    createVirtualCode(fileNameOrUri, languageId, snapshot, ctx) {
      currentFile = toPath(fileNameOrUri)
      try {
        const code = originalCreateVirtualCode?.(fileNameOrUri, languageId, snapshot, ctx)
        return code ? surfaceParseError(code, snapshot) : code
      } finally {
        currentFile = undefined
      }
    },
  }
}

/**
 * When upstream failed to parse a document it exposes the thrown message on
 * `code.error` and emits an empty fallback JS file (so nothing is checked).
 * Replace that fallback's embedded JS with one that reports the parse error as
 * a diagnostic, so broken MDX fails the check instead of passing silently.
 */
function surfaceParseError(code: VirtualCode, snapshot: unknown): VirtualCode {
  const error = (code as { error?: ParseError }).error
  const embedded = code.embeddedCodes?.[0]
  if (!error || !embedded) return code

  const snap = snapshot as { getText(start: number, end: number): string; getLength(): number }
  const mdx = snap.getText(0, snap.getLength())
  code.embeddedCodes![0] = injectParseErrorDiagnostic(embedded, mdx, error)
  return code
}

/** Normalize the plugin's `string | URI` file argument to a filesystem path. */
function toPath(fileNameOrUri: unknown): string | undefined {
  if (typeof fileNameOrUri === 'string') {
    return fileNameOrUri.startsWith('file://')
      ? fileURLToPath(fileNameOrUri)
      : fileNameOrUri
  }
  if (fileNameOrUri && typeof fileNameOrUri === 'object') {
    const uri = fileNameOrUri as { fsPath?: string; path?: string }
    return uri.fsPath ?? uri.path ?? String(fileNameOrUri)
  }
  return undefined
}
