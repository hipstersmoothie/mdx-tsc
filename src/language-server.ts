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
        createMdxTsLanguagePlugin(resolveOptions(typescript, configFileName)),
      ],
    })),
    // The TypeScript service plugin surfaces the diagnostics our language plugin
    // produces (types, frontmatter, parse errors) over the embedded virtual code.
    createTypeScriptServicePlugin(typescript, {}),
  )

  /** Resolve mdx-ts options (checkMdx, jsxImportSource, frontmatter) from a tsconfig. */
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
