import * as path from "node:path";
import { getTsdk } from "@volar/vscode";
import * as vscode from "vscode";
import {
  LanguageClient,
  type LanguageClientOptions,
  type ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  suggestOfficialExtension();

  const serverModule = resolveServerModule(context);
  const tsdk = await getTsdk(context);
  if (!tsdk) {
    void vscode.window.showErrorMessage(
      'mdx-ts: could not locate a TypeScript installation. Set "typescript.tsdk" or install TypeScript in your workspace.',
    );
    return;
  }

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.stdio },
    debug: { module: serverModule, transport: TransportKind.stdio },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ language: "mdx" }],
    initializationOptions: {
      typescript: { tsdk: tsdk.tsdk, enabled: true },
    },
  };

  client = new LanguageClient("mdx-ts", "mdx-ts", serverOptions, clientOptions);
  await client.start();
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}

/**
 * Resolve the mdx-ts language server entry. Prefers the installed `mdx-ts`
 * package; falls back to the sibling build when developing inside the repo.
 */
function resolveServerModule(context: vscode.ExtensionContext): string {
  try {
    return require.resolve("mdx-ts/language-server");
  } catch {
    // Dev fallback: extensionPath is <repo>/editors/vscode.
    return path.join(
      context.extensionPath,
      "..",
      "..",
      "packages",
      "mdx-ts",
      "dist",
      "language-server.js",
    );
  }
}

/**
 * mdx-ts is additive: it contributes only type/frontmatter diagnostics and
 * relies on the official MDX extension for highlighting, hover, completion, and
 * markdown features. Nudge the user to install it if it's missing.
 */
function suggestOfficialExtension(): void {
  const official = vscode.extensions.getExtension("unifiedjs.vscode-mdx");
  if (!official) {
    void vscode.window.showInformationMessage(
      'mdx-ts adds type-checking on top of the official "MDX" extension. Install it for syntax highlighting and editor features, and set "mdx": { "checkMdx": false } in tsconfig so type errors are not reported twice.',
    );
  }
}
