import { fileURLToPath } from 'node:url'
import { createMdxLanguagePlugin } from '@mdx-js/language-service'
import type { CodeMapping, LanguagePlugin, VirtualCode } from '@volar/language-core'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import { createFrontmatterMatcher, createFrontmatterPlugin } from './frontmatter.js'
import type { FrontmatterMatcher } from './frontmatter.js'
import {
  buildFrontmatterValidation,
  extractYamlFrontmatter,
} from './frontmatter-values.js'
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
  const match = createFrontmatterMatcher(options.frontmatter)

  const base = createMdxLanguagePlugin(
    // @ts-expect-error -- PluggableList tuple typing is looser at runtime.
    remarkSyntaxPlugins,
    [createFrontmatterPlugin(() => currentFile, match)],
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
        if (!code) return code
        if (surfaceParseError(code, snapshot)) return code
        checkFrontmatterValues(code, snapshot, currentFile, match)
        return code
      } finally {
        currentFile = undefined
      }
    },
  }
}

/**
 * When a document has frontmatter and a matching schema, append a
 * `@satisfies`-validated object literal (built from the parsed YAML, mapped back
 * to the YAML source) so the actual frontmatter *values* are type-checked — not
 * just body usages of `frontmatter`.
 */
function checkFrontmatterValues(
  code: VirtualCode,
  snapshot: unknown,
  file: string | undefined,
  match: FrontmatterMatcher,
): void {
  const entry = match(file)
  const embedded = code.embeddedCodes?.[0]
  if (!entry || !embedded) return

  const snap = snapshot as { getText(start: number, end: number): string; getLength(): number }
  const mdx = snap.getText(0, snap.getLength())
  const block = extractYamlFrontmatter(mdx)
  if (!block) return

  const validation = buildFrontmatterValidation(block.yaml, block.offset, entry)
  if (!validation) return

  const base = embedded.snapshot.getLength()
  const shifted: CodeMapping = {
    ...validation.mapping,
    generatedOffsets: validation.mapping.generatedOffsets.map((offset) => offset + base),
  }
  code.embeddedCodes![0] = appendToEmbedded(embedded, validation.text, [shifted])
}

/** Append text and extra mappings to an embedded code, preserving its own mappings. */
function appendToEmbedded(
  embedded: VirtualCode,
  append: string,
  extraMappings: CodeMapping[],
): VirtualCode {
  const text = embedded.snapshot.getText(0, embedded.snapshot.getLength()) + append
  return {
    id: embedded.id,
    languageId: embedded.languageId,
    snapshot: {
      getText: (start: number, end: number) => text.slice(start, end),
      getLength: () => text.length,
      getChangeRange: () => undefined,
    },
    mappings: [...embedded.mappings, ...extraMappings],
  }
}

/**
 * When upstream failed to parse a document it exposes the thrown message on
 * `code.error` and emits an empty fallback JS file (so nothing is checked).
 * Replace that fallback's embedded JS with one that reports the parse error as
 * a diagnostic, so broken MDX fails the check instead of passing silently.
 * Returns true when a parse error was handled (so no further checks apply).
 */
function surfaceParseError(code: VirtualCode, snapshot: unknown): boolean {
  const error = (code as { error?: ParseError }).error
  const embedded = code.embeddedCodes?.[0]
  if (!error || !embedded) return false

  const snap = snapshot as { getText(start: number, end: number): string; getLength(): number }
  const mdx = snap.getText(0, snap.getLength())
  code.embeddedCodes![0] = injectParseErrorDiagnostic(embedded, mdx, error)
  return true
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
