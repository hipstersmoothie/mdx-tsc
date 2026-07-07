import type { MDXComponents } from 'mdx/types'
import { Chart } from './components.js'

// The Next.js convention: components made available to every MDX document
// without an explicit import.
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return { ...components, Chart }
}
