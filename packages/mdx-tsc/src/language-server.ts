#!/usr/bin/env node
import assert from "node:assert";
import * as path from "node:path";
import {
  createConnection,
  createServer,
  createTypeScriptProject,
  loadTsdkByPath,
} from "@volar/language-server/node.js";
import { create as createTypeScriptServicePlugin } from "volar-service-typescript";
import { resolveMdxTsOptionsFromConfig } from "./options.js";
import { createMdxTsLanguagePlugin, FRONTMATTER_SCOPE_SENTINEL } from "./plugin.js";

/**
 * The mdx-tsc language server: the same checking the CLI performs — MDX type
 * errors, provided-component props, frontmatter typing and value validation,
 * and parse errors — surfaced to any LSP editor as live diagnostics.
 *
 * It reuses `createMdxTsLanguagePlugin`, so editor squiggles match `mdx-tsc`
 * exactly. Wiring mirrors `@mdx-js/language-server`.
 */

process.title = "mdx-tsc-language-server";

const connection = createConnection();
const server = createServer(connection);

connection.onInitialize((parameters) => {
  const tsdk = parameters.initializationOptions?.typescript?.tsdk;
  assert.ok(typeof tsdk === "string", "Missing initialization option typescript.tsdk");

  const { typescript, diagnosticMessages } = loadTsdkByPath(tsdk, parameters.locale);

  // How much of the TypeScript service to expose. mdx-tsc's unique value is
  // schema-typed `frontmatter`, which the official MDX extension can't type;
  // beyond that, its hover/completion/definition merely duplicate the official
  // plugin. The `mdx-tsc.languageFeatures` setting picks the tradeoff:
  //   "scoped" (default) — hover/completion/definition only for `frontmatter`
  //                        (and member chains rooted at it); no duplication.
  //   "full"             — the whole TS service (duplicates the official plugin).
  //   "off"              — diagnostics only (fully additive).
  // Diagnostics are always provided regardless of mode.
  const mode = resolveFeatureMode(parameters.initializationOptions?.languageFeatures);
  const servicePlugins = createTypeScriptServicePlugin(typescript, {});
  const servicePlugin =
    mode === "full"
      ? servicePlugins
      : mode === "off"
        ? diagnosticsOnly(servicePlugins)
        : scopedFeatures(servicePlugins);

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
    servicePlugin,
  );

  /** Resolve mdx-tsc options (jsxImportSource, frontmatter) from a tsconfig. */
  function resolveOptions(ts: typeof import("typescript"), configFileName: string | undefined) {
    let jsxImportSource: string | undefined;
    if (configFileName) {
      const configSourceFile = ts.readJsonConfigFile(configFileName, ts.sys.readFile);
      const commandLine = ts.parseJsonSourceFileConfigFileContent(
        configSourceFile,
        ts.sys,
        path.dirname(configFileName),
        undefined,
        configFileName,
      );
      jsxImportSource = commandLine.options.jsxImportSource;
    }
    return resolveMdxTsOptionsFromConfig(configFileName, jsxImportSource);
  }
});

connection.onInitialized(() => {
  server.initialized();
  server.fileWatcher.watchFiles(["**/*.{mdx,ts,tsx,js,jsx,cts,mts,cjs,mjs,json}"]);
});

connection.listen();

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
  const semantic = plugins.find((plugin) => plugin.name === "typescript-semantic");
  if (!semantic) return plugins;

  const create = (semantic as unknown as { create: (context: unknown) => Record<string, unknown> })
    .create;

  const wrapped = {
    name: "mdx-tsc-diagnostics",
    capabilities: { diagnosticProvider: semantic.capabilities.diagnosticProvider },
    create(context: unknown) {
      const instance = create(context);
      const provideDiagnostics = instance.provideDiagnostics as
        | ((...args: unknown[]) => unknown)
        | undefined;
      const dispose = instance.dispose as (() => void) | undefined;
      return {
        provideDiagnostics: provideDiagnostics?.bind(instance),
        dispose: dispose?.bind(instance),
      };
    },
  };

  return [wrapped as unknown as T];
}

/** Coerce the client's `languageFeatures` option to a known mode (default "scoped"). */
function resolveFeatureMode(value: unknown): "off" | "scoped" | "full" {
  return value === "off" || value === "full" ? value : "scoped";
}

