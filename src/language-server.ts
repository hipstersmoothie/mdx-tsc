#!/usr/bin/env node
import assert from 'node:assert'
import * as path from 'node:path'
import {
  createConnection,
  createServer,
  createTypeScriptProject,
  loadTsdkByPath,
} from '@volar/language-server/node.js'
import { create as createTypeScriptServicePlugin } from 'volar-service-typescript'
import { resolveMdxTsOptionsFromConfig } from './options.js'
import { createMdxTsLanguagePlugin } from './plugin.js'

/**
 * The mdx-ts language server: the same checking the CLI performs — MDX type
 * errors, provided-component props, frontmatter typing and value validation,
 * and parse errors — surfaced to any LSP editor as live diagnostics.
 *
 * It reuses `createMdxTsLanguagePlugin`, so editor squiggles match `mdx-tsc`
 * exactly. Wiring mirrors `@mdx-js/language-server`.
 */

process.title = 'mdx-ts-language-server'

const connection = createConnection()
const server = createServer(connection)

connection.onInitialize((parameters) => {
  const tsdk = parameters.initializationOptions?.typescript?.tsdk
  assert.ok(
    typeof tsdk === 'string',
    'Missing initialization option typescript.tsdk',
  )

  const { typescript, diagnosticMessages } = loadTsdkByPath(
    tsdk,
    parameters.locale,
  )

  return server.initialize(
    parameters,
    createTypeScriptProject(typescript, diagnosticMessages, ({ configFileName }) => ({
      languagePlugins: [
        createMdxTsLanguagePlugin(resolveOptions(typescript, configFileName), {
          // Let the official MDX extension report parse errors, so a document
          // that fails to parse doesn't get two squiggles.
          surfaceParseErrors: false,
        }),
      ],
    })),
    // Diagnostics only: the official MDX extension owns highlighting, hover,
    // completion, and markdown features. We add only type + frontmatter
    // squiggles, so running both extensions doesn't duplicate anything.
    diagnosticsOnly(createTypeScriptServicePlugin(typescript, {})),
  )

  /** Resolve mdx-ts options (jsxImportSource, frontmatter) from a tsconfig. */
  function resolveOptions(
    ts: typeof import('typescript'),
    configFileName: string | undefined,
  ) {
    let jsxImportSource: string | undefined
    if (configFileName) {
      const configSourceFile = ts.readJsonConfigFile(configFileName, ts.sys.readFile)
      const commandLine = ts.parseJsonSourceFileConfigFileContent(
        configSourceFile,
        ts.sys,
        path.dirname(configFileName),
        undefined,
        configFileName,
      )
      jsxImportSource = commandLine.options.jsxImportSource
    }
    return resolveMdxTsOptionsFromConfig(configFileName, jsxImportSource)
  }
})

connection.onInitialized(() => {
  server.initialized()
  server.fileWatcher.watchFiles([
    '**/*.{mdx,ts,tsx,js,jsx,cts,mts,cjs,mjs,json}',
  ])
})

connection.listen()

/**
 * Reduce the TypeScript service plugins to a single diagnostics-only plugin.
 * The `typescript-semantic` plugin's `provideDiagnostics` already runs both
 * syntactic and semantic checks; dropping the others (and every non-diagnostic
 * capability) means our server advertises only diagnostics, so it never
 * competes with the official extension's hover/completion/etc.
 */
function diagnosticsOnly<T extends { name?: string; capabilities: Record<string, unknown> }>(
  plugins: T[],
): T[] {
  const semantic = plugins.find((plugin) => plugin.name === 'typescript-semantic')
  if (!semantic) return plugins

  const create = (semantic as unknown as { create: (context: unknown) => Record<string, unknown> })
    .create

  const wrapped = {
    name: 'mdx-ts-diagnostics',
    capabilities: { diagnosticProvider: semantic.capabilities.diagnosticProvider },
    create(context: unknown) {
      const instance = create(context)
      const provideDiagnostics = instance.provideDiagnostics as
        | ((...args: unknown[]) => unknown)
        | undefined
      const dispose = instance.dispose as (() => void) | undefined
      return {
        provideDiagnostics: provideDiagnostics?.bind(instance),
        dispose: dispose?.bind(instance),
      }
    },
  }

  return [wrapped as unknown as T]
}
