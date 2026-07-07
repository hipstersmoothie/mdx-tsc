import type { CodeMapping, VirtualCode } from "@volar/language-core";

/**
 * The subset of `vfile-message`'s VFileMessage that we read. When
 * `@mdx-js/language-service` fails to parse a document it stores the thrown
 * message here and emits an empty fallback virtual file, so the parse error
 * would otherwise never reach `tsc`.
 */
export interface ParseError {
  reason?: string;
  line?: number | null;
  column?: number | null;
  place?:
    | { offset?: number; line?: number; column?: number }
    | { start?: { offset?: number; line?: number; column?: number } }
    | null;
}

/** A minimal IScriptSnapshot over a fixed string. */
function snapshotOf(text: string) {
  return {
    getText: (start: number, end: number) => text.slice(start, end),
    getLength: () => text.length,
    getChangeRange: () => undefined,
  };
}

/**
 * Rewrite a failed document's embedded JS so the MDX parse error surfaces as a
 * `tsc` diagnostic at the original location.
 *
 * We prepend `// @ts-check` (so this reports even when the project has no
 * `checkJs`) and append a call whose string argument — the parse reason — is
 * passed to a `never` parameter. TypeScript then emits TS2345 with the reason
 * quoted in the message, and our CodeMapping relocates it onto the MDX source.
 */
export function injectParseErrorDiagnostic(
  embedded: VirtualCode,
  mdx: string,
  error: ParseError,
): VirtualCode {
  const reason = error.reason ?? "Could not parse MDX";
  const offset = resolveOffset(mdx, error);

  const fallback = embedded.snapshot.getText(0, embedded.snapshot.getLength());
  const header = "// @ts-check\n";

  // Carry the reason in a *target* string-literal type: assigning `0` to it
  // yields TS2322 "Type '0' is not assignable to type '<reason>'". Target types
  // are printed verbatim across TypeScript versions, unlike a value passed to a
  // `never` parameter (which older versions widen to `string`, dropping it).
  // `{`/`}` would confuse the JSDoc `@type {...}` parser, so drop them.
  const label = `MDX parse error: ${reason}`.replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
  const typeAnnotation = `/** @type {${JSON.stringify(label)}} */\n`;
  const declPrefix = `${typeAnnotation}const `;
  const name = "__mdxSyntaxError";

  const generatedStart = header.length + fallback.length + 1 + declPrefix.length;
  const text = `${header}${fallback}\n${declPrefix}${name} = 0\nvoid ${name}\n`;

  // TS2322 is reported on the declaration name. Map that name onto the offending
  // MDX span; source and generated lengths differ, so use `generatedLengths`.
  const sourceLength = Math.max(1, Math.min(name.length, mdx.length - offset));

  const mapping: CodeMapping = {
    sourceOffsets: [offset],
    generatedOffsets: [generatedStart],
    lengths: [sourceLength],
    generatedLengths: [name.length],
    data: {
      completion: false,
      format: false,
      navigation: false,
      semantic: true,
      structure: false,
      verification: true,
    },
  };

  return {
    id: embedded.id,
    languageId: embedded.languageId,
    snapshot: snapshotOf(text),
    mappings: [mapping],
  };
}

/** Best-effort source offset for a parse error, from a Point/Position or line+column. */
function resolveOffset(mdx: string, error: ParseError): number {
  const place = error.place;
  if (place) {
    if ("offset" in place && typeof place.offset === "number") return clamp(place.offset, mdx);
    if ("start" in place && typeof place.start?.offset === "number") {
      return clamp(place.start.offset, mdx);
    }
  }
  const line = error.line ?? placeLine(place);
  const column = error.column ?? placeColumn(place);
  if (line != null && column != null) return clamp(lineColumnToOffset(mdx, line, column), mdx);
  return 0;
}

function placeLine(place: ParseError["place"]): number | undefined {
  if (place && "line" in place && typeof place.line === "number") return place.line;
  if (place && "start" in place && typeof place.start?.line === "number") return place.start.line;
  return undefined;
}

function placeColumn(place: ParseError["place"]): number | undefined {
  if (place && "column" in place && typeof place.column === "number") return place.column;
  if (place && "start" in place && typeof place.start?.column === "number") {
    return place.start.column;
  }
  return undefined;
}

/** Convert 1-based line/column to a 0-based character offset. */
function lineColumnToOffset(mdx: string, line: number, column: number): number {
  let offset = 0;
  let currentLine = 1;
  while (currentLine < line && offset < mdx.length) {
    const next = mdx.indexOf("\n", offset);
    if (next === -1) break;
    offset = next + 1;
    currentLine++;
  }
  return offset + Math.max(0, column - 1);
}

function clamp(offset: number, mdx: string): number {
  if (!Number.isFinite(offset) || offset < 0) return 0;
  return Math.min(offset, Math.max(0, mdx.length - 1));
}
