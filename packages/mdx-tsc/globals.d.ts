// Injected into every mdx-tsc program. Declaring `MDXProvidedComponents` (even
// empty) makes the upstream `_components` object strict, so a capitalized
// component that is neither imported nor provided is a "Property does not exist"
// error instead of silently `any`. Users augment this interface (e.g. via a
// generated env.d.ts) to register components injected through MDXProvider.
declare global {
  interface MDXProvidedComponents {}
}

export {};
