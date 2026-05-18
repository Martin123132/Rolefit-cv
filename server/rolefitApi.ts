import type { IncomingMessage, ServerResponse } from 'node:http'

type ProviderId = 'mock' | 'openai' | 'claude' | 'gemini'

type RolefitRequirementEvidence = {
  evidence: string
  nextAction: string
  status: 'strong' | 'missing'
  term: string
}

type RolefitAnalysis = {
  coaching: string[]
  gaps: string[]
  matched: string[]
  questions: string[]
  requirementMap: RolefitRequirementEvidence[]
  rewrite: {
    bullets: string[]
    note: string
    summary: string
  }
  score: number
  title: string
}

type AnalyseRequest = {
  apiKey?: string
  cvText?: string
  jobText?: string
  model?: string
  provider?: ProviderId
  userPrompt?: string
  systemPrompt?: string
}

const maxBodyBytes = 160_000

const rolefitAnalysisSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'score', 'matched', 'gaps', 'requirementMap', 'rewrite', 'questions', 'coaching'],
  properties: {
    title: { type: 'string' },
    score: { type: 'number' },
    matched: {
      type: 'array',
      items: { type: 'string' },
    },
    gaps: {
      type: 'array',
      items: { type: 'string' },
    },
    requirementMap: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['term', 'status', 'evidence', 'nextAction'],
        properties: {
          term: { type: 'string' },
          status: { type: 'string', enum: ['strong', 'missing'] },
          evidence: { type: 'string' },
          nextAction: { type: 'string' },
        },
      },
    },
    rewrite: {
      type: 'object',
      additionalProperties: false,
      required: ['summary', 'bullets', 'note'],
      properties: {
        summary: { type: 'string' },
        bullets: {
          type: 'array',
          items: { type: 'string' },
        },
        note: { type: 'string' },
      },
    },
    questions: {
      type: 'array',
      items: { type: 'string' },
    },
    coaching: {
      type: 'array',
      items: { type: 'string' },
    },
  },
} as const

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function validateAnalysis(value: unknown): RolefitAnalysis {
  if (!value || typeof value !== 'object') throw new Error('Analysis response must be an object.')

  const candidate = value as Partial<RolefitAnalysis>
  if (typeof candidate.title !== 'string') throw new Error('Analysis response is missing title.')
  if (typeof candidate.score !== 'number') throw new Error('Analysis response is missing score.')
  if (!isStringArray(candidate.matched)) throw new Error('Analysis response is missing matched terms.')
  if (!isStringArray(candidate.gaps)) throw new Error('Analysis response is missing gaps.')
  if (!isStringArray(candidate.questions)) throw new Error('Analysis response is missing questions.')
  if (!isStringArray(candidate.coaching)) throw new Error('Analysis response is missing coaching.')
  if (!candidate.rewrite || typeof candidate.rewrite !== 'object') throw new Error('Analysis response is missing rewrite.')
  if (typeof candidate.rewrite.summary !== 'string') throw new Error('Analysis rewrite is missing summary.')
  if (!isStringArray(candidate.rewrite.bullets)) throw new Error('Analysis rewrite is missing bullets.')
  if (typeof candidate.rewrite.note !== 'string') throw new Error('Analysis rewrite is missing note.')
  if (!Array.isArray(candidate.requirementMap)) throw new Error('Analysis response is missing requirement map.')

  const requirementMap = candidate.requirementMap.map((item) => {
    if (!item || typeof item !== 'object') throw new Error('Requirement map item must be an object.')
    const requirement = item as Partial<RolefitRequirementEvidence>
    if (typeof requirement.term !== 'string') throw new Error('Requirement map item is missing term.')
    if (requirement.status !== 'strong' && requirement.status !== 'missing') {
      throw new Error('Requirement map item has an invalid status.')
    }
    if (typeof requirement.evidence !== 'string') throw new Error('Requirement map item is missing evidence.')
    if (typeof requirement.nextAction !== 'string') throw new Error('Requirement map item is missing next action.')
    return {
      evidence: requirement.evidence,
      nextAction: requirement.nextAction,
      status: requirement.status,
      term: requirement.term,
    }
  })

  return {
    coaching: candidate.coaching,
    gaps: candidate.gaps,
    matched: candidate.matched,
    questions: candidate.questions,
    requirementMap,
    rewrite: {
      bullets: candidate.rewrite.bullets,
      note: candidate.rewrite.note,
      summary: candidate.rewrite.summary,
    },
    score: Math.min(100, Math.max(0, candidate.score)),
    title: candidate.title,
  }
}

function extractOutputText(payload: unknown) {
  if (!payload || typeof payload !== 'object') return ''
  const response = payload as { output_text?: unknown; output?: unknown }
  if (typeof response.output_text === 'string') return response.output_text

  if (!Array.isArray(response.output)) return ''

  return response.output
    .flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const content = (item as { content?: unknown }).content
      return Array.isArray(content) ? content : []
    })
    .map((content) => {
      if (!content || typeof content !== 'object') return ''
      const item = content as { text?: unknown; type?: unknown }
      return typeof item.text === 'string' && item.type === 'output_text' ? item.text : ''
    })
    .join('')
}

