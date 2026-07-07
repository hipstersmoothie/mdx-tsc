#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { runTsc } from "@volar/typescript/lib/quickstart/runTsc.js";
import { globalsDtsPath } from "./globals.js";
import { resolveMdxTsOptions } from "./options.js";
import { createMdxTsLanguagePlugin } from "./plugin.js";

/**
 * mdx-tsc — a drop-in `tsc` that additionally type-checks `.mdx` files.
 *
 * All arguments are forwarded to the real TypeScript compiler untouched; the
 * only thing mdx-tsc adds is the MDX language plugin (via Volar's runTsc) and a
 * friendlier error when no project can be found.
 */

function main(): void {
  const argv = process.argv.slice(2);

  // Meta commands (`--version`, `--help`, `--init`, `--build`) and any run that
  // already resolves to a project are handed straight to tsc; only a truly
  // projectless invocation gets our friendlier guidance.
  if (!isMetaInvocation(argv) && !hasResolvableProject(argv)) {
    reportNoProject();
    process.exit(2);
  }

  runTsc(
    fileURLToPath(import.meta.resolve("typescript/lib/tsc.js")),
    [".mdx"],
    (_ts, programOptions) => {
      // Add the ambient MDXProvidedComponents declaration so unknown components
      // are errors, not `any`.
      (programOptions as { rootNames: readonly string[] }).rootNames = [
        ...programOptions.rootNames,
        globalsDtsPath(),
      ];
      const options = resolveMdxTsOptions(programOptions);
      return {
        languagePlugins: [createMdxTsLanguagePlugin(options)],
      };
    },
  );
}

/**
 * Returns true when tsc will have something to compile: an explicit
 * `-p/--project`, positional input files, or a tsconfig.json in cwd.
 */
function hasResolvableProject(args: string[]): boolean {
  const inputFiles: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "-p" || arg === "--project") {
      const target = args[i + 1];
      return target ? projectExists(target) : false;
    }
    if (arg.startsWith("--project=")) {
      return projectExists(arg.slice("--project=".length));
    }
    if (!arg.startsWith("-")) inputFiles.push(arg);
    else if (expectsValue(arg)) i++; // skip this flag's value
  }
  if (inputFiles.length > 0) return true;
  return fs.existsSync(path.resolve(process.cwd(), "tsconfig.json"));
}

const META_FLAGS = new Set(["--version", "-v", "--help", "-h", "--all", "--init", "--build", "-b"]);

function isMetaInvocation(args: string[]): boolean {
  return args.some((arg) => META_FLAGS.has(arg));
}

function projectExists(target: string): boolean {
  const resolved = path.resolve(process.cwd(), target);
  if (!fs.existsSync(resolved)) return false;
  return fs.statSync(resolved).isDirectory()
    ? fs.existsSync(path.join(resolved, "tsconfig.json"))
    : true;
}

/** Flags that consume the following argv entry as their value. */
function expectsValue(flag: string): boolean {
  return ["--build", "-b"].includes(flag) ? false : VALUE_FLAGS.has(flag);
}

const VALUE_FLAGS = new Set([
  "--outDir",
  "--outFile",
  "--rootDir",
  "--baseUrl",
  "--target",
  "--module",
  "--jsx",
  "--jsxImportSource",
  "--lib",
  "--types",
  "--typeRoots",
]);

function reportNoProject(): void {
  process.stderr.write(
    `mdx-tsc: no TypeScript project found.\n\n` +
      `Point it at a tsconfig that includes your .mdx files, e.g.:\n\n` +
      `  mdx-tsc --project tsconfig.json\n\n` +
      `A minimal tsconfig for checking MDX:\n\n` +
      `  {\n` +
      `    "compilerOptions": {\n` +
      `      "jsx": "react-jsx",\n` +
      `      "jsxImportSource": "react",\n` +
      `      "module": "preserve",\n` +
      `      "moduleResolution": "bundler",\n` +
      `      "allowJs": true,\n` +
      `      "checkJs": true,\n` +
      `      "strict": true,\n` +
      `      "noEmit": true,\n` +
      `      "skipLibCheck": true\n` +
      `    },\n` +
      `    "mdx": { "checkMdx": true },\n` +
      `    "include": ["**/*.mdx", "**/*.ts", "**/*.tsx"]\n` +
      `  }\n`,
  );
}

main();
