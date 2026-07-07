import { fileURLToPath } from "node:url";

/**
 * The ambient declaration mdx-tsc injects into every program. Declaring
 * `MDXProvidedComponents` (even empty) makes the upstream `_components` object
 * strict, so a capitalized component that is neither imported nor provided is a
 * "Property does not exist" error rather than silently `any`. Users augment this
 * interface to register components injected through MDXProvider.
 */
export const GLOBALS_DTS_CONTENT = `declare global {
  interface MDXProvidedComponents {}
}
export {};
`;

/**
 * Absolute path to the `globals.d.ts` shipped with mdx-tsc, resolved relative to
 * the built file (points at the package root in dev and a published install).
 * Used by the CLI, which reads it as a real file. The bundled language server
 * serves {@link GLOBALS_DTS_CONTENT} virtually instead.
 */
export function globalsDtsPath(): string {
  return fileURLToPath(new URL("../globals.d.ts", import.meta.url));
}
