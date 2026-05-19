import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { PageFonts } from './fonts'

// Resolve highlight.js CSS from node_modules — try a few known locations
function resolveHighlightCss(): string {
  const candidates = [
    path.resolve('node_modules/highlight.js/styles/github.css'),
    path.resolve('../node_modules/highlight.js/styles/github.css'),
    path.resolve('../../node_modules/highlight.js/styles/github.css'),
    path.resolve('../../../node_modules/highlight.js/styles/github.css'),
  ]
  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf-8')
    } catch {
      // continue
    }
  }
  return ''
}

const HIGHLIGHT_CSS = resolveHighlightCss()

function resolveMermaidJs(): string {
  const candidates = [
    path.resolve('node_modules/mermaid/dist/mermaid.min.js'),
    path.resolve('../node_modules/mermaid/dist/mermaid.min.js'),
    path.resolve('../../node_modules/mermaid/dist/mermaid.min.js'),
    path.resolve('../../../node_modules/mermaid/dist/mermaid.min.js'),
  ]
  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf-8')
    } catch {
      // continue
    }
  }
  return ''
}

const MERMAID_JS = resolveMermaidJs()

export function buildHtmlPage(bodyHtml: string, title: string, fonts?: PageFonts): string {
  let fontFaceCss = ''
  let monoPrefix = ''
  let contentPrefix = ''

  if (fonts?.mono) {
    fontFaceCss += `@font-face { font-family: "CustomMono"; src: url(data:application/octet-stream;base64,${fonts.mono.base64}) format('${fonts.mono.format}'); }\n`
    monoPrefix = '"CustomMono", '
  }
  if (fonts?.content) {
    fontFaceCss += `@font-face { font-family: "CustomContent"; src: url(data:application/octet-stream;base64,${fonts.content.base64}) format('${fonts.content.format}'); }\n`
    contentPrefix = '"CustomContent", '
  }

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    ${fontFaceCss}
    ${HIGHLIGHT_CSS}

    :root {
      --color-bg: #ffffff;
      --color-fg: #1a1a1a;
      --color-border: #d0d7de;
      --color-accent: #0969da;
      --color-muted: #656d76;
      --color-code-bg: #f6f8fa;
      --color-blockquote-border: #d0d7de;
      --color-table-stripe: #f6f8fa;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: var(--color-bg);
      color: var(--color-fg);
      font-family: ${contentPrefix}-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      font-size: 15px;
      line-height: 1.7;
      max-width: 820px;
      margin: 0 auto;
      padding: 48px 32px;
    }

    h1 { font-size: 28px; margin: 0 0 16px; font-weight: 700; border-bottom: 1px solid var(--color-border); padding-bottom: 8px; }
    h2 { font-size: 22px; margin: 32px 0 12px; font-weight: 600; page-break-after: avoid; }
    h3 { font-size: 18px; margin: 24px 0 8px; font-weight: 600; page-break-after: avoid; }
    h4 { font-size: 16px; margin: 20px 0 8px; font-weight: 600; page-break-after: avoid; }

    p { margin: 0 0 14px; }
    a { color: var(--color-accent); text-decoration: none; }

    ul, ol { margin: 0 0 14px; padding-left: 28px; }
    li { margin: 0 0 4px; }

    pre { margin: 0 0 16px; border-radius: 6px; overflow-x: auto; font-size: 13px; line-height: 1.5; break-inside: avoid; }
    pre code { display: block; padding: 14px; background: var(--color-code-bg); border: 1px solid var(--color-border); border-radius: 6px; font-family: ${monoPrefix}"Cascadia Code", "Consolas", "Courier New", monospace; }

    :not(pre) > code {
      background: var(--color-code-bg);
      border: 1px solid var(--color-border);
      border-radius: 4px;
      padding: 1px 5px;
      font-size: 0.9em;
      font-family: ${monoPrefix}"Cascadia Code", "Consolas", "Courier New", monospace;
    }

    blockquote {
      margin: 0 0 16px;
      padding: 8px 16px;
      border-left: 4px solid var(--color-blockquote-border);
      color: var(--color-muted);
      break-inside: avoid;
    }

    table {
      margin: 0 0 16px;
      border-collapse: collapse;
      width: 100%;
      break-inside: avoid;
    }
    th, td {
      border: 1px solid var(--color-border);
      padding: 8px 12px;
      text-align: left;
    }
    th { background: var(--color-code-bg); font-weight: 600; }
    tr:nth-child(even) td { background: var(--color-table-stripe); }

    img, svg { max-width: 100%; height: auto; }

    hr { border: none; border-top: 1px solid var(--color-border); margin: 24px 0; }

    .mermaid { margin: 0 0 16px; text-align: center; break-inside: avoid; }
    .mermaid svg { max-width: 100%; }

    @page { margin: 14mm 12mm; }
  </style>
</head>
<body>
  ${bodyHtml}
  <script>${MERMAID_JS}</script>
  <script>mermaid.initialize({ startOnLoad: true, theme: 'default' });</script>
</body>
</html>`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
