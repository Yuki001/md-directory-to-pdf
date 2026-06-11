import type { PageFonts } from './fonts'

export interface PreparedDocument {
  title: string
  relativePath: string
  html: string
}

export interface OutputFormat {
  write(
    docs: PreparedDocument[],
    outputPath: string,
    fonts?: PageFonts,
  ): Promise<void>
}
