import { isMap, isScalar, isSeq, parseDocument } from "yaml";
import type { Node as YamlNode } from "yaml";
import type { CodeMapping } from "@volar/language-core";
import { stripExtension } from "./frontmatter.js";
import type { FrontmatterSchemaEntry } from "./options.js";

/** The generated code for the frontmatter validation and its source mappings. */
export interface FrontmatterValidation {
  /** JS appended to the embedded file. */
  text: string;
  /** One mapping whose parallel arrays relocate each token onto the MDX source. */
  mapping: CodeMapping;
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
  if (doc.errors.length > 0 || !doc.contents || !isMap(doc.contents)) return undefined;

  const type = `import(${JSON.stringify(stripExtension(entry.module))}).${entry.typeName}`;

  const sourceOffsets: number[] = [];
  const generatedOffsets: number[] = [];
  const lengths: number[] = [];
  const generatedLengths: number[] = [];
  const map = (genStart: number, genLen: number, srcStart: number, srcLen: number) => {
    generatedOffsets.push(genStart);
    generatedLengths.push(genLen);
    sourceOffsets.push(blockOffset + srcStart);
    lengths.push(Math.max(1, srcLen));
  };

  let text = "";

  // 1. Hold the parsed values with their inferred types.
  text += `\nconst __mdxTsFmValue = (${renderValue(doc.contents)});\n`;

  // 2. Structural check — names missing / wrong-typed fields. TypeScript reports
  //    on the `__mdxTsFmChecked` declaration, which we map to the block start.
  text += `/** @type {${type}} */\n`;
  const checkedDecl = `const __mdxTsFmChecked = __mdxTsFmValue`;
  map(text.length, checkedDecl.length, 0, 3);
  text += `${checkedDecl};\nvoid __mdxTsFmChecked;\n`;

  // 3. Excess-key check — a fresh literal of just the keys, rejecting unknowns.
  text += `/** @type {{ [K in keyof ${type}]?: unknown }} */\n`;
  text += `const __mdxTsFmKeys = ({`;
  for (const item of doc.contents.items) {
    const key = item.key;
    if (!isScalar(key) || !key.range) continue;
    const literal = JSON.stringify(String(key.value));
    map(text.length, literal.length, key.range[0], key.range[1] - key.range[0]);
    text += `${literal}: 0, `;
  }
  text += `});\nvoid __mdxTsFmKeys;\n`;

  const mapping: CodeMapping = {
    sourceOffsets,
    generatedOffsets,
    lengths,
    generatedLengths,
    data: {
      completion: false,
      format: false,
      navigation: true,
      semantic: true,
      structure: false,
      verification: true,
    },
  };
  return { text, mapping };
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
