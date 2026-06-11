import path from 'node:path'
import os from 'node:os'
import { promises as fs } from 'node:fs'
import { discoverMdFiles } from './discover'
import { prepareHtmlDocument } from './markdown'
import { PdfFormat } from './formats/pdf'
import { EpubFormat } from './formats/epub'
import { embedFont, type PageFonts } from './fonts'
import type { PreparedDocument } from './types'

async function main(): Promise<void> {
  const args = process.argv.slice(2)

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage: npx tsx src/index.ts <input-dir> [output-file] [options]

  input-dir      Directory containing Markdown (.md) files (searched recursively)
  output-file    Path for the output (default: <input-dir-name>.<ext>)
  --format       Output format: pdf (default) or epub
  --temp-dir     Directory for intermediate files (default: system temp dir)
  --font-mono    Monospace font for code blocks (file path or system font name)
  --font-content Body text font (file path or system font name)
`)
    process.exit(args.length === 0 ? 1 : 0)
  }

  const inputDir = path.resolve(args[0])

  let outputPath: string | undefined
  let tempDir: string | undefined
  let fontMonoSpec: string | undefined
  let fontContentSpec: string | undefined
  let format: 'pdf' | 'epub' = 'pdf'

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--temp-dir' && i + 1 < args.length) {
      tempDir = path.resolve(args[++i])
    } else if (args[i] === '--font-mono' && i + 1 < args.length) {
      fontMonoSpec = args[++i]
    } else if (args[i] === '--font-content' && i + 1 < args.length) {
      fontContentSpec = args[++i]
    } else if (args[i] === '--format' && i + 1 < args.length) {
      format = args[++i] as 'pdf' | 'epub'
    } else if (!args[i].startsWith('--') && !outputPath) {
      outputPath = path.resolve(args[i])
    }
  }

  const outputExt = format === 'epub' ? '.epub' : '.pdf'
  if (!outputPath) {
    outputPath = path.resolve(`${path.basename(inputDir)}${outputExt}`)
  }
  if (!tempDir) {
    tempDir = os.tmpdir()
  }

  // Load custom fonts
  const pageFonts: PageFonts = {}
  if (fontMonoSpec) {
    console.log(`Loading mono font: ${fontMonoSpec}`)
    pageFonts.mono = await embedFont(fontMonoSpec)
  }
  if (fontContentSpec) {
    console.log(`Loading content font: ${fontContentSpec}`)
    pageFonts.content = await embedFont(fontContentSpec)
  }

  console.log(`Input directory:  ${inputDir}`)
  console.log(`Output:           ${outputPath}`)
  console.log(`Format:           ${format}`)

  // Discover markdown files
  const mdFiles = await discoverMdFiles(inputDir)
  if (mdFiles.length === 0) {
    console.error('No Markdown files found in the input directory.')
    process.exit(1)
  }
  console.log(`\nFound ${mdFiles.length} Markdown file(s):`)
  for (const f of mdFiles) {
    console.log(`  ${f.relativePath}`)
  }

  // Prepare HTML documents
  const fontBasePath = format === 'epub' ? 'fonts/' : undefined
  const docs: PreparedDocument[] = []
  for (const entry of mdFiles) {
    const content = await fs.readFile(entry.absolutePath, 'utf-8')
    const doc = await prepareHtmlDocument(
      content, entry.absolutePath, entry.relativePath,
      pageFonts, fontBasePath,
    )
    console.log(`  Prepared: ${doc.title}`)
    docs.push(doc)
  }

  // Dispatch to output format
  const outputFormat = format === 'epub' ? new EpubFormat() : new PdfFormat(tempDir)
  await outputFormat.write(docs, outputPath, pageFonts)

  console.log(`\nDone: ${outputPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
