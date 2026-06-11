# md-directory-to-pdf

Convert a directory of Markdown files into a single PDF or EPUB with an outline hierarchy that mirrors the directory structure.

## Features

- **Recursive discovery** — walks the input directory and collects all `.md` files
- **Smart sorting** — `README.md` is always placed first within its directory
- **Syntax highlighting** — code blocks are highlighted via highlight.js (GitHub theme)
- **Mermaid diagrams** — fenced Mermaid blocks are rendered as diagrams (bundled locally, no CDN dependency)
- **Local images** — relative image paths are resolved to the source file's directory automatically
- **Global page numbers** — every page is numbered across the entire merged document
- **PDF outline** — navigable bookmark tree matching the directory layout
- **Custom fonts** — embed custom monospace/body fonts via `--font-mono` / `--font-content` (file path or system font name)
- **PDF compression** — automatic Ghostscript compression via `compress-pdf`, typically reducing file size by 40-50%
- **EPUB output** — `--format epub` produces an EPUB 3 container with navigable TOC, pre-rendered Mermaid SVGs, embedded fonts, and reflow-friendly code blocks
- **Concurrent-safe** — each run creates a unique temp directory, safe for parallel invocations

## Prerequisites

- Node.js >= 18
- Chromium (for Playwright rendering)

## Setup

```sh
npm install
npx playwright install chromium
```

> **Windows note:** If the Ghostscript binary download fails during `npm install` (the `compress-pdf` postinstall has known issues with Windows tar xz support), the tool will still work — PDF compression will simply be skipped. To enable compression, install Ghostscript manually:
> ```sh
> choco install ghostscript          # Chocolatey
> # or download from https://ghostscript.com/releases/gsdnld.html
> ```

## Usage

```sh
npx tsx src/index.ts <input-dir> [output-file] [options]
```

### Arguments

| Argument | Required | Description |
| --- | --- | --- |
| `input-dir` | Yes | Root directory to scan for `.md` files (recursively) |
| `output-file` | No | Output path (default: `<input-dir-name>.pdf` or `.epub`) |
| `--format <pdf\|epub>` | No | Output format (default: `pdf`) |
| `--temp-dir <dir>` | No | Base directory for intermediate files (default: system temp) |
| `--font-mono <spec>` | No | Custom monospace font for code blocks (file path or system font name) |
| `--font-content <spec>` | No | Custom body text font (file path or system font name) |

### Examples

```sh
# Generate my-docs.pdf from all .md files under ./my-docs/ (default: PDF)
npx tsx src/index.ts ./my-docs

# Specify output path
npx tsx src/index.ts ./docs ./out/merged.pdf

# Generate EPUB
npx tsx src/index.ts ./my-docs --format epub
npx tsx src/index.ts ./my-docs ./out/book.epub --format epub

# EPUB with CJK fonts
npx tsx src/index.ts ./my-docs --format epub --font-mono "Maple Mono Normal NF CN" --font-content "Source Han Serif"

# Use a custom temp directory
npx tsx src/index.ts ./docs ./out/merged.pdf --temp-dir ./tmp

# Embed a monospace font by system name (recommended for CJK code blocks)
npx tsx src/index.ts ./docs --font-mono "Maple Mono Normal NF CN"

# Embed fonts by file path
npx tsx src/index.ts ./docs --font-mono C:/Windows/Fonts/CascadiaCode.ttf --font-content C:/Windows/Fonts/SourceHanSerif-Regular.otf
```

> Fonts are embedded as subsets — only the glyphs actually used in the document are included in the final PDF, keeping file size small regardless of the source font size.

## How It Works

**PDF pipeline:**
1. **Discover** — recursively finds all `.md` files, with `README.md` sorted first in each directory
2. **Render** — each file is converted to HTML (via marked with syntax highlighting), relative image paths are resolved, custom fonts are embedded via `@font-face`, then Chromium renders the page to a single PDF with Mermaid diagrams rendered by mermaid.js
3. **Merge** — all individual PDFs are concatenated with pdf-lib; global page numbers and a bookmark outline are stamped onto the final document
4. **Compress** — the merged PDF is compressed via Ghostscript (bundled by `compress-pdf`), typically reducing file size by 40-50%

**EPUB pipeline:**
1. **Discover** — same as PDF
2. **Convert** — each file is converted to HTML via the same shared pipeline (marked + highlight.js)
3. **Pre-render** — Mermaid diagrams are rendered to SVG via Playwright (EPUB readers do not run JavaScript)
4. **Package** — HTML chapters are packaged into an EPUB 3 container with `nav.xhtml` TOC, `content.opf` manifest, external font files, and reflow-friendly CSS overrides

---

# md-directory-to-pdf（中文说明）

将一个目录中的所有 Markdown 文件合并为单个 PDF 或 EPUB，并生成与目录结构对应的书签大纲/导航目录。

