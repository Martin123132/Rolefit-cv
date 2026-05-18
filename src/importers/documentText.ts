export type ImportResultState = 'done' | 'warning'

export type ImportedDocumentText = {
  message: string
  state: ImportResultState
  text: string
}

type PdfTextItem = {
  hasEOL?: boolean
  str?: string
}

const textExtensions = new Set(['.txt', '.md', '.markdown'])
const docxExtensions = new Set(['.docx'])
const pdfExtensions = new Set(['.pdf'])
const supportedExtensions = new Set([...textExtensions, ...docxExtensions, ...pdfExtensions])

export const importAccept = '.txt,.md,.markdown,.docx,.pdf'
export const maxExtractedTextChars = 64 * 1024
export const maxRichDocumentBytes = 5 * 1024 * 1024
export const maxTextDocumentBytes = maxExtractedTextChars

export function importExtension(filename: string) {
  const trimmed = filename.trim().toLowerCase()
  const dotIndex = trimmed.lastIndexOf('.')
  return dotIndex >= 0 ? trimmed.slice(dotIndex) : ''
}

export function isSupportedImportFile(file: File) {
  return supportedExtensions.has(importExtension(file.name))
}

export function importSizeLimitFor(file: File) {
  return textExtensions.has(importExtension(file.name)) ? maxTextDocumentBytes : maxRichDocumentBytes
}

export function supportedImportMessage() {
  return '.txt, .md, .markdown, .docx, or .pdf'
}

export function importSizeLimitMessage(file: File) {
  return textExtensions.has(importExtension(file.name)) ? '64 KB' : '5 MB'
}

function cleanExtractedText(text: string) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function assertExtractedTextFits(text: string, filename: string) {
  if (text.length > maxExtractedTextChars) {
    throw new Error(`${filename} imported more than 64 KB of text. Shorten the file or paste the most relevant sections.`)
  }
}

async function readPlainText(file: File): Promise<ImportedDocumentText> {
  const text = cleanExtractedText(await file.text())
  assertExtractedTextFits(text, file.name)

  return {
    message: `Loaded ${file.name}.`,
    state: 'done',
    text,
  }
}

async function readDocxText(file: File): Promise<ImportedDocumentText> {
  const mammoth = await import('mammoth')
  const result = await mammoth.default.extractRawText({ arrayBuffer: await file.arrayBuffer() })
  const text = cleanExtractedText(result.value)
  assertExtractedTextFits(text, file.name)

  return {
    message:
      result.messages.length > 0
        ? `Loaded ${file.name}. Some DOCX formatting may need cleanup.`
        : `Loaded ${file.name}. DOCX formatting may need cleanup.`,
    state: 'warning',
    text,
  }
}

async function readPdfText(file: File): Promise<ImportedDocumentText> {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])

  pdfjs.GlobalWorkerOptions.workerSrc = worker.default

  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const pages: string[] = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const pageText = (content.items as PdfTextItem[])
      .map((item) => {
        if (!item.str) return ''
        return item.hasEOL ? `${item.str}\n` : item.str
      })
      .join(' ')
    pages.push(pageText)
  }

  const text = cleanExtractedText(pages.join('\n\n'))

  if (text.length < 30) {
    throw new Error(`${file.name} looks scanned or image-only. Paste the text manually or use an OCR version.`)
  }

  assertExtractedTextFits(text, file.name)

  return {
    message: `Loaded ${file.name}. PDF spacing may need cleanup.`,
    state: 'warning',
    text,
  }
}

export async function extractImportedDocumentText(file: File): Promise<ImportedDocumentText> {
  const extension = importExtension(file.name)

  if (textExtensions.has(extension)) return readPlainText(file)
  if (docxExtensions.has(extension)) return readDocxText(file)
  if (pdfExtensions.has(extension)) return readPdfText(file)

  throw new Error(`${file.name} is not supported. Use ${supportedImportMessage()}.`)
}
