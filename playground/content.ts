import { z } from 'zod'

/** Frontmatter schema for blog posts in this playground. */
export const postSchema = z.object({
  title: z.string(),
  date: z.string(),
  tags: z.array(z.string()),
  draft: z.boolean().optional(),
})

export type PostFrontmatter = z.infer<typeof postSchema>