function extractAnthropicToolInput(payload: unknown) {
  if (!payload || typeof payload !== 'object') return undefined
  const content = (payload as { content?: unknown }).content
  if (!Array.isArray(content)) return undefined

  for (const item of content) {
    if (!item || typeof item !== 'object') continue
    const block = item as { input?: unknown; name?: unknown; type?: unknown }
    if (block.type === 'tool_use' && block.name === 'return_rolefit_analysis') return block.input
  }

  return undefined
}

function extractGeminiText(payload: unknown) {
  if (!payload || typeof payload !== 'object') return ''
  const candidates = (payload as { candidates?: unknown }).candidates
  if (!Array.isArray(candidates)) return ''

  return candidates
    .flatMap((candidate) => {
      if (!candidate || typeof candidate !== 'object') return []
      const content = (candidate as { content?: unknown }).content
      if (!content || typeof content !== 'object') return []
      const parts = (content as { parts?: unknown }).parts
      return Array.isArray(parts) ? parts : []
    })
    .map((part) => {
      if (!part || typeof part !== 'object') return ''
      const text = (part as { text?: unknown }).text
      return typeof text === 'string' ? text : ''
    })
    .join('')
}

function extractApiErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== 'object') return ''

  const topLevelMessage = (payload as { message?: unknown }).message
  if (typeof topLevelMessage === 'string') return topLevelMessage

  const error = (payload as { error?: unknown }).error
  if (typeof error === 'string') return error
  if (!error || typeof error !== 'object') return ''

  const nestedMessage = (error as { message?: unknown }).message
  if (typeof nestedMessage === 'string') return nestedMessage

  const nestedStatus = (error as { status?: unknown }).status
  return typeof nestedStatus === 'string' ? nestedStatus : ''
}

function cleanModel(model: unknown) {
  if (typeof model !== 'string') return 'gpt-5'
  const trimmed = model.trim()
  return trimmed || 'gpt-5'
}

function cleanClaudeModel(model: unknown) {
  if (typeof model !== 'string') return 'claude-sonnet-4-20250514'
  const trimmed = model.trim()
  return trimmed || 'claude-sonnet-4-20250514'
}

function cleanGeminiModel(model: unknown) {
  if (typeof model !== 'string') return 'gemini-2.5-flash'
  const trimmed = model.trim()
  return trimmed || 'gemini-2.5-flash'
}

function cleanPrompt(prompt: unknown) {
  return typeof prompt === 'string' ? prompt.trim() : ''
}

async function runOpenAiAnalysis(requestBody: AnalyseRequest) {
  const apiKey = typeof requestBody.apiKey === 'string' ? requestBody.apiKey.trim() : ''
  if (!apiKey) {
    return { statusCode: 401, payload: { error: 'OpenAI needs a session API key for live analysis.' } }
  }

  const systemPrompt = cleanPrompt(requestBody.systemPrompt)
  const userPrompt = cleanPrompt(requestBody.userPrompt)
  if (!systemPrompt || !userPrompt) {
    return { statusCode: 400, payload: { error: 'Analysis prompts are missing.' } }
  }

  const openAiResponse = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: cleanModel(requestBody.model),
      input: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'rolefit_analysis',
          strict: true,
          schema: rolefitAnalysisSchema,
        },
      },
    }),
  })

  if (!openAiResponse.ok) {
    const statusText =
      openAiResponse.status === 401
        ? 'OpenAI rejected this session API key.'
        : openAiResponse.status === 429
          ? 'OpenAI rate limited this request.'
          : `OpenAI returned HTTP ${openAiResponse.status}.`
    return { statusCode: openAiResponse.status === 401 ? 401 : 502, payload: { error: statusText } }
  }

  const responsePayload = (await openAiResponse.json()) as unknown
  const outputText = extractOutputText(responsePayload)
  if (!outputText) {
    return { statusCode: 502, payload: { error: 'OpenAI returned no structured analysis text.' } }
  }

  try {
    const parsed = JSON.parse(outputText) as unknown
    const analysis = validateAnalysis(parsed)
    return {
      statusCode: 200,
      payload: {
        analysis,
        mode: 'provider-live',
        statusDetail: 'OpenAI returned structured JSON through the local Rolefit proxy. The session key was not saved.',
        statusTitle: 'OpenAI live analysis',
        transportLabel: 'Live OpenAI',
      },
    }
  } catch (error) {
    return {
      statusCode: 502,
      payload: {
        error: error instanceof Error ? error.message : 'OpenAI returned invalid structured analysis.',
      },
    }
  }
}