## 功能特性

- **递归发现** — 遍历输入目录，收集所有 `.md` 文件
- **智能排序** — 每个目录中的 `README.md` 始终排在最前面
- **代码高亮** — 通过 highlight.js 对代码块进行语法高亮（GitHub 主题）
- **Mermaid 图表** — Mermaid 围栏代码块渲染为图表（本地构建，无需 CDN）
- **本地图片** — 相对路径图片自动基于源文件目录解析
- **全局页码** — 页码贯穿整个合并文档连续编号
- **PDF 书签大纲** — 可导航的书签树，与目录结构对应
- **自定义字体** — 通过 `--font-mono` / `--font-content` 嵌入自定义等宽/正文字体（支持文件路径或系统字体名）
- **PDF 压缩** — 通过 `compress-pdf` 自动调用 Ghostscript 压缩，通常可减少 40-50% 体积
- **EPUB 输出** — `--format epub` 生成 EPUB 3 容器，包含可导航目录、预渲染 Mermaid SVG、嵌入字体和自适应代码块
- **并发安全** — 每次运行创建唯一临时目录，可并行调用

## 环境要求

- Node.js >= 18
- Chromium（供 Playwright 渲染使用）

## 安装

```sh
npm install
npx playwright install chromium
```

> **Windows 注意：** 如果 Ghostscript 二进制在 `npm install` 时下载失败（`compress-pdf` 的 postinstall 在 Windows 上对 tar xz 支持存在已知问题），工具仍可正常使用——仅跳过 PDF 压缩。如需启用压缩，请手动安装 Ghostscript：
> ```sh
> choco install ghostscript          # 通过 Chocolatey
> # 或从 https://ghostscript.com/releases/gsdnld.html 下载
> ```

## 用法

```sh
npx tsx src/index.ts <input-dir> [output-file] [options]
```

### 参数说明

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `input-dir` | 是 | 要扫描的根目录（递归查找 `.md` 文件） |
| `output-file` | 否 | 输出路径（默认：`<input-dir-name>.pdf` 或 `.epub`） |
| `--format <pdf\|epub>` | 否 | 输出格式（默认：`pdf`） |
| `--temp-dir <dir>` | 否 | 中间文件临时目录的基路径（默认：系统临时目录） |
| `--font-mono <spec>` | 否 | 代码块的自定义等宽字体（文件路径或系统字体名） |
| `--font-content <spec>` | 否 | 正文的自定义字体（文件路径或系统字体名） |

### 使用示例

```sh
# 将 ./my-docs/ 下所有 .md 文件生成 my-docs.pdf（默认 PDF）
npx tsx src/index.ts ./my-docs

# 指定输出路径
npx tsx src/index.ts ./docs ./out/merged.pdf

# 生成 EPUB
npx tsx src/index.ts ./my-docs --format epub
npx tsx src/index.ts ./my-docs ./out/book.epub --format epub

# EPUB 嵌入 CJK 字体
npx tsx src/index.ts ./my-docs --format epub --font-mono "Maple Mono Normal NF CN" --font-content "Source Han Serif"

# 使用自定义临时目录
npx tsx src/index.ts ./docs ./out/merged.pdf --temp-dir ./tmp

# 按系统字体名嵌入等宽字体（推荐用于含中文的代码块）
npx tsx src/index.ts ./docs --font-mono "Maple Mono Normal NF CN"

# 按文件路径嵌入字体
npx tsx src/index.ts ./docs --font-mono C:/Windows/Fonts/CascadiaCode.ttf --font-content C:/Windows/Fonts/SourceHanSerif-Regular.otf
```

> 字体以子集形式嵌入 — 仅包含文档中实际使用的字形，因此无论源字体多大，最终 PDF 体积都很小。

## 工作流程

**PDF 管线：**
1. **发现** — 递归查找所有 `.md` 文件，每个目录中 `README.md` 排在最前面
2. **渲染** — 通过 marked 将每个文件转为 HTML（含语法高亮），解析相对图片路径，通过 `@font-face` 嵌入自定义字体，Chromium 渲染为单页 PDF，内联 Mermaid 图表
3. **合并** — 使用 pdf-lib 拼接所有 PDF，统一添加全局页码和书签大纲
4. **压缩** — 通过 `compress-pdf` 自动调用 Ghostscript 压缩合并后的 PDF，通常可减少 40-50% 体积

**EPUB 管线：**
1. **发现** — 同 PDF
2. **转换** — 经同一共享管线将每个文件转为 HTML（marked + highlight.js）
3. **预渲染** — Mermaid 图表通过 Playwright 渲染为 SVG（EPUB 阅读器不支持 JavaScript）
4. **打包** — HTML 章节打包为 EPUB 3 容器，包含 `nav.xhtml` 导航目录、`content.opf` 清单、外部字体文件和自适应 CSS 覆盖
