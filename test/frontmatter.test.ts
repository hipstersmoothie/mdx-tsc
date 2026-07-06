import { afterEach, describe, expect, test } from 'vitest'
import { rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import * as path from 'node:path'
import { forFile, runCli } from './helpers.js'

const project = 'fixtures/frontmatter/tsconfig.json'
const blogDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixtures/frontmatter/blog',
)

describe('frontmatter schema typing', () => {
  test('types frontmatter per glob and checks body usage', async () => {
    const { diagnostics } = await runCli(['--project', project, '--pretty', 'false'])

    // blog/**/*.mdx -> BlogFrontmatter; publishedAt is not declared there.
    const bad = forFile(diagnostics, 'blog/bad.mdx')
    expect(bad).toHaveLength(1)
    expect(bad[0]).toMatchObject({ line: 9, column: 27, code: 'TS2339' })
    expect(bad[0]!.message).toContain('BlogFrontmatter')
    expect(bad[0]!.message).toContain('publishedAt')
  })

  test('routes docs/**/*.mdx to the zod-inferred DocFrontmatter', async () => {
    const { diagnostics } = await runCli(['--project', project, '--pretty', 'false'])

    // `tags` exists on BlogFrontmatter but not DocFrontmatter — its rejection
    // here proves docs files use the Doc schema (and that z.infer resolves).
    const wrong = forFile(diagnostics, 'docs/wrong-schema.mdx')
    expect(wrong).toHaveLength(1)
    expect(wrong[0]).toMatchObject({ line: 6, column: 24, code: 'TS2339' })
    expect(wrong[0]!.message).toContain('tags')
  })

  test('valid documents and unmatched files produce no diagnostics', async () => {
    const { diagnostics } = await runCli(['--project', project, '--pretty', 'false'])
    expect(forFile(diagnostics, 'blog/valid.mdx')).toEqual([])
    expect(forFile(diagnostics, 'docs/valid.mdx')).toEqual([])
    expect(forFile(diagnostics, 'unmatched/note.mdx')).toEqual([])
  })
})

describe('position fidelity under content shifts', () => {
  const mutationFile = path.join(blogDir, '_mutation.mdx')

  afterEach(async () => {
    await rm(mutationFile, { force: true })
  })

  test('the reported line follows the error as content moves', async () => {
    const body = (leadingBlankLines: number) =>
      `---\ntitle: t\ndate: '2026-07-06'\ntags: []\n---\n` +
      '\n'.repeat(leadingBlankLines) +
      `Value: {frontmatter.missingField}.\n`

    await writeFile(mutationFile, body(0))
    const first = await runCli(['--project', project, '--pretty', 'false'])
    const a = forFile(first.diagnostics, '_mutation.mdx')
    expect(a).toHaveLength(1)

    await writeFile(mutationFile, body(3))
    const second = await runCli(['--project', project, '--pretty', 'false'])
    const b = forFile(second.diagnostics, '_mutation.mdx')
    expect(b).toHaveLength(1)

    // Three blank lines inserted before the usage -> error line moves by three.
    expect(b[0]!.line).toBe(a[0]!.line + 3)
    expect(b[0]!.code).toBe('TS2339')
  })
})
