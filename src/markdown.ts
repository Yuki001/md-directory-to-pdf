import path from 'node:path'
import { marked } from 'marked'
import { markedHighlight } from 'marked-highlight'
import hljs from 'highlight.js'
import { buildHtmlPage } from './html-template'
import type { PageFonts } from './fonts'
import type { PreparedDocument } from './types'

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

export async function prepareHtmlDocument(
  mdContent: string,
  sourceFilePath: string,
  relativePath: string,
  fonts?: PageFonts,
  fontBasePath?: string,
): Promise<PreparedDocument> {
  mdContent = resolveLocalImagePaths(mdContent, sourceFilePath)
  const bodyHtml = rewriteMermaidBlocks(await marked.parse(mdContent))
  const html = buildHtmlPage(bodyHtml, relativePath, fonts, fontBasePath)
  const title = extractTitleFromHtml(bodyHtml, relativePath)
  return { title, relativePath, html }
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

function extractTitleFromHtml(bodyHtml: string, fallback: string): string {
  const match = bodyHtml.match(/<h1[^>]*>(.*?)<\/h1>/)
  if (match) {
    const raw = match[1].replace(/<[^>]*>/g, '').trim()
    return raw.replace(/[​-‍﻿]/g, '').trim()
  }
  return path.basename(fallback, '.md')
}
