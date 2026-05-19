import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export interface EmbeddedFont {
  base64: string
  format: string
}

export interface PageFonts {
  mono?: EmbeddedFont
  content?: EmbeddedFont
}

function getSystemFontDirs(): string[] {
  const platform = os.platform()
  const home = os.homedir()

  switch (platform) {
    case 'win32':
      return [path.join(process.env.WINDIR ?? 'C:\\Windows', 'Fonts')]
    case 'darwin':
      return [
        '/System/Library/Fonts',
        '/Library/Fonts',
        path.join(home, 'Library/Fonts'),
      ]
    default:
      return [
        '/usr/share/fonts',
        '/usr/local/share/fonts',
        path.join(home, '.fonts'),
      ]
  }
}

export async function resolveFontPath(spec: string): Promise<string> {
  // If it's an existing file, use directly
  try {
    await fs.access(spec)
    return path.resolve(spec)
  } catch {
    // Not a file, search by name
  }

  // Normalize: strip spaces, hyphens, underscores for fuzzy matching
  const needle = spec.replace(/[ _-]+/g, '').toLowerCase()

  const fontDirs = getSystemFontDirs()
  const candidates: string[] = []

  for (const dir of fontDirs) {
    try {
      const entries = await fs.readdir(dir)
      for (const entry of entries) {
        const ext = path.extname(entry).toLowerCase()
        if (ext !== '.ttf' && ext !== '.otf' && ext !== '.woff2') continue

        const normalized = path.basename(entry, ext).replace(/[ _-]+/g, '').toLowerCase()
        if (normalized.includes(needle)) {
          candidates.push(path.join(dir, entry))
        }
      }
    } catch {
      // dir doesn't exist, skip
    }
  }

  if (candidates.length === 0) {
    throw new Error(`Font not found: "${spec}". Checked: ${fontDirs.join(', ')}`)
  }

  // Prefer Regular weight over Bold/Italic/Light/Thin/Medium/SemiBold/ExtraBold/ExtraLight
  const regularWeight = /regular/i
  const regular = candidates.find((c) => regularWeight.test(c))
  return regular ?? candidates[0]
}

export function detectFontFormat(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case '.otf':
      return 'opentype'
    case '.woff2':
      return 'woff2'
    case '.woff':
      return 'woff'
    default:
      return 'truetype'
  }
}

export async function embedFont(spec: string): Promise<EmbeddedFont> {
  const resolvedPath = await resolveFontPath(spec)
  const buf = await fs.readFile(resolvedPath)
  return {
    base64: buf.toString('base64'),
    format: detectFontFormat(resolvedPath),
  }
}
