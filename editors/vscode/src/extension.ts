import * as path from 'node:path'
import { getTsdk } from '@volar/vscode'
import * as vscode from 'vscode'
import {
  LanguageClient,
  type LanguageClientOptions,
  type ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node'

let client: LanguageClient | undefined

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  warnOnConflict()

  const serverModule = resolveServerModule(context)
  const tsdk = await getTsdk(context)
  if (!tsdk) {
    void vscode.window.showErrorMessage(
      'mdx-ts: could not locate a TypeScript installation. Set "typescript.tsdk" or install TypeScript in your workspace.',
    )
    return
  }

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.stdio },
    debug: { module: serverModule, transport: TransportKind.stdio },
  }

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ language: 'mdx' }],
    initializationOptions: {
      typescript: { tsdk: tsdk.tsdk, enabled: true },
    },
  }

  client = new LanguageClient('mdx-ts', 'mdx-ts', serverOptions, clientOptions)
  await client.start()
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop()
}

/**
 * Resolve the mdx-ts language server entry. Prefers the installed `mdx-ts`
 * package; falls back to the sibling build when developing inside the repo.
 */
function resolveServerModule(context: vscode.ExtensionContext): string {
  try {
    return require.resolve('mdx-ts/language-server')
  } catch {
    // Dev fallback: extensionPath is <repo>/editors/vscode.
    return path.join(context.extensionPath, '..', '..', 'dist', 'language-server.js')
  }
}

/** The official MDX extension also binds `.mdx`; running both double-reports. */
function warnOnConflict(): void {
  const official = vscode.extensions.getExtension('unifiedjs.vscode-mdx')
  if (official) {
    void vscode.window.showWarningMessage(
      'mdx-ts and the official "MDX" extension are both installed. Disable one to avoid duplicate diagnostics (mdx-ts is a superset).',
    )
  }
}
