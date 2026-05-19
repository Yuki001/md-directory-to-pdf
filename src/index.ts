import path from 'node:path'
import os from 'node:os'
import { promises as fs } from 'node:fs'
import { chromium, devices, type BrowserContext } from 'playwright'
import { discoverMdFiles } from './discover'
import { renderMarkdownToPdf, type RenderedPdf } from './render'
import { mergePdfs } from './merge'
import { embedFont, type PageFonts } from './fonts'

async function main(): Promise<void> {
  const args = process.argv.slice(2)

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage: npx tsx src/index.ts <input-dir> [output-pdf] [options]

  input-dir     Directory containing Markdown (.md) files (searched recursively)
  output-pdf    Path for the merged output PDF (default: <input-dir-name>.pdf)
  --temp-dir    Directory for intermediate PDFs (default: system temp dir)
  --font-mono   Monospace font for code blocks (file path or system font name)
  --font-content Body text font (file path or system font name)
`)
    process.exit(args.length === 0 ? 1 : 0)
  }

  const inputDir = path.resolve(args[0])

  // Parse optional args
  let outputPdf: string | undefined
  let tempDir: string | undefined
  let fontMonoSpec: string | undefined
  let fontContentSpec: string | undefined

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--temp-dir' && i + 1 < args.length) {
      tempDir = path.resolve(args[++i])
    } else if (args[i] === '--font-mono' && i + 1 < args.length) {
      fontMonoSpec = args[++i]
    } else if (args[i] === '--font-content' && i + 1 < args.length) {
      fontContentSpec = args[++i]
    } else if (!args[i].startsWith('--') && !outputPdf) {
      outputPdf = path.resolve(args[i])
    }
  }

  if (!outputPdf) {
    outputPdf = path.resolve(`${path.basename(inputDir)}.pdf`)
  }
  if (!tempDir) {
    tempDir = os.tmpdir()
  }

  // Create unique per-run directory to avoid clobbering concurrent runs
  await fs.mkdir(tempDir, { recursive: true })
  const runTempDir = await fs.mkdtemp(path.join(tempDir, 'md-to-pdf-'))

  // Load custom fonts if specified
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
  console.log(`Output PDF:       ${outputPdf}`)
  console.log(`Temp directory:   ${runTempDir}`)
  // Step 1: discover Markdown files
  const mdFiles = await discoverMdFiles(inputDir)
  if (mdFiles.length === 0) {
    console.error('No Markdown files found in the input directory.')
    process.exit(1)
  }
  console.log(`\nFound ${mdFiles.length} Markdown file(s):`)
  for (const f of mdFiles) {
    console.log(`  ${f.relativePath}`)
  }

  // Step 2: render each to PDF (temp files)
  await fs.mkdir(runTempDir, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext(devices['Desktop Chrome'])

  const renderedEntries: RenderedPdf[] = []

  try {
    let index = 1
    for (const entry of mdFiles) {
      const content = await fs.readFile(entry.absolutePath, 'utf-8')
      const paddedIndex = String(index).padStart(3, '0')
      const tempPdfPath = path.join(runTempDir, `${paddedIndex}-${entry.relativePath.replace(/[/.]+/g, '-').replace(/-+/g, '-')}.pdf`)

      console.log(`\nRendering [${index}/${mdFiles.length}]: ${entry.relativePath}`)
      const result = await renderMarkdownToPdf(context, content, tempPdfPath, entry.relativePath, entry.absolutePath, pageFonts)
      console.log(`  Title: ${result.title}`)
      renderedEntries.push(result)
      index++
    }
  } finally {
    await context.close()
    await browser.close()
  }

  // Step 3: merge into final PDF with outline
  console.log(`\nMerging ${renderedEntries.length} PDFs with outline...`)
  await mergePdfs(renderedEntries, outputPdf)

  // Step 4: cleanup temp files
  await fs.rm(runTempDir, { recursive: true, force: true })

  console.log(`\nDone: ${outputPdf}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
