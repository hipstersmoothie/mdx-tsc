import { isMap, isScalar, isSeq, parseDocument } from "yaml";
import type { Node as YamlNode } from "yaml";
import type { CodeMapping } from "@volar/language-core";
import { stripExtension } from "./frontmatter.js";
import type { FrontmatterSchemaEntry } from "./options.js";

/** The generated code for the frontmatter validation and its source mappings. */
export interface FrontmatterValidation {
  /** JS appended to the embedded file. */
  text: string;
  /** Mappings whose parallel arrays relocate generated tokens onto the MDX source. */
  mappings: CodeMapping[];
}

type MappingBuilder = {
  sourceOffsets: number[];
  generatedOffsets: number[];
  lengths: number[];
  generatedLengths: number[];
  data: CodeMapping["data"];
};

function newMapping(data: Partial<CodeMapping["data"]>): MappingBuilder {
  return {
    sourceOffsets: [],
    generatedOffsets: [],
    lengths: [],
    generatedLengths: [],
    data: {
      completion: false,
      format: false,
      navigation: false,
      semantic: false,
      structure: false,
      verification: false,
      ...data,
    },
  };
}

const YAML_FRONTMATTER = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/d;

/** Extract the leading YAML frontmatter block and its offset within the MDX. */
export function extractYamlFrontmatter(mdx: string): { yaml: string; offset: number } | undefined {
  const match = YAML_FRONTMATTER.exec(mdx);
  if (!match) return undefined;
  const indices = (match as RegExpExecArray & { indices?: Array<[number, number]> }).indices;
  const group = indices?.[1];
  if (!group) return undefined;
  return { yaml: match[1] ?? "", offset: group[0] };
}

/**
 * Build code that type-checks parsed frontmatter against the schema, arranged so
 * TypeScript names the offending field:
 *
 * - An inferred value object assigned to a `T`-typed const surfaces missing
 *   fields (TS2741 "Property 'x' is missing") and wrong-typed values (TS2322
 *   "Types of property 'x' are incompatible") — both naming the field. These
 *   map to the frontmatter block.
 * - A separate keys-only literal, typed to reject unknown keys, surfaces excess
 *   keys (TS2353 naming the key), mapped to the exact key in the YAML.
 *
 * Returns undefined when there is nothing checkable (empty or non-object YAML,
 * or YAML that itself fails to parse).
 */
export function buildFrontmatterValidation(
  yaml: string,
  blockOffset: number,
  entry: FrontmatterSchemaEntry,
): FrontmatterValidation | undefined {
  const doc = parseDocument(yaml);
  const contents = doc.contents ?? undefined;

  // Diagnostics require a cleanly-parsed map (a half-typed block shouldn't emit
  // false "missing field" errors). Key hints for hover/completion, however, are
  // recovered even from a partially-parsed block — the `yaml` library still
  // yields keys (with correct ranges) alongside its errors — so completion works
  // *while* a new key is being typed, before the colon lands.
  const cleanMap = doc.errors.length === 0 && contents && isMap(contents) ? contents : undefined;
  const hints = collectKeyHints(yaml, contents);
  const blanks = blankLines(yaml);
  if (!cleanMap && hints.length === 0 && blanks.length === 0) return undefined;

  const type = `import(${JSON.stringify(stripExtension(entry.module))}).${entry.typeName}`;

  // Two mapping groups with distinct roles, so each YAML key drives the right
  // features from the right generated construct:
  //  - `diag` — verification only: value/key diagnostics (steps 2–3).
  //  - `hint` — hover, definition, and completion for individual keys (step 4).
  const diag = newMapping({ verification: true });
  const hint = newMapping({ navigation: true, semantic: true, completion: true });
  const map = (
    m: MappingBuilder,
    genStart: number,
    genLen: number,
    srcStart: number,
    srcLen: number,
  ) => {
    m.generatedOffsets.push(genStart);
    m.generatedLengths.push(genLen);
    m.sourceOffsets.push(blockOffset + srcStart);
    m.lengths.push(Math.max(1, srcLen));
  };

  let text = "";

  if (cleanMap) {
    // 1. Hold the parsed values with their inferred types.
    text += `\nconst __mdxTsFmValue = (${renderValue(cleanMap)});\n`;

    // 2. Structural check — names missing / wrong-typed fields. TypeScript
    //    reports on `__mdxTsFmChecked`, which we map to the block start.
    text += `/** @type {${type}} */\n`;
    const checkedDecl = `const __mdxTsFmChecked = __mdxTsFmValue`;
    map(diag, text.length, checkedDecl.length, 0, 3);
    text += `${checkedDecl};\nvoid __mdxTsFmChecked;\n`;

    // 3. Excess-key check — a fresh literal of just the keys, rejecting unknowns.
    text += `/** @type {{ [K in keyof ${type}]?: unknown }} */\n`;
    text += `const __mdxTsFmKeys = ({`;
    for (const item of cleanMap.items) {
      const key = item.key;
      if (!isScalar(key) || !key.range) continue;
      const literal = JSON.stringify(String(key.value));
      map(diag, text.length, literal.length, key.range[0], key.range[1] - key.range[0]);
      text += `${literal}: 0, `;
    }
    text += `});\nvoid __mdxTsFmKeys;\n`;
  }

  // 4. Per-key hover / definition / completion — property access on a schema-
  //    typed binding, so each YAML key resolves to its schema field (correct
  //    hover type, go-to-definition, and member completion). Not verified —
  //    diagnostics come from steps 2–3 — so unknown / half-typed keys here are
  //    harmless.
  text += `/** @type {${type}} */\n`;
  text += `const __mdxTsFmFields = /** @type {any} */ (undefined);\n`;
  for (const h of hints) {
    text += `void __mdxTsFmFields.`;
    map(hint, text.length, h.name.length, h.start, h.name.length);
    text += `${h.name};\n`;
  }

  // Blank / whitespace-only lines are candidate spots for a new key. Map them to
  // a bare `__mdxTsFmFields.` member access with a zero-length generated anchor
  // right after the dot, so the cursor lands with an empty prefix and completion
  // offers every schema field even though no key has been typed yet.
  for (const b of blanks) {
    text += `void __mdxTsFmFields.`;
    map(hint, text.length, 0, b.start, b.len);
    text += `$_;\n`;
  }

  const finish = (m: MappingBuilder): CodeMapping => ({
    sourceOffsets: m.sourceOffsets,
    generatedOffsets: m.generatedOffsets,
    lengths: m.lengths,
    generatedLengths: m.generatedLengths,
    data: m.data,
  });
  return { text, mappings: [finish(diag), finish(hint)].filter((m) => m.generatedOffsets.length) };
}

