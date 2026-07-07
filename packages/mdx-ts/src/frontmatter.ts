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

/** A function that returns the frontmatter schema entry matching a file, if any. */
export type FrontmatterMatcher = (file: string | undefined) => FrontmatterSchemaEntry | undefined

/** Compile the glob matchers once and reuse them across files in a program. */
export function createFrontmatterMatcher(
  entries: FrontmatterSchemaEntry[],
): FrontmatterMatcher {
  const matchers = entries.map((entry) => ({
    entry,
    isMatch: picomatch(toPosix(entry.absoluteGlob), { dot: true }),
  }))
  return (file) => {
    if (!file) return undefined
    const posix = toPosix(file)
    for (const { entry, isMatch } of matchers) {
      if (isMatch(posix)) return entry
    }
    return undefined
  }
}

/**
 * A VirtualCodePlugin that types the document's `frontmatter` export.
 *
 * Upstream emits `export const frontmatter = /** @type {any} *\/ (undefined)`.
 * We replace `any` with the schema type declared for the file's glob, so
 * `{frontmatter.title}` usages in the body are checked against it. The current
 * file is read from `getFile()` — safe because upstream instantiates and runs
 * plugins synchronously inside `createVirtualCode`, which our language-plugin
 * wrapper wraps to set that value first. (Checking of the frontmatter *values*
 * is layered on separately in the wrapper, since the plugin seam carries no
 * source mappings.)
 */
export function createFrontmatterPlugin(
  getFile: () => string | undefined,
  match: FrontmatterMatcher,
  exportName = 'frontmatter',
): VirtualCodePlugin {
  return () => {
    const matched = match(getFile())
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

export function stripExtension(modulePath: string): string {
  return modulePath.replace(EXTENSION, '')
}

function toPosix(p: string): string {
  return p.replace(/\\/g, '/')
}
