import path from 'node:path'
import { promises as fs } from 'node:fs'

export type MdFileEntry = {
  absolutePath: string
  relativePath: string
}

export async function discoverMdFiles(inputDir: string): Promise<MdFileEntry[]> {
  const absoluteDir = path.resolve(inputDir)
  const files = await walkMarkdownFiles(absoluteDir)

  return files
    .sort((a, b) => {
      const aDir = path.posix.dirname(a.relativePath)
      const bDir = path.posix.dirname(b.relativePath)

      const dirCompare = aDir.localeCompare(bDir)
      if (dirCompare !== 0) return dirCompare

      const aBase = path.posix.basename(a.relativePath)
      const bBase = path.posix.basename(b.relativePath)

      if (aBase === 'README.md' && bBase !== 'README.md') return -1
      if (aBase !== 'README.md' && bBase === 'README.md') return 1

      return aBase.localeCompare(bBase)
    })
    .map((entry) => ({
      absolutePath: entry.absolutePath,
      relativePath: entry.relativePath,
    }))
}

async function walkMarkdownFiles(
  dir: string,
  baseDir: string = dir,
): Promise<MdFileEntry[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        return walkMarkdownFiles(fullPath, baseDir)
      }
      if (entry.isFile() && entry.name.endsWith('.md')) {
        return [
          {
            absolutePath: fullPath,
            relativePath: path.relative(baseDir, fullPath).replace(/\\/g, '/'),
          },
        ]
      }
      return []
    }),
  )
  return nested.flat()
}
