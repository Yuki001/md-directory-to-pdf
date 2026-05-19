import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  PDFDocument,
  PDFName,
  PDFHexString,
  PDFDict,
  PDFRef,
  StandardFonts,
  rgb,
} from 'pdf-lib'
import { compress } from 'compress-pdf'
import type { RenderedPdf } from './render'

type OutlineNode =
  | { kind: 'file'; title: string; pageIndex: number }
  | { kind: 'dir'; name: string; children: OutlineNode[] }

interface ItemWithRef {
  dict: PDFDict
  ref: PDFRef
}

export async function mergePdfs(
  renderedPdfs: RenderedPdf[],
  outputPath: string,
): Promise<void> {
  const merged = await PDFDocument.create()
  const pageStartIndices: number[] = []

  for (const entry of renderedPdfs) {
    const sourceBytes = await fs.readFile(entry.tempPdfPath)
    const source = await PDFDocument.load(sourceBytes)
    pageStartIndices.push(merged.getPageCount())
    const copiedPages = await merged.copyPages(source, source.getPageIndices())
    for (const copiedPage of copiedPages) {
      merged.addPage(copiedPage)
    }
  }

  if (renderedPdfs.length > 0) {
    addOutlines(merged, renderedPdfs, pageStartIndices)
    await addPageNumbers(merged)
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, await merged.save({ useObjectStreams: true }))

  try {
    const before = (await fs.stat(outputPath)).size
    const compressed = await compress(outputPath)
    await fs.writeFile(outputPath, compressed)
    const after = (await fs.stat(outputPath)).size
    console.log(`PDF compressed: ${(before / 1024 / 1024).toFixed(1)} MB -> ${(after / 1024 / 1024).toFixed(1)} MB (${((1 - after / before) * 100).toFixed(0)}% reduction)`)
  } catch (err) {
    console.warn('PDF compression skipped (Ghostscript not available)')
  }
}

function addOutlines(
  doc: PDFDocument,
  renderedPdfs: RenderedPdf[],
  pageStartIndices: number[],
): void {
  const context = doc.context
  const pages = doc.getPages()

  const tree = buildOutlineTree(renderedPdfs, pageStartIndices)
  if (tree.length === 0) return

  const rootDict = context.obj({ Type: 'Outlines' })
  const rootRef = context.register(rootDict)

  const topItems = buildOutlineItems(doc, tree, pages, rootRef)
  if (topItems.length === 0) return

  linkSiblings(topItems)
  rootDict.set(PDFName.of('First'), topItems[0].ref)
  rootDict.set(PDFName.of('Last'), topItems[topItems.length - 1].ref)
  rootDict.set(PDFName.of('Count'), context.obj(countVisible(tree)))

  doc.catalog.set(PDFName.of('Outlines'), rootRef)
}

function buildOutlineTree(
  renderedPdfs: RenderedPdf[],
  pageStartIndices: number[],
): OutlineNode[] {
  const root: OutlineNode[] = []

  for (let i = 0; i < renderedPdfs.length; i++) {
    const entry = renderedPdfs[i]
    const parts = entry.relativePath.split('/')
    parts.pop() // discard filename
    const dirParts = parts

    const fileNode: OutlineNode = {
      kind: 'file',
      title: entry.title,
      pageIndex: pageStartIndices[i],
    }

    if (dirParts.length === 0) {
      root.push(fileNode)
    } else {
      ensureDirNode(root, dirParts).children.push(fileNode)
    }
  }

  return root
}

function ensureDirNode(
  siblings: OutlineNode[],
  dirParts: string[],
): Extract<OutlineNode, { kind: 'dir' }> {
  const dirName = dirParts[0]
  let dirNode = siblings.find(
    (n): n is Extract<OutlineNode, { kind: 'dir' }> =>
      n.kind === 'dir' && n.name === dirName,
  )

  if (!dirNode) {
    dirNode = { kind: 'dir', name: dirName, children: [] }
    siblings.push(dirNode)
  }

  if (dirParts.length === 1) {
    return dirNode
  }
  return ensureDirNode(dirNode.children, dirParts.slice(1))
}

function buildOutlineItems(
  doc: PDFDocument,
  nodes: OutlineNode[],
  pages: ReturnType<PDFDocument['getPages']>,
  parentRef: PDFRef,
): ItemWithRef[] {
  const context = doc.context
  const items: ItemWithRef[] = []

  for (const node of nodes) {
    if (node.kind === 'file') {
      const page = pages[node.pageIndex]
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
      // Directory = parent outline item — create it first so children can reference it
      const dict = context.obj({
        Title: PDFHexString.fromText(node.name),
        Parent: parentRef,
      })
      const ref = context.register(dict)

      // Build children with this dir node as their parent
      const childItems = buildOutlineItems(doc, node.children, pages, ref)
      if (childItems.length === 0) continue

      linkSiblings(childItems)
      dict.set(PDFName.of('First'), childItems[0].ref)
      dict.set(PDFName.of('Last'), childItems[childItems.length - 1].ref)
      dict.set(PDFName.of('Count'), context.obj(-countVisible(node.children)))

      items.push({ dict, ref })
    }
  }

  return items
}

function linkSiblings(items: ItemWithRef[]): void {
  for (let i = 0; i < items.length; i++) {
    if (i > 0) {
      items[i].dict.set(PDFName.of('Prev'), items[i - 1].ref)
    }
    if (i < items.length - 1) {
      items[i].dict.set(PDFName.of('Next'), items[i + 1].ref)
    }
  }
}

function countVisible(nodes: OutlineNode[]): number {
  let count = 0
  for (const node of nodes) {
    count += 1
    if (node.kind === 'dir') {
      count += countVisible(node.children)
    }
  }
  return count
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
