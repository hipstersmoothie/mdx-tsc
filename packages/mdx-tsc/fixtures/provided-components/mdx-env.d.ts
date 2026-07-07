import type { Chart } from './components.js'

// Tell mdx-tsc which components are injected into every document. Declaring the
// concrete component types (rather than the loose MDXComponents index
// signature) is what lets prop mistakes on provided components be caught.
declare global {
  interface MDXProvidedComponents {
    Chart: typeof Chart
  }
}

export {}
