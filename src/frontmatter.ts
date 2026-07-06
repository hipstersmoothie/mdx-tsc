import picomatch from 'picomatch'
import type { FrontmatterSchemaEntry } from './options.js'

/**
 * Minimal shape of the upstream `VirtualCodePlugin` contract
 * (`@mdx-js/language-service`): a factory returning an object that can visit
 * mdast nodes and emit a JS string appended to the virtual `.jsx` file.
 */
export interface VirtualCodePluginObject {
  visit?(node: { type: string }): void
  finalize(): string
}
export type VirtualCodePlugin = () => VirtualCodePluginObject

const EXTENSION = /\.(mts|cts|ts|tsx|mjs|cjs|js|jsx)$/

/**
 * A VirtualCodePlugin that types the document's `frontmatter` export.
 *
 * Upstream emits `export const frontmatter = /** @type {any} *\/ (undefined)`.
 * We replace `any` with the schema type declared for the file's glob, so
 * `{frontmatter.title}` usages in the body are checked against it. The current
 * file is read from `getFile()` — safe because upstream instantiates and runs
 * plugins synchronously inside `createVirtualCode`, which our language-plugin
 * wrapper wraps to set that value first.
 */
export function createFrontmatterPlugin(
  getFile: () => string | undefined,
  entries: FrontmatterSchemaEntry[],
  exportName = 'frontmatter',
): VirtualCodePlugin {
  const matchers = entries.map((entry) => ({
    entry,
    isMatch: picomatch(toPosix(entry.absoluteGlob), { dot: true }),
  }))

  return () => {
    const file = getFile()
    const matched = file ? findMatch(matchers, file) : undefined
    let hasFrontmatter = false

    return {
      visit(node) {
        hasFrontmatter ||= node.type === 'yaml' || node.type === 'toml'
      },
      finalize() {
        if (matched) {
          const specifier = JSON.stringify(stripExtension(matched.module))
          return (
            `/** Typed by mdx-ts */\nexport const ${exportName} = ` +
            `/** @type {import(${specifier}).${matched.typeName}} */ (undefined)`
          )
        }
        // No schema for this file: preserve upstream's untyped behavior.
        const type = hasFrontmatter ? 'any' : 'undefined'
        return `export const ${exportName} = /** @type {${type}} */ (undefined)`
      },
    }
  }
}

function findMatch(
  matchers: { entry: FrontmatterSchemaEntry; isMatch: (s: string) => boolean }[],
  file: string,
): FrontmatterSchemaEntry | undefined {
  const posix = toPosix(file)
  for (const { entry, isMatch } of matchers) {
    if (isMatch(posix)) return entry
  }
  return undefined
}

function stripExtension(modulePath: string): string {
  return modulePath.replace(EXTENSION, '')
}

function toPosix(p: string): string {
  return p.replace(/\\/g, '/')
}
