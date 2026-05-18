export type ProviderId = 'mock' | 'openai' | 'claude' | 'gemini'

export type RolefitRequirementEvidence = {
  evidence: string
  nextAction: string
  status: 'strong' | 'missing'
  term: string
}

export type RolefitAnalysisSnapshot = {
  coaching: readonly string[]
  gaps: readonly string[]
  matched: readonly string[]
  questions: readonly string[]
  requirementMap: readonly RolefitRequirementEvidence[]
  rewrite: {
    bullets: readonly string[]
    note: string
    summary: string
  }
  score: number
  title: string
}

export type RolefitPromptContract = {
  objective: string
  outputFields: Array<{
    field: string
    purpose: string
    required: boolean
  }>
  qualityRules: string[]
  responseShape: Record<string, unknown>
  systemPrompt: string
  userPrompt: string
  version: 'rolefit.analysis.v1'
}

export type ProviderRunMode = 'local-mock' | 'provider-needs-key' | 'provider-contract'

export type ProviderRunResult<TAnalysis extends RolefitAnalysisSnapshot = RolefitAnalysisSnapshot> = {
  analysis: TAnalysis
  contract: RolefitPromptContract
  generatedAt: string
  keyState: 'not-required' | 'missing' | 'present'
  mode: ProviderRunMode
  model: string
  providerId: ProviderId
  providerLabel: string
  statusDetail: string
  statusTitle: string
  transportLabel: string
}

type ProviderRunRequest<TAnalysis extends RolefitAnalysisSnapshot> = {
  analysis: TAnalysis
  apiKey: string
  cvText: string
  jobText: string
  model: string
  provider: ProviderId
}

const providerLabels: Record<ProviderId, string> = {
  claude: 'Claude',
  gemini: 'Gemini',
  mock: 'Local mock',
  openai: 'OpenAI',
}

const responseShape = {
  title: 'string',
  score: 'number from 0 to 100',
  matched: ['role requirement proven by the CV'],
  gaps: ['role requirement not proven by the CV'],
  requirementMap: [
    {
      evidence: 'direct CV proof when available',
      nextAction: 'truthful action to strengthen or handle this requirement',
      status: 'strong | missing',
      term: 'role requirement',
    },
  ],
  rewrite: {
    bullets: ['interview-safe rewrite bullet based only on proof'],
    note: 'honest gap or positioning note',
    summary: 'targeting direction for this job',
  },
  questions: ['role-specific interview question'],
  coaching: ['plain-language coaching instruction'],
}

const outputFields = [
  { field: 'title', purpose: 'Identify the target role being analysed.', required: true },
  { field: 'score', purpose: 'Give a rough fit signal without pretending to be exact.', required: true },
  { field: 'matched', purpose: 'List requirements already supported by CV proof.', required: true },
  { field: 'gaps', purpose: 'List requirements that should not be exaggerated.', required: true },
  { field: 'requirementMap', purpose: 'Map every role requirement to proof or a next action.', required: true },
  { field: 'rewrite', purpose: 'Draft CV direction and bullets grounded in evidence.', required: true },
  { field: 'questions', purpose: 'Generate interview questions from the CV and role.', required: true },
  { field: 'coaching', purpose: 'Help the candidate speak calmly and honestly.', required: true },
]

const qualityRules = [
  'Never invent achievements, employers, numbers, tools, qualifications, or responsibilities.',
  'Prefer specific evidence from the CV over generic confidence language.',
  'Treat missing role requirements as gaps to handle honestly, not claims to fabricate.',
  'Every rewrite bullet must be something the candidate could explain in an interview.',
  'Use plain language suitable for someone applying under pressure.',
]

export function buildRolefitPromptContract(cvText: string, jobText: string): RolefitPromptContract {
  return {
    objective:
      'Analyse one CV against one job advert, then return structured evidence, gaps, rewrite guidance, coaching, and interview practice material.',
    outputFields,
    qualityRules,
    responseShape,
    systemPrompt:
      'You are Rolefit CV. Your job is to help candidates target a CV honestly for a specific role and prepare to speak confidently about only what they can prove.',
    userPrompt: [
      'Return only JSON matching the Rolefit contract.',
      '',
      'CV:',
      cvText.trim(),
      '',
      'Job advert:',
      jobText.trim(),
    ].join('\n'),
    version: 'rolefit.analysis.v1',
  }
}

export async function runRolefitProvider<TAnalysis extends RolefitAnalysisSnapshot>({
  analysis,
  apiKey,
  cvText,
  jobText,
  model,
  provider,
}: ProviderRunRequest<TAnalysis>): Promise<ProviderRunResult<TAnalysis>> {
  const contract = buildRolefitPromptContract(cvText, jobText)
  const providerLabel = providerLabels[provider]

  if (provider === 'mock') {
    return {
      analysis,
      contract,
      generatedAt: new Date().toISOString(),
      keyState: 'not-required',
      mode: 'local-mock',
      model,
      providerId: provider,
      providerLabel,
      statusDetail: 'Generated locally from the same structured contract the live adapters will use. No request was sent.',
      statusTitle: 'Local mock adapter',
      transportLabel: 'Mock analysis',
    }
  }

  const hasSessionKey = apiKey.trim().length > 0

  return {
    analysis,
    contract,
    generatedAt: new Date().toISOString(),
    keyState: hasSessionKey ? 'present' : 'missing',
    mode: hasSessionKey ? 'provider-contract' : 'provider-needs-key',
    model,
    providerId: provider,
    providerLabel,
    statusDetail: hasSessionKey
      ? `${providerLabel} is selected and a session key is present. This demo keeps network transport offline until a backend proxy is added, so the local engine is validating the provider prompt contract.`
      : `${providerLabel} is selected, but no session key is present. This run uses the local engine while preparing the exact provider prompt contract.`,
    statusTitle: `${providerLabel} adapter contract`,
    transportLabel: hasSessionKey ? 'Contract ready' : 'Needs session key',
  }
}
