import path from 'node:path'
import { createWriteStream, readFileSync } from 'node:fs'
import { ZipArchive } from 'archiver'
import { chromium } from 'playwright'
import { buildOutlineTree } from '../outline'
import type { OutlineNode } from '../outline'
import type { PreparedDocument, OutputFormat } from '../types'
import type { PageFonts, EmbeddedFont } from '../fonts'

export class EpubFormat implements OutputFormat {
  async write(
    docs: PreparedDocument[],
    outputPath: string,
    fonts?: PageFonts,
  ): Promise<void> {
    const processedDocs = await preRenderAllMermaid(docs)

    const chapters: { filename: string; title: string; html: string }[] = []
    for (let i = 0; i < processedDocs.length; i++) {
      const num = String(i + 1).padStart(3, '0')
      chapters.push({
        filename: `chapter-${num}.xhtml`,
        title: processedDocs[i].title,
        html: injectEpubCss(stripScripts(processedDocs[i].html)),
      })
    }

    const indices = chapters.map((_, i) => i)
    const outline = buildOutlineTree(
      processedDocs.map((d) => ({ title: d.title, relativePath: d.relativePath })),
      indices,
    )

    await buildEpub(chapters, outline, outputPath, fonts)
  }
}

function resolveMermaidJsPath(): string {
  const candidates = [
    path.resolve('node_modules/mermaid/dist/mermaid.min.js'),
    path.resolve('../node_modules/mermaid/dist/mermaid.min.js'),
    path.resolve('../../node_modules/mermaid/dist/mermaid.min.js'),
    path.resolve('../../../node_modules/mermaid/dist/mermaid.min.js'),
  ]
  for (const candidate of candidates) {
    try {
      readFileSync(candidate)
      return candidate
    } catch { /* continue */ }
  }
  return ''
}

async function preRenderAllMermaid(docs: PreparedDocument[]): Promise<PreparedDocument[]> {
  const hasAnyMermaid = docs.some((d) => d.html.includes('class="mermaid"'))
  if (!hasAnyMermaid) return docs

  const mermaidJs = resolveMermaidJsPath()
  if (!mermaidJs) {
    console.warn('mermaid.min.js not found, skipping mermaid pre-rendering for EPUB')
    return docs
  }

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  try {
    await page.setContent(`<html><body></body></html>`)
    await page.addScriptTag({ content: readFileSync(mermaidJs, 'utf-8') })
    await page.evaluate(() => {
      (window as any).mermaid.initialize({ startOnLoad: false, theme: 'default', htmlLabels: false })
    })

    const result: PreparedDocument[] = []
    for (const doc of docs) {
      const html = await preRenderMermaidInHtml(page, doc.html)
      result.push({ ...doc, html })
    }
    return result
  } finally {
    await page.close()
    await browser.close()
  }
}

