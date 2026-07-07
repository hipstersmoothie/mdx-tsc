import { createRequire } from "node:module";
import * as path from "node:path";
import type * as ts from "typescript";
// The real TypeScript API. The `ts` object Volar hands the runTsc callback is a
// scope-eval proxy that only exposes a subset of tsc.js internals, so we import
// the public API ourselves (typescript is a guaranteed peer dependency).
import tsApi from "typescript";

/**
 * Options mdx-tsc derives for each program, sourced from the user's tsconfig.
 *
 * `checkMdx` and the `mdx-tsc` block are non-standard top-level tsconfig keys
 * that TypeScript discards when it parses compiler options, so we read them
 * from the raw config file ourselves.
 */
export interface MdxTsOptions {
  /** JSX import source, e.g. `react`. From `compilerOptions.jsxImportSource`. */
  jsxImportSource: string;
  /** Glob -> `./file#Type` frontmatter schema references. From `"mdx".frontmatter`. */
  frontmatter: FrontmatterSchemaEntry[];
}

export interface FrontmatterSchemaEntry {
  /** The original glob, as written in tsconfig (relative to the config dir). */
  glob: string;
  /** Absolute glob used for matching MDX file paths. */
  absoluteGlob: string;
  /** Absolute path to the module declaring the frontmatter type. */
  module: string;
  /** Exported type name within that module. */
  typeName: string;
}

interface RawTsconfig {
  extends?: string | string[];
  mdx?: { checkMdx?: unknown; frontmatter?: Record<string, unknown> };
  [key: string]: unknown;
}

/**
 * Read a tsconfig's raw JSON, following `extends` so that the `mdx` config can
 * live in a shared base config. Child values win.
 */
function readRawConfig(configPath: string, seen = new Set<string>()): RawTsconfig {
  const absolute = path.resolve(configPath);
  if (seen.has(absolute)) return {};
  seen.add(absolute);

  const { config, error } = tsApi.readConfigFile(absolute, tsApi.sys.readFile);
  if (error || !config) return {};
  const raw = config as RawTsconfig;

  const extendsList =
    typeof raw.extends === "string" ? [raw.extends] : Array.isArray(raw.extends) ? raw.extends : [];

  let base: RawTsconfig = {};
  for (const ext of extendsList) {
    const resolved = resolveExtends(ext, path.dirname(absolute));
    if (resolved) base = mergeRaw(base, readRawConfig(resolved, seen));
  }

  return mergeRaw(base, raw);
}

function resolveExtends(ext: string, fromDir: string): string | undefined {
  if (ext.startsWith(".") || path.isAbsolute(ext)) {
    const p = path.resolve(fromDir, ext);
    if (tsApi.sys.fileExists(p)) return p;
    const withExt = p.endsWith(".json") ? undefined : `${p}.json`;
    if (withExt && tsApi.sys.fileExists(withExt)) return withExt;
    return undefined;
  }
  // Bare package specifier (e.g. "@tsconfig/node20/tsconfig.json").
  try {
    return createRequire(path.join(fromDir, "noop.js")).resolve(ext);
  } catch {
    return undefined;
  }
}

/** Shallow-merge the `mdx` section (incl. its frontmatter map); child wins. */
function mergeRaw(base: RawTsconfig, child: RawTsconfig): RawTsconfig {
  return {
    ...base,
    ...child,
    mdx: {
      ...base.mdx,
      ...child.mdx,
      frontmatter: { ...base.mdx?.frontmatter, ...child.mdx?.frontmatter },
    },
  };
}

/**
 * Resolve mdx-tsc options for a program. `configFilePath` is set by TypeScript
 * whenever the program originates from a tsconfig (both `-p foo` and default
 * discovery); we fall back to the compiler defaults when it is absent.
 */
export function resolveMdxTsOptions(programOptions: ts.CreateProgramOptions): MdxTsOptions {
  const compilerOptions = programOptions.options;
  const configFilePath = (compilerOptions as { configFilePath?: string }).configFilePath;
  return resolveMdxTsOptionsFromConfig(configFilePath, compilerOptions.jsxImportSource);
}

/**
 * Resolve options directly from a tsconfig path (used by the language server,
 * which is handed the config file name rather than a program).
 */
export function resolveMdxTsOptionsFromConfig(
  configFilePath: string | undefined,
  jsxImportSource: string | undefined,
): MdxTsOptions {
  const source = jsxImportSource || "react";

  if (!configFilePath) {
    return { jsxImportSource: source, frontmatter: [] };
  }

  const raw = readRawConfig(configFilePath);
  const configDir = path.dirname(path.resolve(configFilePath));

  // Note: `mdx.checkMdx` is intentionally NOT read here. mdx-tsc always
  // type-checks (that is its purpose); `checkMdx` governs only whether the
  // official MDX extension also emits type diagnostics, so the two can run side
  // by side without duplication.
  return {
    jsxImportSource: source,
    frontmatter: parseFrontmatterSchemas(raw.mdx?.frontmatter, configDir),
  };
}

function parseFrontmatterSchemas(
  map: Record<string, unknown> | undefined,
  configDir: string,
): FrontmatterSchemaEntry[] {
  if (!map || typeof map !== "object") return [];
  const entries: FrontmatterSchemaEntry[] = [];
  for (const [glob, ref] of Object.entries(map)) {
    if (typeof ref !== "string") continue;
    const hash = ref.lastIndexOf("#");
    if (hash === -1) {
      throw new Error(
        `mdx-tsc: frontmatter schema for "${glob}" must be of the form "./file#TypeName", got "${ref}"`,
      );
    }
    const modulePath = ref.slice(0, hash);
    const typeName = ref.slice(hash + 1);
    entries.push({
      glob,
      absoluteGlob: path.resolve(configDir, glob),
      module: path.resolve(configDir, modulePath),
      typeName,
    });
  }
  return entries;
}
