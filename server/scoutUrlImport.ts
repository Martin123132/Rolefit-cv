import type { IncomingMessage, ServerResponse } from 'node:http'

type ScoutUrlImportRequest = {
  url?: string
}

type ScoutUrlImportResult = {
  sourceUrl: string
  text: string
  title: string
}

const maxBodyBytes = 8 * 1024
const maxUrlLength = 2_048
const fetchTimeoutMs = 12_000
const maxFetchedBytes = 1_024 * 1_024
const maxExtractedTextChars = 64 * 1024
const minReadableTextChars = 80

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(payload))
}

function readJsonBody(request: IncomingMessage) {
  return new Promise<unknown>((resolve, reject) => {
    let received = 0
    const chunks: Buffer[] = []

    request.on('data', (chunk: Buffer) => {
      received += chunk.byteLength
      if (received > maxBodyBytes) {
        reject(new Error('Request body is too large.'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })

    request.on('end', () => {
      try {
        const rawBody = Buffer.concat(chunks).toString('utf8')
        resolve(rawBody ? JSON.parse(rawBody) : {})
      } catch {
        reject(new Error('Request body must be valid JSON.'))
      }
    })

    request.on('error', reject)
  })
}

function parseImportUrl(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Paste one full job advert URL to import.')
  }

  const rawUrl = value.trim()
  if (rawUrl.length > maxUrlLength) {
    throw new Error('That URL is too long. Paste the advert text instead.')
  }

  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error('Use a full http:// or https:// job advert URL.')
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Use a normal http:// or https:// job advert URL.')
  }

  return url
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&#(\d+);/g, (_match, codePoint: string) => String.fromCodePoint(Number(codePoint)))
    .replace(/&#x([\da-f]+);/gi, (_match, codePoint: string) => String.fromCodePoint(parseInt(codePoint, 16)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
}

function normaliseExtractedText(value: string) {
  const lines = decodeHtmlEntities(value)
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)

  return lines
    .filter((line, index) => line !== lines[index - 1])
    .join('\n')
    .trim()
}

function firstHtmlMatch(html: string, pattern: RegExp) {
  const match = html.match(pattern)
  return match?.[1] ? normaliseExtractedText(match[1].replace(/<[^>]+>/g, ' ')) : ''
}

function titleFromUrl(url: URL) {
  const slug = url.pathname
    .split('/')
    .filter(Boolean)
    .at(-1)
    ?.replace(/\.[a-z0-9]+$/i, '')
    .replace(/[-_+]+/g, ' ')
    .trim()

  return slug ? `${slug[0].toUpperCase()}${slug.slice(1)}` : url.hostname
}

function extractTitle(html: string, sourceUrl: URL) {
  const title =
    firstHtmlMatch(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i) ||
    firstHtmlMatch(html, /<meta\b[^>]*(?:property|name)=["'](?:og:title|twitter:title)["'][^>]*content=["']([^"']+)["'][^>]*>/i) ||
    firstHtmlMatch(html, /<title\b[^>]*>([\s\S]*?)<\/title>/i) ||
    titleFromUrl(sourceUrl)

  return title.length <= 90 ? title : `${title.slice(0, 87).trim()}...`
}

function stripHtmlNoise(html: string) {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|svg|canvas|noscript|template|iframe)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(nav|header|footer|aside|form|button)\b[\s\S]*?<\/\1>/gi, ' ')
}

function htmlToReadableText(html: string) {
  const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)
  const body = bodyMatch?.[1] ?? html

  return normaliseExtractedText(
    stripHtmlNoise(body)
      .replace(/<\/(h[1-6]|p|li|div|section|article|main|tr|table|ul|ol)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
}

function buildReadableResult(rawText: string, contentType: string, sourceUrl: URL): ScoutUrlImportResult {
  const isHtml = contentType.includes('html') || /<html|<body|<article|<main|<h1/i.test(rawText)
  const title = isHtml ? extractTitle(rawText, sourceUrl) : titleFromUrl(sourceUrl)
  const pageText = isHtml ? htmlToReadableText(rawText) : normaliseExtractedText(rawText)
  const text = pageText.toLowerCase().includes(title.toLowerCase()) ? pageText : `${title}\n${pageText}`.trim()

  if (text.length < minReadableTextChars) {
    throw new Error('This page did not expose enough readable advert text. Paste the advert text instead.')
  }

  if (text.length > maxExtractedTextChars) {
    throw new Error('The readable advert text is over 64 KB. Paste only the advert section instead.')
  }

  return {
    sourceUrl: sourceUrl.toString(),
    text,
    title,
  }
}

async function readResponseText(response: Response) {
  const contentLength = Number(response.headers.get('content-length') ?? 0)
  if (contentLength > maxFetchedBytes) {
    throw new Error('This page is too large to import safely. Paste the advert text instead.')
  }

  if (!response.body) return response.text()

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue

    received += value.byteLength
    if (received > maxFetchedBytes) {
      await reader.cancel()
      throw new Error('This page is too large to import safely. Paste the advert text instead.')
    }
    chunks.push(value)
  }

  return Buffer.concat(chunks).toString('utf8')
}

async function importJobUrl(url: URL) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs)

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'text/html,text/plain;q=0.9,*/*;q=0.2',
        'User-Agent': 'RolefitCV/0.1 local job URL import',
      },
      redirect: 'follow',
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`This site returned ${response.status}. Paste the advert text instead.`)
    }

    const rawText = await readResponseText(response)
    return buildReadableResult(rawText, response.headers.get('content-type') ?? '', url)
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('This site took too long to respond. Paste the advert text instead.', { cause: error })
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

export async function handleScoutUrlImportApi(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== 'POST') {
    sendJson(response, 405, { error: 'Use POST for this endpoint.' })
    return
  }

  try {
    const parsedBody = (await readJsonBody(request)) as ScoutUrlImportRequest
    const url = parseImportUrl(parsedBody.url)
    const result = await importJobUrl(url)
    sendJson(response, 200, result)
  } catch (error) {
    sendJson(response, 200, {
      error: error instanceof Error ? error.message : 'This URL could not be imported. Paste the advert text instead.',
    })
  }
}