async function preRenderMermaidInHtml(
  page: import('playwright').Page,
  html: string,
): Promise<string> {
  const mermaidRegex = /<pre class="mermaid">\n([\s\S]*?)\n<\/pre>/g
  const matches: { full: string; code: string }[] = []
  let match: RegExpExecArray | null
  mermaidRegex.lastIndex = 0
  while ((match = mermaidRegex.exec(html)) !== null) {
    matches.push({ full: match[0], code: match[1] })
  }

  let result = html
  for (const m of matches) {
    try {
      const svg = await page.evaluate((code: string) => {
        const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2)}`
        return (window as any).mermaid.render(id, code)
      }, m.code)
      const svgDiv = `<div class="mermaid">\n${(svg as any).svg}\n</div>`
      result = result.replace(m.full, svgDiv)
    } catch (e) {
      console.warn(`Mermaid render failed, leaving as code block: ${(e as Error).message}`)
    }
  }
  return result
}

async function buildEpub(
  chapters: { filename: string; title: string; html: string }[],
  outline: OutlineNode[],
  outputPath: string,
  fonts?: PageFonts,
): Promise<void> {
  const archive = new ZipArchive({ zlib: { level: 9 } })

  // mimetype — uncompressed, first entry
  archive.append('application/epub+zip', { name: 'mimetype', store: true })

  // META-INF/container.xml
  archive.append(
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
    { name: 'META-INF/container.xml' },
  )

  const fontFilenames: { mono?: string; content?: string } = {}

  if (fonts?.mono) {
    fontFilenames.mono = writeFontToArchive(archive, 'mono', fonts.mono)
  }
  if (fonts?.content) {
    fontFilenames.content = writeFontToArchive(archive, 'content', fonts.content)
  }

  // nav.xhtml
  archive.append(buildNavXhtml(outline, chapters), { name: 'OEBPS/nav.xhtml' })

  // chapters
  for (const ch of chapters) {
    archive.append(ch.html, { name: `OEBPS/${ch.filename}` })
  }

  // content.opf
  archive.append(buildContentOpf(chapters, fontFilenames), { name: 'OEBPS/content.opf' })

  const stream = createWriteStream(outputPath)
  archive.pipe(stream)
  await new Promise<void>((resolve, reject) => {
    stream.on('close', resolve)
    stream.on('error', reject)
    archive.finalize()
  })
}

function formatToExt(format: string): string {
  switch (format) {
    case 'opentype': return 'otf'
    case 'woff2': return 'woff2'
    case 'woff': return 'woff'
    default: return 'ttf'
  }
}

function writeFontToArchive(
  archive: ZipArchive,
  key: string,
  font: EmbeddedFont,
): string {
  const ext = formatToExt(font.format)
  const filename = `${key}.${ext}`
  const buf = Buffer.from(font.base64, 'base64')
  archive.append(buf, { name: `OEBPS/fonts/${filename}` })
  return filename
}

function buildNavXhtml(
  outline: OutlineNode[],
  chapters: { filename: string; title: string }[],
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Table of Contents</title></head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Table of Contents</h1>
    ${buildNavOl(outline, chapters)}
  </nav>
</body>
</html>`
}

function buildNavOl(
  nodes: OutlineNode[],
  chapters: { filename: string; title: string }[],
): string {
  let html = '<ol>\n'
  for (const node of nodes) {
    if (node.kind === 'file') {
      const ch = chapters[node.index]
      html += `  <li><a href="${escapeXml(ch.filename)}">${escapeXml(node.title)}</a></li>\n`
    } else {
      const firstCh = chapters[firstLeafIndex(node)]
      html += `  <li>\n    <a href="${escapeXml(firstCh.filename)}">${escapeXml(node.name)}</a>\n`
      html += `    ${buildNavOl(node.children, chapters)}`
      html += `  </li>\n`
    }
  }
  html += '</ol>\n'
  return html
}

function firstLeafIndex(node: OutlineNode): number {
  if (node.kind === 'file') return node.index
  return firstLeafIndex(node.children[0])
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildContentOpf(
  chapters: { filename: string; title: string }[],
  fontFilenames: { mono?: string; content?: string },
): string {
  let manifest = '    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>\n'
  let spine = ''

  for (const ch of chapters) {
    const id = ch.filename.replace('.xhtml', '')
    manifest += `    <item id="${id}" href="${ch.filename}" media-type="application/xhtml+xml"/>\n`
    spine += `    <itemref idref="${id}" linear="yes"/>\n`
  }

  if (fontFilenames.mono) {
    const ext = path.extname(fontFilenames.mono).slice(1)
    manifest += `    <item id="font-mono" href="fonts/${fontFilenames.mono}" media-type="${fontMimeTypeByExt(ext)}"/>\n`
  }
  if (fontFilenames.content) {
    const ext = path.extname(fontFilenames.content).slice(1)
    manifest += `    <item id="font-content" href="fonts/${fontFilenames.content}" media-type="${fontMimeTypeByExt(ext)}"/>\n`
  }

  const title = chapters.length > 0 ? escapeXml(chapters[0].title) : 'Generated EPUB'

  return `<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" unique-identifier="book-id" xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">urn:uuid:${generateUuid()}</dc:identifier>
    <dc:title>${title}</dc:title>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta>
  </metadata>
  <manifest>
${manifest}  </manifest>
  <spine>
${spine}  </spine>
</package>`
}

function fontMimeTypeByExt(ext: string): string {
  switch (ext) {
    case 'otf': return 'application/vnd.ms-opentype'
    case 'woff2': return 'font/woff2'
    case 'woff': return 'application/font-woff'
    default: return 'application/x-font-ttf'
  }
}

function generateUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function stripScripts(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/g, '')
}

function injectEpubCss(html: string): string {
  // Replace <pre> with <div class="code-block"> so content reflows naturally.
  // (pre is unbreakable in many EPUB readers even with break-inside: auto.)
  html = html.replace(/<pre([\s>])/g, '<div class="code-block"$1')
  html = html.replace(/<\/pre>/g, '</div>')

  const epubCss = `
    body { max-width: none !important; padding: 16px 16px !important; }
    /* Reset :not(pre)>code inline-code styling that now matches our code-block divs */
    .code-block, .code-block code { font-size: 13px; line-height: 1.5; border: none; border-radius: 0; padding: 0; background: transparent; }
    /* Re-apply code-block styling */
    .code-block { margin: 0 0 16px; break-inside: auto; border-radius: 6px; background: var(--color-code-bg); border: 1px solid var(--color-border); }
    .code-block code { display: block; padding: 14px; background: var(--color-code-bg); border-radius: 6px; white-space: pre-wrap !important; overflow-wrap: break-word !important; word-break: break-all !important; }
    blockquote { break-inside: auto !important; }
    table { break-inside: auto !important; }
    .mermaid { break-inside: auto !important; }
    .mermaid svg { max-width: 100% !important; height: auto !important; }
  </style>`
  return html.replace('</style>', epubCss)
}