async function runClaudeAnalysis(requestBody: AnalyseRequest) {
  const apiKey = typeof requestBody.apiKey === 'string' ? requestBody.apiKey.trim() : ''
  if (!apiKey) {
    return { statusCode: 401, payload: { error: 'Claude needs a session API key for live analysis.' } }
  }

  const systemPrompt = cleanPrompt(requestBody.systemPrompt)
  const userPrompt = cleanPrompt(requestBody.userPrompt)
  if (!systemPrompt || !userPrompt) {
    return { statusCode: 400, payload: { error: 'Analysis prompts are missing.' } }
  }

  const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      max_tokens: 4096,
      model: cleanClaudeModel(requestBody.model),
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      tools: [
        {
          name: 'return_rolefit_analysis',
          description: 'Return the Rolefit CV analysis as structured JSON.',
          input_schema: rolefitAnalysisSchema,
        },
      ],
      tool_choice: {
        type: 'tool',
        name: 'return_rolefit_analysis',
      },
    }),
  })

  if (!claudeResponse.ok) {
    const statusText =
      claudeResponse.status === 401
        ? 'Claude rejected this session API key.'
        : claudeResponse.status === 429
          ? 'Claude rate limited this request.'
          : `Claude returned HTTP ${claudeResponse.status}.`
    return { statusCode: claudeResponse.status === 401 ? 401 : 502, payload: { error: statusText } }
  }

  const responsePayload = (await claudeResponse.json()) as unknown
  const toolInput = extractAnthropicToolInput(responsePayload)
  if (!toolInput) {
    return { statusCode: 502, payload: { error: 'Claude returned no structured tool input.' } }
  }

  try {
    const analysis = validateAnalysis(toolInput)
    return {
      statusCode: 200,
      payload: {
        analysis,
        mode: 'provider-live',
        statusDetail: 'Claude returned structured tool input through the local Rolefit proxy. The session key was not saved.',
        statusTitle: 'Claude live analysis',
        transportLabel: 'Live Claude',
      },
    }
  } catch (error) {
    return {
      statusCode: 502,
      payload: {
        error: error instanceof Error ? error.message : 'Claude returned invalid structured analysis.',
      },
    }
  }
}

async function runGeminiAnalysis(requestBody: AnalyseRequest) {
  const apiKey = typeof requestBody.apiKey === 'string' ? requestBody.apiKey.trim() : ''
  if (!apiKey) {
    return { statusCode: 401, payload: { error: 'Gemini needs a session API key for live analysis.' } }
  }

  const systemPrompt = cleanPrompt(requestBody.systemPrompt)
  const userPrompt = cleanPrompt(requestBody.userPrompt)
  if (!systemPrompt || !userPrompt) {
    return { statusCode: 400, payload: { error: 'Analysis prompts are missing.' } }
  }

  const model = encodeURIComponent(cleanGeminiModel(requestBody.model))
  const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: userPrompt }],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseJsonSchema: rolefitAnalysisSchema,
      },
    }),
  })

  if (!geminiResponse.ok) {
    const errorPayload = (await geminiResponse.json().catch(() => undefined)) as unknown
    const apiErrorMessage = extractApiErrorMessage(errorPayload)
    const rejectedKey =
      (geminiResponse.status === 400 || geminiResponse.status === 401 || geminiResponse.status === 403) &&
      /api[_\s-]?key|invalid.*key/i.test(apiErrorMessage)
    const statusText =
      rejectedKey
        ? 'Gemini rejected this session API key.'
        : geminiResponse.status === 429
          ? 'Gemini rate limited this request.'
          : `Gemini returned HTTP ${geminiResponse.status}.`
    return { statusCode: rejectedKey ? 401 : 502, payload: { error: statusText } }
  }

  const responsePayload = (await geminiResponse.json()) as unknown
  const outputText = extractGeminiText(responsePayload)
  if (!outputText) {
    return { statusCode: 502, payload: { error: 'Gemini returned no structured analysis text.' } }
  }

  try {
    const parsed = JSON.parse(outputText) as unknown
    const analysis = validateAnalysis(parsed)
    return {
      statusCode: 200,
      payload: {
        analysis,
        mode: 'provider-live',
        statusDetail: 'Gemini returned structured JSON through the local Rolefit proxy. The session key was not saved.',
        statusTitle: 'Gemini live analysis',
        transportLabel: 'Live Gemini',
      },
    }
  } catch (error) {
    return {
      statusCode: 502,
      payload: {
        error: error instanceof Error ? error.message : 'Gemini returned invalid structured analysis.',
      },
    }
  }
}

export async function handleRolefitApi(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== 'POST') {
    sendJson(response, 405, { error: 'Use POST for this endpoint.' })
    return
  }

  try {
    const parsedBody = (await readJsonBody(request)) as AnalyseRequest

    if (parsedBody.provider === 'openai') {
      const result = await runOpenAiAnalysis(parsedBody)
      sendJson(response, result.statusCode, result.payload)
      return
    }

    if (parsedBody.provider === 'claude') {
      const result = await runClaudeAnalysis(parsedBody)
      sendJson(response, result.statusCode, result.payload)
      return
    }

    if (parsedBody.provider === 'gemini') {
      const result = await runGeminiAnalysis(parsedBody)
      sendJson(response, result.statusCode, result.payload)
      return
    }

    sendJson(response, 400, { error: 'Choose a live AI provider for this endpoint.' })
  } catch (error) {
    sendJson(response, 400, {
      error: error instanceof Error ? error.message : 'Rolefit analysis request failed.',
    })
  }
}
