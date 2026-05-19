import { promises as fs } from 'node:fs'
import path from 'node:path'
import { chromium, devices, type BrowserContext } from 'playwright'
import { marked } from 'marked'
import { markedHighlight } from 'marked-highlight'
import hljs from 'highlight.js'
import { buildHtmlPage } from './html-template'
import type { PageFonts } from './fonts'

marked.use(
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code: string, lang: string) {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value
      }
      return hljs.highlightAuto(code).value
    },
  }),
)

export type RenderedPdf = {
  title: string
  tempPdfPath: string
  relativePath: string
}

const PDF_MARGIN = {
  top: '14mm',
  bottom: '14mm',
  left: '12mm',
  right: '12mm',
}

export async function renderMarkdownToPdf(
  context: BrowserContext,
  mdContent: string,
  tempPdfPath: string,
  relativePath: string,
  sourceFilePath: string,
  fonts?: PageFonts,
): Promise<RenderedPdf> {
  await fs.mkdir(path.dirname(tempPdfPath), { recursive: true })

  mdContent = resolveLocalImagePaths(mdContent, sourceFilePath)

  const bodyHtml = rewriteMermaidBlocks(await marked.parse(mdContent))
  const page = await context.newPage()

  try {
    const html = buildHtmlPage(bodyHtml, relativePath, fonts)
    await page.setContent(html, { waitUntil: 'networkidle' })

    // Wait for mermaid diagrams if present
    const hasMermaid = mdContent.includes('```mermaid')
    if (hasMermaid) {
      await page.waitForFunction(() => {
        const diagrams = document.querySelectorAll('.mermaid')
        if (diagrams.length === 0) return true
        return Array.from(diagrams).every((d) => d.getAttribute('data-processed') === 'true')
      }, { timeout: 15000 }).catch(() => {
        console.warn(`Mermaid render timed out for ${relativePath}, continuing anyway`)
      })
    }

    const title = await extractPageTitle(page, relativePath)

    await page.pdf({
      path: tempPdfPath,
      format: 'A4',
      printBackground: true,
      margin: PDF_MARGIN,
    })

    return { title, tempPdfPath, relativePath }
  } finally {
    await page.close()
  }
}

async function extractPageTitle(page: import('playwright').Page, fallback: string): Promise<string> {
  const heading = await page.locator('h1').first().textContent().catch(() => null)
  const title = heading?.trim()
  if (title) return cleanTitle(title)
  return path.basename(fallback, '.md')
}

function cleanTitle(t: string): string {
  // Remove zero-width characters and trim
  return t.replace(/[​-‍﻿]/g, '').trim()
}

function resolveLocalImagePaths(mdContent: string, sourceFilePath: string): string {
  const sourceDir = path.dirname(sourceFilePath)
  return mdContent.replace(
    /!\[([^\]]*)\]\(((?!https?:\/\/|file:\/\/|\/|#)[^)]+)\)/g,
    (_, alt: string, imgPath: string) => {
      const resolved = path.resolve(sourceDir, imgPath)
      return `![${alt}](file:///${resolved.replace(/\\/g, '/')})`
    },
  )
}

function rewriteMermaidBlocks(html: string): string {
  return html.replace(
    /<pre><code class="[^"]*language-mermaid[^"]*">([\s\S]*?)<\/code><\/pre>/g,
    (_, highlightedCode: string) => {
      const rawMermaid = highlightedCode
        .replace(/<[^>]*>/g, '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
      return `<pre class="mermaid">\n${rawMermaid}\n</pre>`
    },
  )
}