/**
 * Expose the TypeScript service, but restrict hover/definition/completion to the
 * `frontmatter` binding (and property chains rooted at it) — mdx-tsc's unique,
 * schema-typed contribution. Every other position returns nothing, so the
 * official MDX extension's plugin owns it and we don't double up. Diagnostics
 * are always kept.
 */
function scopedFeatures<T extends { name?: string; capabilities: Record<string, unknown> }>(
  plugins: T[],
): T[] {
  const semantic = plugins.find((plugin) => plugin.name === "typescript-semantic");
  if (!semantic) return plugins;

  const create = (semantic as unknown as { create: (context: unknown) => Record<string, unknown> })
    .create;
  const caps = semantic.capabilities;

  const wrapped = {
    name: "mdx-tsc-scoped",
    // Advertise only what we serve, so the client never routes rename/references/
    // signature-help etc. to us (those would duplicate the official plugin).
    capabilities: {
      diagnosticProvider: caps.diagnosticProvider,
      hoverProvider: caps.hoverProvider,
      definitionProvider: caps.definitionProvider,
      completionProvider: caps.completionProvider,
    },
    create(context: unknown) {
      const instance = create(context);
      const bind = (name: string) => (instance[name] as ((...a: unknown[]) => unknown) | undefined)
        ?.bind(instance);
      return {
        provideDiagnostics: bind("provideDiagnostics"),
        provideHover: onlyFrontmatter(instance, "provideHover"),
        provideDefinition: onlyFrontmatter(instance, "provideDefinition"),
        provideCompletionItems: onlyFrontmatter(instance, "provideCompletionItems"),
        resolveCompletionItem: bind("resolveCompletionItem"),
        dispose: bind("dispose"),
      };
    },
  };

  return [wrapped as unknown as T];
}

interface TextLike {
  getText(): string;
  offsetAt(position: unknown): number;
}

/**
 * Wrap a position-based provider (hover/definition/completion) so it only
 * answers when the cursor sits on the `frontmatter` identifier or a member chain
 * rooted at it. Volar passes the *generated* TS/JS virtual document, where
 * mdx-tsc injects `export const frontmatter`, so scanning the identifier chain
 * around the offset is enough — and returning undefined lets the official plugin
 * handle everything else.
 */
function onlyFrontmatter(
  instance: Record<string, unknown>,
  method: string,
): ((document: unknown, position: unknown, ...rest: unknown[]) => unknown) | undefined {
  const fn = instance[method] as
    | ((document: unknown, position: unknown, ...rest: unknown[]) => unknown)
    | undefined;
  if (!fn) return undefined;
  return (document, position, ...rest) => {
    const doc = document as TextLike;
    if (!inFrontmatterScope(doc.getText(), doc.offsetAt(position))) return undefined;
    return fn.call(instance, document, position, ...rest);
  };
}

/**
 * A generated position is "in frontmatter scope" when it sits either on the
 * `frontmatter` binding chain (body usage) or inside the injected value-
 * validation block (where YAML frontmatter maps to). The block is appended last
 * and flagged with {@link FRONTMATTER_SCOPE_SENTINEL}, so any offset at or after
 * the sentinel is inside it.
 */
function inFrontmatterScope(text: string, offset: number): boolean {
  const sentinel = text.indexOf(FRONTMATTER_SCOPE_SENTINEL);
  if (sentinel !== -1 && offset >= sentinel) return true;
  return frontmatterChainRoot(text, offset);
}

/** True when `offset` sits on the `frontmatter` identifier or a member chain rooted at it. */
function frontmatterChainRoot(text: string, offset: number): boolean {
  const isId = (c: string | undefined): boolean => c !== undefined && /[A-Za-z0-9_$]/.test(c);

  // Move to the start of the identifier under the cursor (cursor may sit at its
  // end, or just after a `.` when completing).
  let i = offset;
  while (i > 0 && isId(text[i - 1])) i--;

  // Walk the member-access chain leftward to its root identifier.
  for (;;) {
    let j = i;
    while (j > 0 && /\s/.test(text[j - 1] as string)) j--;
    if (text[j - 1] !== ".") break;
    j--;
    while (j > 0 && /\s/.test(text[j - 1] as string)) j--;
    const end = j;
    while (j > 0 && isId(text[j - 1])) j--;
    if (j === end) return false; // a `.` not preceded by an identifier
    i = j;
  }

  let rootEnd = i;
  while (rootEnd < text.length && isId(text[rootEnd])) rootEnd++;
  return text.slice(i, rootEnd) === "frontmatter";
}
