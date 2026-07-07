import { execa } from 'execa'
import { fileURLToPath } from 'node:url'
import * as path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Build the CLI once before the suite so tests run against fresh dist output. */
export default async function setup(): Promise<void> {
  const tsc = path.join(root, 'node_modules', '.bin', 'tsc')
  await execa(tsc, ['-p', 'tsconfig.build.json'], { cwd: root, stdio: 'inherit' })
}
