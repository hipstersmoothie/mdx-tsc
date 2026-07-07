import { execa } from "execa";
import { fileURLToPath } from "node:url";
import * as path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "dist", "cli.js");

export interface Diagnostic {
  file: string;
  line: number;
  column: number;
  code: string;
  message: string;
}

export interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  diagnostics: Diagnostic[];
}

const DIAGNOSTIC_RE = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/;

/** Run the built mdx-tsc CLI with the given args from the repo root. */
export async function runCli(args: string[], cwd = root): Promise<RunResult> {
  const result = await execa("node", [cli, ...args], {
    cwd,
    reject: false,
    all: false,
  });
  const stdout = result.stdout ?? "";
  const diagnostics: Diagnostic[] = [];
  for (const raw of stdout.split("\n")) {
    const match = DIAGNOSTIC_RE.exec(raw.trim());
    if (!match) continue;
    diagnostics.push({
      file: match[1]!.replace(/\\/g, "/"),
      line: Number(match[2]),
      column: Number(match[3]),
      code: match[4]!,
      message: match[5]!,
    });
  }
  return {
    exitCode: result.exitCode ?? 0,
    stdout,
    stderr: result.stderr ?? "",
    diagnostics,
  };
}

/** Diagnostics whose file path ends with the given basename. */
export function forFile(diagnostics: Diagnostic[], basename: string): Diagnostic[] {
  return diagnostics.filter((d) => d.file.endsWith(basename));
}
