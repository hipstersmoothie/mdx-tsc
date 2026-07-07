import { z } from 'zod'

/** A plain TypeScript type used directly as a frontmatter schema. */
export interface BlogFrontmatter {
  title: string
  date: string
  tags: string[]
  draft?: boolean
}

/**
 * A zod schema whose inferred type is used as the frontmatter schema. mdx-ts
 * never runs zod — it only references the static `z.infer` type — so this stays
 * a pure type-check.
 */
export const docSchema = z.object({
  title: z.string(),
  order: z.number(),
})

export type DocFrontmatter = z.infer<typeof docSchema>
