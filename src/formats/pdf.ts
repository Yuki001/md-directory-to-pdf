import path from 'node:path'
import { promises as fs } from 'node:fs'
import {
  PDFDocument, PDFName, PDFHexString, PDFDict,
  StandardFonts, rgb,
} from 'pdf-lib'
import { chromium, devices, type BrowserContext } from 'playwright'
import { compress } from 'compress-pdf'
import { buildOutlineTree, countVisible } from '../outline'
import type { PreparedDocument, OutputFormat } from '../types'
import type { PageFonts } from '../fonts'
import type { OutlineNode } from '../outline'

const PDF_MARGIN = { top: '14mm', bottom: '14mm', left: '12mm', right: '12mm' }

export class PdfFormat implements OutputFormat {
  constructor(private tempDir: string) {}

  async write(
    docs: PreparedDocument[],
    outputPath: string,
    fonts?: PageFonts,
  ): Promise<void> {
    const runTempDir = await fs.mkdtemp(path.join(this.tempDir, 'md-to-pdf-'))
    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext(devices['Desktop Chrome'])

    const tempPdfs: { title: string; relativePath: string; tempPdfPath: string }[] = []

    try {
      let index = 1
      for (const doc of docs) {
        const paddedIndex = String(index).padStart(3, '0')
        const safeName = doc.relativePath.replace(/[/.]+/g, '-').replace(/-+/g, '-')
        const tempPdfPath = path.join(runTempDir, `${paddedIndex}-${safeName}.pdf`)

        console.log(`Rendering [${index}/${docs.length}]: ${doc.relativePath}`)
        await renderHtmlToPdf(context, doc.html, doc.relativePath, tempPdfPath)
        tempPdfs.push({ title: doc.title, relativePath: doc.relativePath, tempPdfPath })
        index++
      }
    } finally {
      await context.close()
      await browser.close()
    }

    console.log(`Merging ${tempPdfs.length} PDFs with outline...`)
    await mergePdfsWithOutline(tempPdfs, outputPath)

    await fs.rm(runTempDir, { recursive: true, force: true })
  }
}

async function renderHtmlToPdf(
  context: BrowserContext,
  html: string,
  relativePath: string,
  outputPath: string,
): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  const page = await context.newPage()
  try {
    await page.setContent(html, { waitUntil: 'networkidle' })

    const hasMermaid = html.includes('class="mermaid"')
    if (hasMermaid) {
      await page.waitForFunction(() => {
        const diagrams = document.querySelectorAll('.mermaid')
        if (diagrams.length === 0) return true
        return Array.from(diagrams).every(
          (d) => d.getAttribute('data-processed') === 'true',
        )
      }, { timeout: 15000 }).catch(() => {
        console.warn(`Mermaid render timed out for ${relativePath}, continuing anyway`)
      })
    }

    await page.pdf({ path: outputPath, format: 'A4', printBackground: true, margin: PDF_MARGIN })
  } finally {
    await page.close()
  }
}

async function mergePdfsWithOutline(
  entries: { title: string; relativePath: string; tempPdfPath: string }[],
  outputPath: string,
): Promise<void> {
  const merged = await PDFDocument.create()
  const pageStartIndices: number[] = []

  for (const entry of entries) {
    const sourceBytes = await fs.readFile(entry.tempPdfPath)
    const source = await PDFDocument.load(sourceBytes)
    pageStartIndices.push(merged.getPageCount())
    const copiedPages = await merged.copyPages(source, source.getPageIndices())
    for (const p of copiedPages) merged.addPage(p)
  }

  if (entries.length > 0) {
    addPdfOutlines(merged, entries, pageStartIndices)
    await addPageNumbers(merged)
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, await merged.save({ useObjectStreams: true }))

  try {
    const before = (await fs.stat(outputPath)).size
    const compressed = await compress(outputPath)
    await fs.writeFile(outputPath, compressed)
    const after = (await fs.stat(outputPath)).size
    console.log(
      `PDF compressed: ${(before / 1024 / 1024).toFixed(1)} MB -> ` +
      `${(after / 1024 / 1024).toFixed(1)} MB ` +
      `(${((1 - after / before) * 100).toFixed(0)}% reduction)`,
    )
  } catch {
    console.warn('PDF compression skipped (Ghostscript not available)')
  }
}

function addPdfOutlines(
  doc: PDFDocument,
  entries: { title: string; relativePath: string }[],
  pageStartIndices: number[],
): void {
  const context = doc.context
  const pages = doc.getPages()

  const tree = buildOutlineTree(entries, pageStartIndices)
  if (tree.length === 0) return

  const rootDict = context.obj({ Type: 'Outlines' })
  const rootRef = context.register(rootDict)

  const topItems = buildPdfOutlineItems(doc, tree, pages, rootRef)
  if (topItems.length === 0) return

  linkOutlineSiblings(topItems)
  rootDict.set(PDFName.of('First'), topItems[0].ref)
  rootDict.set(PDFName.of('Last'), topItems[topItems.length - 1].ref)
  rootDict.set(PDFName.of('Count'), context.obj(countVisible(tree)))

  doc.catalog.set(PDFName.of('Outlines'), rootRef)
}

interface ItemWithRef {
  dict: PDFDict
  ref: ReturnType<PDFDocument['context']['register']>
}

function buildPdfOutlineItems(
  doc: PDFDocument,
  nodes: OutlineNode[],
  pages: ReturnType<PDFDocument['getPages']>,
  parentRef: ReturnType<PDFDocument['context']['register']>,
): ItemWithRef[] {
  const context = doc.context
  const items: ItemWithRef[] = []

  for (const node of nodes) {
    if (node.kind === 'file') {
      const page = pages[node.index]
      if (!page) continue
      const dest = context.obj([page.ref, 'XYZ', null, null, 0])
      const dict = context.obj({
        Title: PDFHexString.fromText(node.title),
        Dest: dest,
        Parent: parentRef,
      })
      const ref = context.register(dict)
      items.push({ dict, ref })
    } else {
      const dict = context.obj({
        Title: PDFHexString.fromText(node.name),
        Parent: parentRef,
      })
      const ref = context.register(dict)

      const childItems = buildPdfOutlineItems(doc, node.children, pages, ref)
      if (childItems.length === 0) continue

      linkOutlineSiblings(childItems)
      dict.set(PDFName.of('First'), childItems[0].ref)
      dict.set(PDFName.of('Last'), childItems[childItems.length - 1].ref)
      dict.set(PDFName.of('Count'), context.obj(-countVisible(node.children)))

      items.push({ dict, ref })
    }
  }

  return items
}

function linkOutlineSiblings(items: ItemWithRef[]): void {
  for (let i = 0; i < items.length; i++) {
    if (i > 0) items[i].dict.set(PDFName.of('Prev'), items[i - 1].ref)
    if (i < items.length - 1) items[i].dict.set(PDFName.of('Next'), items[i + 1].ref)
  }
}

async function addPageNumbers(doc: PDFDocument): Promise<void> {
  const pages = doc.getPages()
  if (pages.length <= 1) return

  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]
    const { width } = page.getSize()
    const label = `${i + 1} / ${pages.length}`
    const fontSize = 9
    const textWidth = font.widthOfTextAtSize(label, fontSize)
    page.drawText(label, {
      x: (width - textWidth) / 2,
      y: 24,
      size: fontSize,
      font,
      color: rgb(0.47, 0.47, 0.47),
    })
  }
}