/**
 * Recover the bare identifier at the start of each frontmatter key, tolerant of
 * a half-typed block. Works from a partially-parsed map (keys the `yaml` library
 * recovered despite errors) or a lone scalar (the very first key being typed).
 * Returns each key's leading identifier and its source offset within the block.
 */
function collectKeyHints(
  yaml: string,
  contents: YamlNode | undefined,
): Array<{ name: string; start: number }> {
  const hints: Array<{ name: string; start: number }> = [];
  const push = (range: readonly number[] | undefined) => {
    if (!range) return;
    const [start, end] = range;
    if (start === undefined || end === undefined) return;
    const raw = yaml.slice(start, end);
    const lead = raw.length - raw.trimStart().length;
    const m = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(raw.slice(lead));
    if (m) hints.push({ name: m[0], start: start + lead });
  };
  if (isMap(contents)) {
    for (const item of contents.items) {
      if (isScalar(item.key)) push(item.key.range ?? undefined);
    }
  } else if (isScalar(contents)) {
    push(contents.range ?? undefined);
  }
  return hints;
}

/** Block-relative offsets of blank / whitespace-only lines (candidate new-key spots). */
function blankLines(yaml: string): Array<{ start: number; len: number }> {
  const out: Array<{ start: number; len: number }> = [];
  let at = 0;
  for (const line of yaml.split("\n")) {
    if (line.trim() === "") out.push({ start: at, len: Math.max(1, line.length) });
    at += line.length + 1;
  }
  return out;
}

/** Render a YAML node as a plain JS literal (no mappings), faithful to its type. */
function renderValue(node: YamlNode): string {
  if (isMap(node)) {
    const entries = node.items
      .filter((item) => isScalar(item.key))
      .map((item) => {
        const key = JSON.stringify(String((item.key as { value: unknown }).value));
        const value = item.value ? renderValue(item.value as YamlNode) : "undefined";
        return `${key}: ${value}`;
      });
    return `{ ${entries.join(", ")} }`;
  }
  if (isSeq(node)) {
    return `[${node.items.map((item) => renderValue(item as YamlNode)).join(", ")}]`;
  }
  if (isScalar(node)) return scalarLiteral(node.value, node.source);
  return "undefined";
}

/** Emit a scalar as a JS literal, faithful to the YAML-parsed primitive type. */
function scalarLiteral(value: unknown, source: string | undefined): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number")
    return Number.isFinite(value) ? String(value) : JSON.stringify(String(value));
  if (typeof value === "boolean") return String(value);
  if (value === null || value === undefined) return "null";
  // Anything exotic (e.g. a timestamp under YAML 1.1) falls back to its source
  // text as a string, which matches how most frontmatter loaders behave.
  return JSON.stringify(source ?? String(value));
}
