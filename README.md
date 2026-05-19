# md-directory-to-pdf

Convert a directory of Markdown files into a single PDF with an outline hierarchy that mirrors the directory structure.

## Features

- **Recursive discovery** — walks the input directory and collects all `.md` files
- **Smart sorting** — `README.md` is always placed first within its directory
- **Syntax highlighting** — code blocks are highlighted via highlight.js (GitHub theme)
- **Mermaid diagrams** — fenced Mermaid blocks are rendered as diagrams (bundled locally, no CDN dependency)
- **Local images** — relative image paths are resolved to the source file's directory automatically
- **Global page numbers** — every page is numbered across the entire merged document
- **PDF outline** — navigable bookmark tree matching the directory layout
- **Custom fonts** — embed custom monospace/body fonts via `--font-mono` / `--font-content` (file path or system font name)
- **Concurrent-safe** — each run creates a unique temp directory, safe for parallel invocations

## Prerequisites

- Node.js >= 18
- Chromium (for Playwright rendering)

## Setup

```sh
cd tools/md-directory-to-pdf
npm install
npx playwright install chromium
```

## Usage

```sh
npx tsx src/index.ts <input-dir> [output-pdf] [options]
```

### Arguments

| Argument | Required | Description |
| --- | --- | --- |
| `input-dir` | Yes | Root directory to scan for `.md` files (recursively) |
| `output-pdf` | No | Output PDF path (default: `<input-dir-name>.pdf` in the current directory) |
| `--temp-dir <dir>` | No | Base directory for intermediate PDFs (default: system temp) |
| `--font-mono <spec>` | No | Custom monospace font for code blocks (file path or system font name) |
| `--font-content <spec>` | No | Custom body text font (file path or system font name) |

### Examples

```sh
# Generate my-docs.pdf from all .md files under ./my-docs/
npx tsx src/index.ts ./my-docs

# Specify output path
npx tsx src/index.ts ./docs ./out/merged.pdf

# Use a custom temp directory
npx tsx src/index.ts ./docs ./out/merged.pdf --temp-dir ./tmp

# Embed a monospace font by system name (recommended for CJK code blocks)
npx tsx src/index.ts ./docs --font-mono "Maple Mono Normal NF CN"

# Embed fonts by file path
npx tsx src/index.ts ./docs --font-mono C:/Windows/Fonts/CascadiaCode.ttf --font-content C:/Windows/Fonts/SourceHanSerif-Regular.otf
```

> Fonts are embedded as subsets — only the glyphs actually used in the document are included in the final PDF, keeping file size small regardless of the source font size.

## How It Works

1. **Discover** — recursively finds all `.md` files, with `README.md` sorted first in each directory
2. **Render** — each file is converted to HTML (via marked with syntax highlighting), relative image paths are resolved, custom fonts are embedded via `@font-face`, then Chromium renders the page to a single PDF with Mermaid diagrams inlined
3. **Merge** — all individual PDFs are concatenated with pdf-lib; global page numbers and a bookmark outline are stamped onto the final document
4. **Cleanup** — only the per-run temp directory is removed after merging

---

# md-directory-to-pdf（中文说明）

将一个目录中的所有 Markdown 文件合并为单个 PDF，并生成与目录结构对应的书签大纲。

## 功能特性

- **递归发现** — 遍历输入目录，收集所有 `.md` 文件
- **智能排序** — 每个目录中的 `README.md` 始终排在最前面
- **代码高亮** — 通过 highlight.js 对代码块进行语法高亮（GitHub 主题）
- **Mermaid 图表** — Mermaid 围栏代码块渲染为图表（本地构建，无需 CDN）
- **本地图片** — 相对路径图片自动基于源文件目录解析
- **全局页码** — 页码贯穿整个合并文档连续编号
- **PDF 书签大纲** — 可导航的书签树，与目录结构对应
- **自定义字体** — 通过 `--font-mono` / `--font-content` 嵌入自定义等宽/正文字体（支持文件路径或系统字体名）
- **并发安全** — 每次运行创建唯一临时目录，可并行调用

## 环境要求

- Node.js >= 18
- Chromium（供 Playwright 渲染使用）

## 安装

```sh
cd tools/md-directory-to-pdf
npm install
npx playwright install chromium
```

## 用法

```sh
npx tsx src/index.ts <input-dir> [output-pdf] [options]
```

### 参数说明

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `input-dir` | 是 | 要扫描的根目录（递归查找 `.md` 文件） |
| `output-pdf` | 否 | 输出 PDF 路径（默认：当前目录下的 `<input-dir-name>.pdf`） |
| `--temp-dir <dir>` | 否 | 中间 PDF 临时目录的基路径（默认：系统临时目录） |
| `--font-mono <spec>` | 否 | 代码块的自定义等宽字体（文件路径或系统字体名） |
| `--font-content <spec>` | 否 | 正文的自定义字体（文件路径或系统字体名） |

### 使用示例

```sh
# 将 ./my-docs/ 下所有 .md 文件生成 my-docs.pdf
npx tsx src/index.ts ./my-docs

# 指定输出路径
npx tsx src/index.ts ./docs ./out/merged.pdf

# 使用自定义临时目录
npx tsx src/index.ts ./docs ./out/merged.pdf --temp-dir ./tmp

# 按系统字体名嵌入等宽字体（推荐用于含中文的代码块）
npx tsx src/index.ts ./docs --font-mono "Maple Mono Normal NF CN"

# 按文件路径嵌入字体
npx tsx src/index.ts ./docs --font-mono C:/Windows/Fonts/CascadiaCode.ttf --font-content C:/Windows/Fonts/SourceHanSerif-Regular.otf
```

> 字体以子集形式嵌入 — 仅包含文档中实际使用的字形，因此无论源字体多大，最终 PDF 体积都很小。

## 工作流程

1. **发现** — 递归查找所有 `.md` 文件，每个目录中 `README.md` 排在最前面
2. **渲染** — 通过 marked 将每个文件转为 HTML（含语法高亮），解析相对图片路径，通过 `@font-face` 嵌入自定义字体，Chromium 渲染为单页 PDF，内联 Mermaid 图表
3. **合并** — 使用 pdf-lib 拼接所有 PDF，统一添加全局页码和书签大纲
4. **清理** — 仅删除当次运行的临时目录
