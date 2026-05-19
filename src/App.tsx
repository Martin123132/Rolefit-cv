import { useEffect, useMemo, useState, type ChangeEvent, type DragEvent } from 'react'
import {
  ArrowRight,
  Brain,
  BriefcaseBusiness,
  Check,
  Clipboard,
  Compass,
  Download,
  FileText,
  KeyRound,
  Lock,
  Mic,
  Plus,
  RefreshCw,
  SearchCheck,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRoundCheck,
  type LucideIcon,
} from 'lucide-react'
import {
  liveProviderInputLimitLabel,
  liveProviderTimeoutLabel,
  runRolefitProvider,
  type ProviderId,
  type ProviderRunResult,
} from './ai/rolefitProvider'
import { qualityGateForAnalysis, type QualityGateResult } from './analysis/qualityGate'
import {
  extractImportedDocumentText,
  importAccept,
  importSizeLimitFor,
  importSizeLimitMessage,
  isSupportedImportFile,
  supportedImportMessage,
} from './importers/documentText'
import {
  buildScoutMatches,
  parseScoutJobAdverts,
  type ScoutJob,
  type ScoutMatchStatus,
  type ScoutProfile,
  type ScoutWorkPreference,
} from './scout/scoutEngine'
import './App.css'

type WorkMode = 'rolefit' | 'scout'
type TabId = 'tailor' | 'coach' | 'interview' | 'pack'
type StepId = 'import' | 'analyse' | 'rewrite' | 'coach' | 'interview' | 'pack'
type StepStatus = 'done' | 'next' | 'blocked'
type EvidenceReviewChoice = 'true' | 'needs-proof' | 'do-not-claim'
type ImportTarget = 'cv' | 'job'
type ImportStatus = {
  message: string
  state: 'idle' | 'done' | 'warning' | 'error'
}
type RewriteDraft = {
  bullets: string[]
  note: string
  summary: string
}
type RewriteFieldTarget =
  | { field: 'bullet'; index: number }
  | { field: 'note' }
  | { field: 'summary' }
type ClaimTermSafety = {
  detail: string
  evidence: string
  label: string
  status: StepStatus
  term: string
}
type ClaimSafety = {
  detail: string
  label: string
  suggestion: string
  status: StepStatus
  terms: ClaimTermSafety[]
}
type RewriteSafetyItem = {
  id: string
  label: string
  safety: ClaimSafety
  target: RewriteFieldTarget
  text: string
}
type StarDraft = {
  action: string
  result: string
  situation: string
  task: string
}
type InterviewQuestion = {
  category: string
  focus: string
  id: string
  prompt: string
  proof: string
  risk: string
  status: StepStatus
}
type AnswerFeedbackItem = {
  detail: string
  id: string
  label: string
  status: StepStatus
}

type SavedDraft = {
  confidence: number
  cvText: string
  interviewStar: StarDraft
  jobText: string
  model: string
  practiceAnswer: string
  provider: ProviderId
  scoutDescription: string
  scoutJobs: ScoutJob[]
  scoutLocation: string
  scoutPreferredRoles: string
  scoutQualifications: string
  scoutRefusedRoles: string
  scoutSalaryFloor: string
  scoutTravelRadius: string
  scoutWorkPreference: ScoutWorkPreference
  selectedQuestion: number
  workMode: WorkMode
}

type EvidenceItem = {
  term: string
  line: string
}

type RequirementEvidence = {
  term: string
  status: 'strong' | 'missing'
  evidence: string
  nextAction: string
}

type Analysis = {
  title: string
  score: number
  matched: string[]
  gaps: string[]
  evidence: EvidenceItem[]
  requirementMap: RequirementEvidence[]
  rewrite: {
    summary: string
    bullets: string[]
    note: string
  }
  questions: string[]
  coaching: string[]
}

type ComparisonCandidate = {
  actionDetail: string
  id: 'local' | 'selected'
  qualityGate: QualityGateResult
  recommendation: 'recommended' | 'available' | 'locked'
  run: ProviderRunResult<Analysis>
}

const providers: Array<{ id: ProviderId; label: string; note: string }> = [
  { id: 'mock', label: 'Local mock', note: 'No request sent' },
  { id: 'openai', label: 'OpenAI', note: 'Bring your key' },
  { id: 'claude', label: 'Claude', note: 'Bring your key' },
  { id: 'gemini', label: 'Gemini', note: 'Bring your key' },
]

const draftStorageKey = 'rolefit-cv-draft-v1'

const importTargetLabels: Record<ImportTarget, string> = {
  cv: 'CV',
  job: 'job advert',
}

const emptyImportStatus: ImportStatus = {
  message: '',
  state: 'idle',
}

const emptyStarDraft: StarDraft = {
  action: '',
  result: '',
  situation: '',
  task: '',
}

const modelOptions: Record<ProviderId, string[]> = {
  mock: ['Rolefit demo model', 'Fast local draft'],
  openai: ['gpt-5.2', 'gpt-5', 'gpt-4o-mini'],
  claude: ['claude-sonnet-4-5', 'claude-opus-4-1-20250805', 'claude-sonnet-4-20250514'],
  gemini: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3-pro-preview'],
}

const customModelOption = '__rolefit-custom-model__'

const evidenceReviewOptions = [
  {
    id: 'true',
    label: 'True',
    status: 'done',
    detail: 'Safe to use as a claim.',
  },
  {
    id: 'needs-proof',
    label: 'Needs proof',
    status: 'next',
    detail: 'Keep it as a gap until proof is added.',
  },
  {
    id: 'do-not-claim',
    label: 'Do not claim',
    status: 'blocked',
    detail: 'Leave it out of the CV for this application.',
  },
] satisfies Array<{ id: EvidenceReviewChoice; label: string; status: StepStatus; detail: string }>

const evidenceReviewLabels = Object.fromEntries(
  evidenceReviewOptions.map((option) => [option.id, option.label]),
) as Record<EvidenceReviewChoice, string>

const evidenceReviewDetails = Object.fromEntries(
  evidenceReviewOptions.map((option) => [option.id, option.detail]),
) as Record<EvidenceReviewChoice, string>

const evidenceReviewStatuses = Object.fromEntries(
  evidenceReviewOptions.map((option) => [option.id, option.status]),
) as Record<EvidenceReviewChoice, StepStatus>

const evidenceReviewPriority: Record<StepStatus, number> = {
  done: 0,
  next: 1,
  blocked: 2,
}

const skillTerms = [
  'account management',
  'automation',
  'communication',
  'crm',
  'customer service',
  'data',
  'documentation',
  'leadership',
  'operations',
  'project management',
  'reporting',
  'risk',
  'stakeholder',
  'support',
  'training',
  'writing',
] as const

type SkillTerm = (typeof skillTerms)[number]

const termAliases: Partial<Record<SkillTerm, string[]>> = {
  'account management': ['account health', 'client accounts', 'clients after onboarding'],
  communication: ['call handling', 'calm escalation', 'explained', 'language'],
  'customer service': ['customer support', 'customer problems', 'customers', 'service'],
  documentation: ['process notes', 'notes', 'documented'],
  stakeholder: ['warehouse', 'finance', 'sales teams', 'managers', 'cross-functional'],
  support: ['helping', 'supported', 'supporting'],
  training: ['trained', 'new starters', 'onboarding'],
}

const seedCv = `Customer support and operations assistant with four years of experience helping busy teams solve customer problems quickly.

Built weekly reporting packs in Excel and Sheets so managers could see complaint patterns, refund risk, and response times.

Trained three new starters on call handling, CRM notes, refund policy, and calm escalation language.

Worked with warehouse, sales, and finance teams to fix delayed orders and explain next steps to customers.

Created short process notes that reduced repeated questions and helped the team keep service consistent during peak weeks.`

const seedJob = `Customer Success Associate

We are hiring a customer success associate to support clients after onboarding, manage account health, and spot churn risk early.

The role needs confident communication, CRM discipline, stakeholder updates, reporting, customer service, documentation, and calm problem solving.

Bonus points for experience with automation, training teammates, and turning messy customer feedback into practical improvements.`

const workflowSteps = [
  { id: 'import', title: 'Import proof', description: 'CV and job advert', icon: FileText },
  { id: 'analyse', title: 'Map the role', description: 'Fit gaps and evidence', icon: SearchCheck },
  { id: 'rewrite', title: 'Rewrite honestly', description: 'Targeted CV draft', icon: Sparkles },
  { id: 'coach', title: 'Coach the story', description: 'Confidence and clarity', icon: UserRoundCheck },
  { id: 'interview', title: 'Rehearse interview', description: 'Questions from the CV', icon: Mic },
  { id: 'pack', title: 'Prepare pack', description: 'Apply and interview notes', icon: Clipboard },
] satisfies Array<{ id: StepId; title: string; description: string; icon: LucideIcon }>

const tabs: Array<{ id: TabId; label: string; icon: LucideIcon }> = [
  { id: 'tailor', label: 'Tailor CV', icon: Sparkles },
  { id: 'coach', label: 'Coach', icon: Brain },
  { id: 'interview', label: 'Mock interview', icon: Mic },
  { id: 'pack', label: 'Application pack', icon: Clipboard },
]

const statusLabels: Record<StepStatus, string> = {
  done: 'Done',
  next: 'Do next',
  blocked: 'Locked',
}

const scoutWorkPreferenceOptions: Array<{ id: ScoutWorkPreference; label: string }> = [
  { id: 'any', label: 'Any' },
  { id: 'remote', label: 'Remote' },
  { id: 'hybrid', label: 'Hybrid' },
  { id: 'on-site', label: 'On-site' },
]

function normalise(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
}

function textContains(text: string, candidate: string) {
  const safeCandidate = normalise(candidate).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${safeCandidate}\\b`).test(normalise(text))
}

function termCandidates(term: SkillTerm) {
  return [term, ...(termAliases[term] ?? [])]
}

function termMatches(text: string, term: SkillTerm) {
  return termCandidates(term).some((candidate) => textContains(text, candidate))
}

function extractTerms(text: string) {
  return skillTerms.filter((term) => termMatches(text, term))
}

function sentenceForTerm(text: string, term: SkillTerm) {
  const sentences = text
    .split(/\n|(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter(Boolean)
  const candidates = termCandidates(term).slice().sort(
    (left, right) => normalise(right).length - normalise(left).length,
  )

  for (const candidate of candidates) {
    const match = sentences.find((line) => textContains(line, candidate))
    if (match) return match
  }

  return `Add a truthful example that proves ${term}.`
}

function phraseList(items: readonly string[]) {
  if (items.length === 0) return 'the role requirements'
  if (items.length === 1) return items[0]
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
}

function roleTitle(job: string) {
  const title = job
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean)
  return title && title.length <= 64 ? title : 'this role'
}

function isProviderId(value: unknown): value is ProviderId {
  return providers.some((provider) => provider.id === value)
}

function isWorkMode(value: unknown): value is WorkMode {
  return value === 'rolefit' || value === 'scout'
}

function isScoutWorkPreference(value: unknown): value is ScoutWorkPreference {
  return scoutWorkPreferenceOptions.some((option) => option.id === value)
}

function readSavedScoutJobs(value: unknown): ScoutJob[] {
  if (!Array.isArray(value)) return []

  return value
    .map((item): ScoutJob | null => {
      if (!item || typeof item !== 'object') return null

      const candidate = item as Partial<ScoutJob>
      const text = typeof candidate.text === 'string' ? candidate.text.trim() : ''
      const title = typeof candidate.title === 'string' && candidate.title.trim() ? candidate.title.trim() : 'Saved job advert'
      const id = typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id.trim() : `saved-${title}-${text.length}`

      return text ? { id, text, title } : null
    })
    .filter((item): item is ScoutJob => Boolean(item))
}

function evidenceReviewKeyFor(
  analysisKey: string,
  requirementMap: RequirementEvidence[],
  evidenceChoices: Record<string, EvidenceReviewChoice>,
) {
  return [
    analysisKey,
    '---rolefit-evidence-review---',
    ...requirementMap.map((item) => `${item.term}:${evidenceChoices[item.term] ?? 'unreviewed'}`),
  ].join('\n')
}

function readSavedStarDraft(value: unknown): StarDraft | undefined {
  if (!value || typeof value !== 'object') return undefined

  const candidate = value as Partial<StarDraft>
  return {
    action: typeof candidate.action === 'string' ? candidate.action : '',
    result: typeof candidate.result === 'string' ? candidate.result : '',
    situation: typeof candidate.situation === 'string' ? candidate.situation : '',
    task: typeof candidate.task === 'string' ? candidate.task : '',
  }
}

function loadSavedDraft(): Partial<SavedDraft> {
  if (typeof window === 'undefined') return {}

  try {
    const saved = window.localStorage.getItem(draftStorageKey)
    if (!saved) return {}

    const parsed = JSON.parse(saved) as Partial<SavedDraft>
    const provider = isProviderId(parsed.provider) ? parsed.provider : undefined
    const model = typeof parsed.model === 'string' && parsed.model.trim() ? parsed.model.trim() : undefined

    return {
      confidence: typeof parsed.confidence === 'number' ? Math.min(100, Math.max(0, parsed.confidence)) : undefined,
      cvText: typeof parsed.cvText === 'string' ? parsed.cvText : undefined,
      interviewStar: readSavedStarDraft(parsed.interviewStar),
      jobText: typeof parsed.jobText === 'string' ? parsed.jobText : undefined,
      model,
      practiceAnswer: typeof parsed.practiceAnswer === 'string' ? parsed.practiceAnswer : undefined,
      provider,
      scoutDescription: typeof parsed.scoutDescription === 'string' ? parsed.scoutDescription : undefined,
      scoutJobs: readSavedScoutJobs(parsed.scoutJobs),
      scoutLocation: typeof parsed.scoutLocation === 'string' ? parsed.scoutLocation : undefined,
      scoutPreferredRoles: typeof parsed.scoutPreferredRoles === 'string' ? parsed.scoutPreferredRoles : undefined,
      scoutQualifications: typeof parsed.scoutQualifications === 'string' ? parsed.scoutQualifications : undefined,
      scoutRefusedRoles: typeof parsed.scoutRefusedRoles === 'string' ? parsed.scoutRefusedRoles : undefined,
      scoutSalaryFloor: typeof parsed.scoutSalaryFloor === 'string' ? parsed.scoutSalaryFloor : undefined,
      scoutTravelRadius: typeof parsed.scoutTravelRadius === 'string' ? parsed.scoutTravelRadius : undefined,
      scoutWorkPreference: isScoutWorkPreference(parsed.scoutWorkPreference) ? parsed.scoutWorkPreference : undefined,
      selectedQuestion: typeof parsed.selectedQuestion === 'number' ? Math.max(0, parsed.selectedQuestion) : undefined,
      workMode: isWorkMode(parsed.workMode) ? parsed.workMode : undefined,
    }
  } catch {
    return {}
  }
}

function buildAnalysis(cv: string, job: string): Analysis {
  const jobTerms = extractTerms(job)
  const cvTerms = extractTerms(cv)
  const matched = jobTerms.filter((term) => cvTerms.includes(term))
  const gaps = jobTerms.filter((term) => !cvTerms.includes(term))
  const evidence = matched.slice(0, 6).map((term) => ({
    term,
    line: sentenceForTerm(cv, term),
  }))
  const requirementMap = jobTerms.map((term) => {
    const hasEvidence = matched.includes(term)

    return {
      term,
      status: hasEvidence ? 'strong' : 'missing',
      evidence: hasEvidence ? sentenceForTerm(cv, term) : '',
      nextAction: hasEvidence
        ? `Use this proof when rewriting ${term}, and keep the example ready for interview.`
        : `Add a truthful example for ${term}, connect nearby experience, or leave it out for now.`,
    } satisfies RequirementEvidence
  })
  const score =
    jobTerms.length === 0
      ? 40
      : Math.min(96, Math.max(32, Math.round((matched.length / jobTerms.length) * 84) + 10))
  const title = roleTitle(job)

  return {
    title,
    score,
    matched,
    gaps,
    evidence,
    requirementMap,
    rewrite: {
      summary:
        matched.length > 0
          ? `Position this CV for ${title} around proven ${phraseList(matched.slice(0, 4))}. Lead with evidence, not adjectives.`
          : `Start by extracting proof from the CV, then connect it directly to ${title}. Do not write broad claims until each one has an example.`,
      bullets:
        evidence.length > 0
          ? evidence.map(
              (item) =>
                `Rewrite from evidence: ${item.line} Tie it directly to ${item.term} and add a result if the user can prove one.`,
            )
          : [
              'Add one truthful achievement that proves the strongest requirement in the job advert.',
              'Replace generic duties with a result, a constraint, and who benefited from the work.',
              'Keep every claim interview-safe: if the user cannot explain it out loud, it should not be on the CV.',
            ],
      note:
        gaps.length > 0
          ? `Bridge ${phraseList(gaps.slice(0, 3))} with adjacent evidence, or leave it out until there is proof.`
          : 'The CV already mirrors the main role language. Tighten it by moving the strongest evidence into the first half page.',
    },
    questions: [
      matched[0]
        ? `Tell me about a time you used ${matched[0]} to improve an outcome.`
        : 'Walk me through the strongest achievement on your CV.',
      gaps[0]
        ? `The role asks for ${gaps[0]}. What honest adjacent experience can you connect to that?`
        : `Why does your experience make sense for ${title}, not just any job?`,
      `Which CV bullet would you most want the interviewer to ask about, and why?`,
    ],
    coaching: [
      'Open with the problem you were trusted to solve, not your job title.',
      'Use one concrete example before you claim a strength.',
      gaps.length > 0
        ? `Do not bluff ${phraseList(gaps.slice(0, 2))}. Explain what you have done nearby and how you would close the gap.`
        : 'Your strongest terms are present; now make the result and scale clearer.',
      'Practise the first 20 seconds until it sounds calm rather than memorised.',
    ],
  }
}

function interviewQuestionId(prompt: string, index: number) {
  const slug = normalise(prompt).trim().replace(/\s+/g, '-').slice(0, 52)
  return slug || `question-${index + 1}`
}

function interviewQuestionsForAnalysis(analysis: Analysis): InterviewQuestion[] {
  const questions: InterviewQuestion[] = []
  const primaryEvidence = analysis.evidence[0]
  const primaryGap = analysis.gaps[0]

  function pushQuestion(question: Omit<InterviewQuestion, 'id'>) {
    const id = interviewQuestionId(question.prompt, questions.length)
    if (questions.some((item) => item.id === id || item.prompt === question.prompt)) return
    questions.push({ ...question, id })
  }

  analysis.questions.forEach((prompt, index) => {
    const isGapQuestion = index === 1 && primaryGap
    pushQuestion({
      category: isGapQuestion ? 'Handle a gap' : index === 2 ? 'CV ownership' : 'Prove experience',
      focus: isGapQuestion ? primaryGap : primaryEvidence?.term ?? analysis.matched[0] ?? analysis.title,
      prompt,
      proof: isGapQuestion
        ? `Use nearby proof, then name how you would close ${primaryGap}.`
        : primaryEvidence?.line ?? 'Choose one clear CV example before answering.',
      risk: isGapQuestion
        ? 'Do not pretend the gap is already solved.'
        : 'Do not speak in broad strengths without a specific example.',
      status: isGapQuestion ? 'next' : primaryEvidence ? 'done' : 'next',
    })
  })

  analysis.evidence.slice(0, 3).forEach((item) => {
    pushQuestion({
      category: 'Proof pressure',
      focus: item.term,
      prompt: `Your CV says: "${item.line}" What happened, what did you personally do, and what changed?`,
      proof: item.line,
      risk: 'Do not recite the CV line. Explain the decision, action, and result behind it.',
      status: 'done',
    })
  })

  analysis.gaps.slice(0, 2).forEach((term) => {
    pushQuestion({
      category: 'Handle a gap',
      focus: term,
      prompt: `This role asks for ${term}. What honest adjacent experience can you offer without overstating it?`,
      proof: `Connect a nearby example, then state what you would learn or do next for ${term}.`,
      risk: 'A confident answer can still admit a gap. Bluffing is the bigger risk.',
      status: 'next',
    })
  })

  pushQuestion({
    category: 'Role motivation',
    focus: analysis.title,
    prompt: `Why does your experience make sense for ${analysis.title}, not just any job?`,
    proof:
      analysis.evidence.length > 0
        ? `Anchor the answer in ${phraseList(analysis.evidence.slice(0, 3).map((item) => item.term))}.`
        : 'Anchor the answer in one CV example and one job requirement.',
    risk: 'Avoid a generic motivation answer that could be said to any employer.',
    status: analysis.evidence.length > 0 ? 'done' : 'next',
  })

  return questions.slice(0, 7)
}

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function starDraftHasContent(starDraft: StarDraft) {
  return Object.values(starDraft).some((value) => value.trim().length > 0)
}

function starDraftReady(starDraft: StarDraft) {
  return Object.values(starDraft).every((value) => value.trim().length >= 12)
}

function starAnswerFromDraft(starDraft: StarDraft, question: InterviewQuestion) {
  const sections = [
    ['Situation', starDraft.situation],
    ['Task', starDraft.task],
    ['Action', starDraft.action],
    ['Result', starDraft.result],
  ]
    .filter(([, value]) => value.trim())
    .map(([label, value]) => `${label}: ${value.trim()}`)

  if (sections.length === 0) {
    return `Question: ${question.prompt}\n\nSituation:\nTask:\nAction:\nResult:`
  }

  return [`Question: ${question.prompt}`, '', ...sections].join('\n')
}

function starDraftForQuestion(analysis: Analysis, question: InterviewQuestion): StarDraft {
  const proofLine = question.proof && !question.proof.startsWith('Use ') ? question.proof : analysis.evidence[0]?.line
  const roleTerms = analysis.matched.length > 0 ? phraseList(analysis.matched.slice(0, 3)) : question.focus
  const resultLine = analysis.evidence.find((item) =>
    /\b(reduced|improved|created|trained|built|saved|increased|decreased|resolved|delivered|response|risk|consistent)\b/i.test(
      item.line,
    ),
  )?.line

  return {
    action:
      question.status === 'next'
        ? `I would connect nearby experience to ${question.focus}, explain the work I have already done, and be clear about how I would close the gap.`
        : `I would explain the actions I personally took, the people involved, and how the example proves ${question.focus} for this role.`,
    result: resultLine
      ? `The result was visible in this CV proof: ${resultLine}`
      : 'I would state the result I can prove, then keep it honest if the CV does not show a number.',
    situation: proofLine
      ? `In the CV example, ${proofLine}`
      : `In a real situation where ${question.focus} mattered, I would start with the problem and who it affected.`,
    task: `The task was to show ${roleTerms} in a way that fits ${analysis.title} without sounding generic.`,
  }
}

function answerFeedbackFor(
  answer: string,
  analysis: Analysis,
  confidence: number,
  starDraft: StarDraft,
): AnswerFeedbackItem[] {
  const cleanAnswer = answer.trim()
  const answerWords = wordCount(cleanAnswer)
  const termHits = analysis.requirementMap.filter((item) => textContains(cleanAnswer, item.term)).length
  const evidenceHits = analysis.evidence.filter(
    (item) => textContains(cleanAnswer, item.term) || textContains(cleanAnswer, item.line.split(/\s+/).slice(0, 5).join(' ')),
  ).length
  const hasResultLanguage = /\b(\d+%?|\d+\+?|reduced|improved|created|trained|built|saved|increased|decreased|resolved|delivered|won|cut|grew)\b/i.test(
    cleanAnswer,
  )
  const gapMentioned = analysis.gaps.some((term) => textContains(cleanAnswer, term))
  const hasGapPlan = /\b(learn|learning|close|develop|bridge|adjacent|nearby|honest|not yet|would)\b/i.test(cleanAnswer)

  return [
    {
      detail: starDraftReady(starDraft)
        ? 'The STAR builder has enough material for a complete answer.'
        : answerWords >= 45
          ? 'The answer has shape, but the STAR boxes would make it easier to practise.'
          : 'Add a situation, task, action, and result before marking practice done.',
      id: 'star',
      label: 'STAR structure',
      status: starDraftReady(starDraft) ? 'done' : answerWords >= 45 ? 'next' : 'blocked',
    },
    {
      detail:
        evidenceHits > 0
          ? 'The answer is tied to direct CV proof.'
          : termHits > 0
            ? 'The answer names role language, but needs a clearer proof line.'
            : 'Use one mapped CV proof line before claiming the strength.',
      id: 'evidence',
      label: 'CV evidence',
      status: evidenceHits > 0 ? 'done' : termHits > 0 ? 'next' : 'blocked',
    },
    {
      detail:
        termHits >= 2
          ? 'The answer clearly speaks to this job advert.'
          : termHits === 1
            ? 'One role requirement is present. Add one more job-specific link.'
            : 'Name the role requirement this answer is proving.',
      id: 'role',
      label: 'Role relevance',
      status: termHits >= 2 ? 'done' : termHits === 1 ? 'next' : 'blocked',
    },
    {
      detail: hasResultLanguage
        ? 'There is a result or outcome signal.'
        : 'Add what changed: time saved, risk reduced, customer impact, quality, or team benefit.',
      id: 'result',
      label: 'Result signal',
      status: hasResultLanguage ? 'done' : 'next',
    },
    {
      detail:
        analysis.gaps.length === 0
          ? 'No major mapped gaps need handling in this answer.'
          : gapMentioned && hasGapPlan
            ? 'The gap is handled calmly without pretending.'
            : 'If asked about a gap, connect adjacent evidence and say how you would close it.',
      id: 'gap',
      label: 'Gap honesty',
      status: analysis.gaps.length === 0 || (gapMentioned && hasGapPlan) ? 'done' : 'next',
    },
    {
      detail:
        confidence >= 70
          ? 'Confidence is high enough for a calm delivery pass.'
          : confidence >= 45
            ? 'Confidence is usable, but rehearse the first 20 seconds.'
            : 'Raise confidence by shortening the answer and anchoring it in proof.',
      id: 'confidence',
      label: 'Confidence',
      status: confidence >= 70 ? 'done' : confidence >= 45 ? 'next' : 'blocked',
    },
  ]
}

function scoreAnswer(answer: string, analysis: Analysis, confidence: number, starDraft: StarDraft) {
  if (!answer.trim()) return 0
  const feedbackScore = answerFeedbackFor(answer, analysis, confidence, starDraft).reduce((total, item) => {
    if (item.status === 'done') return total + 16
    if (item.status === 'next') return total + 8
    return total
  }, 0)
  const answerTerms = extractTerms(answer)
  const termHits = analysis.matched.filter(
    (term) => answerTerms.includes(term as SkillTerm) || textContains(answer, term),
  ).length
  const lengthScore = Math.min(12, Math.floor(answer.trim().length / 42))
  const evidenceScore = Math.min(12, termHits * 4)
  return Math.min(100, feedbackScore + lengthScore + evidenceScore)
}

function rewriteFromAnalysis(analysis: Analysis): RewriteDraft {
  return {
    bullets: [...analysis.rewrite.bullets],
    note: analysis.rewrite.note,
    summary: analysis.rewrite.summary,
  }
}

function claimTermSafety(
  item: RequirementEvidence,
  evidenceChoices: Record<string, EvidenceReviewChoice>,
): ClaimTermSafety {
  const choice = evidenceChoices[item.term] ?? 'needs-proof'
  const status = evidenceReviewStatuses[choice]

  if (choice === 'true') {
    return {
      detail: item.evidence ? 'Use this exact proof line.' : 'Marked true, but the CV still needs a clear source line.',
      evidence: item.evidence,
      label: 'Backed',
      status,
      term: item.term,
    }
  }

  if (choice === 'do-not-claim') {
    return {
      detail: 'Remove this claim from the rewrite, or soften it until proof exists.',
      evidence: item.nextAction,
      label: 'Do not claim',
      status,
      term: item.term,
    }
  }

  return {
    detail: 'Keep this as a gap until the CV has a truthful example.',
    evidence: item.nextAction,
    label: 'Needs proof',
    status,
    term: item.term,
  }
}

function claimSafetySuggestion(terms: ClaimTermSafety[]) {
  const blockedTerms = terms.filter((item) => item.status === 'blocked')
  const warningTerms = terms.filter((item) => item.status === 'next')
  const backedTerms = terms.filter((item) => item.status === 'done')

  if (blockedTerms.length > 0) {
    return backedTerms.length > 0
      ? `Keep the line focused on ${phraseList(backedTerms.map((item) => item.term))}. Leave the red requirement out.`
      : 'Remove the red requirement and keep the line focused on proof already in the CV.'
  }

  if (warningTerms.length > 0) {
    return `Add a truthful example for ${phraseList(warningTerms.map((item) => item.term))}, or present it as a gap instead of a claim.`
  }

  if (backedTerms.length > 0) {
    return `This is safe to keep. Be ready to explain the proof for ${phraseList(backedTerms.map((item) => item.term))}.`
  }

  return 'Tie this line to a mapped job requirement, or keep it as context rather than a claim.'
}

function honestRewriteForTerms(terms: ClaimTermSafety[]) {
  const backedTerms = terms.filter((item) => item.status === 'done').map((item) => item.term)
  const warningTerms = terms.filter((item) => item.status === 'next').map((item) => item.term)
  const blockedTerms = terms.filter((item) => item.status === 'blocked')

  if (backedTerms.length > 0) {
    return `Focus this line on proven ${phraseList(backedTerms)}. Keep any unproven requirement out until there is evidence.`
  }

  if (warningTerms.length > 0 && blockedTerms.length === 0) {
    return 'Use this as a gap note for now: add a specific situation, action, and result before making it a CV claim.'
  }

  return 'Keep this line to evidence already reviewed in the CV. Leave the unproven requirement out of this application.'
}

function proofPromptForClaimTerms(terms: ClaimTermSafety[]) {
  const requirementLabel = terms.length === 1 ? 'this selected job requirement' : 'these selected job requirements'
  return [
    `Proof to add for ${requirementLabel}:`,
    'Situation:',
    'Action:',
    'Result:',
  ].join('\n')
}

function claimSafetyForText(
  text: string,
  analysis: Analysis,
  evidenceChoices: Record<string, EvidenceReviewChoice>,
): ClaimSafety {
  const terms = analysis.requirementMap
    .filter((item) => textContains(text, item.term))
    .map((item) => claimTermSafety(item, evidenceChoices))
    .sort((left, right) => evidenceReviewPriority[right.status] - evidenceReviewPriority[left.status])

  if (terms.length === 0) {
    return {
      detail: 'No mapped requirement is named here yet.',
      label: 'Needs proof',
      suggestion: claimSafetySuggestion([]),
      status: 'next',
      terms: [],
    }
  }

  if (terms.some((item) => item.status === 'blocked')) {
    return {
      detail: 'This mentions a requirement marked do not claim.',
      label: 'Do not claim',
      suggestion: claimSafetySuggestion(terms),
      status: 'blocked',
      terms,
    }
  }

  if (terms.some((item) => item.status === 'next')) {
    return {
      detail: 'This mentions a requirement that still needs proof.',
      label: 'Needs proof',
      suggestion: claimSafetySuggestion(terms),
      status: 'next',
      terms,
    }
  }

  return {
    detail: 'Backed by the reviewed evidence map.',
    label: 'Backed by evidence',
    suggestion: claimSafetySuggestion(terms),
    status: 'done',
    terms,
  }
}

function rewriteSafetyItems(
  rewrite: RewriteDraft,
  analysis: Analysis,
  evidenceChoices: Record<string, EvidenceReviewChoice>,
): RewriteSafetyItem[] {
  return [
    { id: 'summary', label: 'Summary', target: { field: 'summary' as const }, text: rewrite.summary },
    ...rewrite.bullets.map((bullet, index) => ({
      id: `bullet-${index}`,
      label: `Bullet ${index + 1}`,
      target: { field: 'bullet' as const, index },
      text: bullet,
    })),
    { id: 'note', label: 'Note', target: { field: 'note' as const }, text: rewrite.note },
  ].map((item) => ({
    ...item,
    safety: claimSafetyForText(item.text, analysis, evidenceChoices),
  }))
}

function starDraftExportLines(starDraft: StarDraft) {
  return [
    `Situation: ${starDraft.situation.trim() || 'Add the scene.'}`,
    `Task: ${starDraft.task.trim() || 'Add the responsibility or problem.'}`,
    `Action: ${starDraft.action.trim() || 'Add what you personally did.'}`,
    `Result: ${starDraft.result.trim() || 'Add what changed.'}`,
  ]
}

function applicationPackText(
  analysis: Analysis,
  rewrite: RewriteDraft,
  practiceAnswer: string,
  confidence: number,
  evidenceChoices: Record<string, EvidenceReviewChoice>,
  selectedQuestion: InterviewQuestion,
  starDraft: StarDraft,
  answerFeedback: AnswerFeedbackItem[],
) {
  const reviewLines = analysis.requirementMap.map((item) => {
    const choice = evidenceChoices[item.term] ?? 'needs-proof'
    return `- ${item.term}: ${evidenceReviewLabels[choice]}`
  })
  const feedbackLines = answerFeedback.map((item) => `- ${item.label}: ${statusLabels[item.status]} - ${item.detail}`)

  return [
    `Rolefit CV application pack: ${analysis.title}`,
    '',
    `Fit score: ${analysis.score}%`,
    `Proof areas: ${phraseList(analysis.matched.slice(0, 6))}`,
    analysis.gaps.length > 0 ? `Gaps to handle honestly: ${phraseList(analysis.gaps.slice(0, 4))}` : 'Gaps to handle honestly: none found in the mapped role language',
    '',
    'Targeted CV direction',
    rewrite.summary,
    ...rewrite.bullets.map((bullet) => `- ${bullet}`),
    rewrite.note,
    '',
    'Requirement review',
    ...reviewLines,
    '',
    'Interview practice question',
    `${selectedQuestion.category}: ${selectedQuestion.prompt}`,
    `Focus: ${selectedQuestion.focus}`,
    `Risk: ${selectedQuestion.risk}`,
    '',
    'STAR answer builder',
    ...starDraftExportLines(starDraft),
    '',
    'Interview answer',
    practiceAnswer.trim(),
    '',
    'Answer coaching lights',
    ...feedbackLines,
    '',
    `Confidence check: ${confidence}%`,
    'Before applying: read every claim out loud and remove anything you cannot explain calmly in an interview.',
  ].join('\n')
}

function applicationPackMarkdown(
  analysis: Analysis,
  rewrite: RewriteDraft,
  practiceAnswer: string,
  confidence: number,
  evidenceChoices: Record<string, EvidenceReviewChoice>,
  selectedQuestion: InterviewQuestion,
  starDraft: StarDraft,
  answerFeedback: AnswerFeedbackItem[],
) {
  const reviewLines = analysis.requirementMap.map((item) => {
    const choice = evidenceChoices[item.term] ?? 'needs-proof'
    return `- **${item.term}:** ${evidenceReviewLabels[choice]}`
  })
  const feedbackLines = answerFeedback.map((item) => `- **${item.label}:** ${statusLabels[item.status]} - ${item.detail}`)
  const gapLine =
    analysis.gaps.length > 0
      ? phraseList(analysis.gaps.slice(0, 4))
      : 'None found in the mapped role language'

  return [
    `# Rolefit CV Application Pack: ${analysis.title}`,
    '',
    `- **Fit score:** ${analysis.score}%`,
    `- **Proof areas:** ${phraseList(analysis.matched.slice(0, 6))}`,
    `- **Gaps to handle honestly:** ${gapLine}`,
    '',
    '## Targeted CV Direction',
    '',
    rewrite.summary,
    '',
    ...rewrite.bullets.map((bullet) => `- ${bullet}`),
    '',
    rewrite.note,
    '',
    '## Requirement Review',
    '',
    ...reviewLines,
    '',
    '## Interview Practice Question',
    '',
    `**${selectedQuestion.category}:** ${selectedQuestion.prompt}`,
    '',
    `- **Focus:** ${selectedQuestion.focus}`,
    `- **Risk:** ${selectedQuestion.risk}`,
    '',
    '## STAR Answer Builder',
    '',
    ...starDraftExportLines(starDraft).map((line) => `- ${line}`),
    '',
    '## Interview Answer',
    '',
    ...practiceAnswer
      .trim()
      .split('\n')
      .map((line) => `> ${line}`),
    '',
    '## Answer Coaching Lights',
    '',
    ...feedbackLines,
    '',
    `**Confidence check:** ${confidence}%`,
    '',
    'Before applying: read every claim out loud and remove anything you cannot explain calmly in an interview.',
  ].join('\n')
}

function interviewPackText(
  analysis: Analysis,
  questions: InterviewQuestion[],
  selectedQuestion: InterviewQuestion,
  starDraft: StarDraft,
  practiceAnswer: string,
  confidence: number,
  answerFeedback: AnswerFeedbackItem[],
) {
  return [
    `Rolefit CV interview pack: ${analysis.title}`,
    '',
    'Practice question bank',
    ...questions.map((question, index) => `${index + 1}. [${question.category}] ${question.prompt}`),
    '',
    'Selected practice question',
    `${selectedQuestion.category}: ${selectedQuestion.prompt}`,
    `Focus: ${selectedQuestion.focus}`,
    `Proof to use: ${selectedQuestion.proof}`,
    `Risk to avoid: ${selectedQuestion.risk}`,
    '',
    'STAR answer builder',
    ...starDraftExportLines(starDraft),
    '',
    'Draft spoken answer',
    practiceAnswer.trim(),
    '',
    'Coaching lights',
    ...answerFeedback.map((item) => `- ${item.label}: ${statusLabels[item.status]} - ${item.detail}`),
    '',
    `Confidence: ${confidence}%`,
  ].join('\n')
}

function interviewPackMarkdown(
  analysis: Analysis,
  questions: InterviewQuestion[],
  selectedQuestion: InterviewQuestion,
  starDraft: StarDraft,
  practiceAnswer: string,
  confidence: number,
  answerFeedback: AnswerFeedbackItem[],
) {
  return [
    `# Rolefit CV Interview Pack: ${analysis.title}`,
    '',
    '## Practice Question Bank',
    '',
    ...questions.map((question, index) => `${index + 1}. **${question.category}:** ${question.prompt}`),
    '',
    '## Selected Practice Question',
    '',
    `**${selectedQuestion.category}:** ${selectedQuestion.prompt}`,
    '',
    `- **Focus:** ${selectedQuestion.focus}`,
    `- **Proof to use:** ${selectedQuestion.proof}`,
    `- **Risk to avoid:** ${selectedQuestion.risk}`,
    '',
    '## STAR Answer Builder',
    '',
    ...starDraftExportLines(starDraft).map((line) => `- ${line}`),
    '',
    '## Draft Spoken Answer',
    '',
    ...practiceAnswer
      .trim()
      .split('\n')
      .map((line) => `> ${line}`),
    '',
    '## Coaching Lights',
    '',
    ...answerFeedback.map((item) => `- **${item.label}:** ${statusLabels[item.status]} - ${item.detail}`),
    '',
    `**Confidence:** ${confidence}%`,
  ].join('\n')
}

function filenameSlug(text: string) {
  const slug = normalise(text).trim().replace(/\s+/g, '-').replace(/^-+|-+$/g, '').slice(0, 42)
  return slug || 'application-pack'
}

function downloadTextFile(filename: string, text: string, mimeType: string) {
  try {
    const blob = new Blob([text], { type: `${mimeType};charset=utf-8` })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.download = filename
    link.href = url
    link.rel = 'noopener'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
    return true
  } catch {
    return false
  }
}

async function writeTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Fall back below for browser surfaces that block the async clipboard API.
    }
  }

  const textArea = document.createElement('textarea')
  textArea.value = text
  textArea.setAttribute('readonly', '')
  textArea.style.left = '-9999px'
  textArea.style.position = 'fixed'
  document.body.appendChild(textArea)
  textArea.select()
  const copied = document.execCommand('copy')
  document.body.removeChild(textArea)
  return copied
}

function LockedPanel({ title, message, action }: { title: string; message: string; action: string }) {
  return (
    <div className="output-panel locked-panel">
      <div className="locked-icon" aria-hidden="true">
        <Lock size={22} />
      </div>
      <div>
        <span className="section-kicker">Red locked</span>
        <h2>{title}</h2>
        <p>{message}</p>
        <strong>{action}</strong>
      </div>
    </div>
  )
}

function ImportDropZone({
  buttonLabel,
  onFile,
  status,
  target,
}: {
  buttonLabel: string
  onFile: (target: ImportTarget, file: File) => void
  status: ImportStatus
  target: ImportTarget
}) {
  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    const file = event.dataTransfer.files.item(0)
    if (file) onFile(target, file)
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.item(0)
    if (file) onFile(target, file)
    event.currentTarget.value = ''
  }

  const statusLight =
    status.state === 'done' ? 'done' : status.state === 'warning' ? 'next' : 'blocked'

  return (
    <div className="import-dropzone" onDragOver={handleDragOver} onDrop={handleDrop}>
      <div className="import-actions">
        <label className="icon-button import-button">
          <FileText size={16} aria-hidden="true" />
          <span>{buttonLabel}</span>
          <input
            accept={importAccept}
            aria-label={buttonLabel}
            className="file-input"
            data-testid={`${target}-import-input`}
            onChange={handleInputChange}
            type="file"
          />
        </label>
        <span>Drop .txt, .md, .docx, or .pdf</span>
      </div>
      {status.state !== 'idle' && (
        <div className={`import-status ${status.state}`} role={status.state === 'error' ? 'alert' : 'status'}>
          <span className={`status-light ${statusLight}`} aria-hidden="true"></span>
          <span>{status.message}</span>
        </div>
      )}
    </div>
  )
}

function App() {
  const [savedDraft] = useState(() => loadSavedDraft())
  const initialProvider = savedDraft.provider ?? 'mock'
  const [workMode, setWorkMode] = useState<WorkMode>(savedDraft.workMode ?? 'rolefit')
  const [provider, setProvider] = useState<ProviderId>(initialProvider)
  const [model, setModel] = useState(savedDraft.model ?? modelOptions[initialProvider][0])
  const [apiKey, setApiKey] = useState('')
  const [cvText, setCvText] = useState(savedDraft.cvText ?? seedCv)
  const [jobText, setJobText] = useState(savedDraft.jobText ?? seedJob)
  const [activeTab, setActiveTab] = useState<TabId>('tailor')
  const [selectedQuestion, setSelectedQuestion] = useState(savedDraft.selectedQuestion ?? 0)
  const [practiceAnswer, setPracticeAnswer] = useState(
    savedDraft.practiceAnswer ??
      'In customer service I handled delayed order problems by communicating clearly with customers, updating CRM notes, and working with warehouse, sales, and finance stakeholders. I used reporting to spot refund risk, documented the process, and trained new starters so the support team could stay consistent during busy weeks.',
  )
  const [interviewStar, setInterviewStar] = useState<StarDraft>(savedDraft.interviewStar ?? emptyStarDraft)
  const [confidence, setConfidence] = useState(savedDraft.confidence ?? 62)
  const [lastRun, setLastRun] = useState('Ready')
  const [copied, setCopied] = useState<string | null>(null)
  const [downloaded, setDownloaded] = useState<string | null>(null)
  const [analysisRun, setAnalysisRun] = useState<ProviderRunResult<Analysis> | null>(null)
  const [analysisRunKey, setAnalysisRunKey] = useState('')
  const [analysisError, setAnalysisError] = useState('')
  const [isAnalysing, setIsAnalysing] = useState(false)
  const [comparisonCandidates, setComparisonCandidates] = useState<ComparisonCandidate[]>([])
  const [comparisonError, setComparisonError] = useState('')
  const [comparisonRunKey, setComparisonRunKey] = useState('')
  const [isComparing, setIsComparing] = useState(false)
  const [importStatuses, setImportStatuses] = useState<Record<ImportTarget, ImportStatus>>({
    cv: emptyImportStatus,
    job: emptyImportStatus,
  })
  const [scoutDescription, setScoutDescription] = useState(
    savedDraft.scoutDescription ??
      'I want work where I can use real customer, operations, communication, and problem-solving evidence without pretending to be someone else.',
  )
  const [scoutQualifications, setScoutQualifications] = useState(savedDraft.scoutQualifications ?? '')
  const [scoutLocation, setScoutLocation] = useState(savedDraft.scoutLocation ?? '')
  const [scoutTravelRadius, setScoutTravelRadius] = useState(savedDraft.scoutTravelRadius ?? '20 miles')
  const [scoutWorkPreference, setScoutWorkPreference] = useState<ScoutWorkPreference>(
    savedDraft.scoutWorkPreference ?? 'any',
  )
  const [scoutSalaryFloor, setScoutSalaryFloor] = useState(savedDraft.scoutSalaryFloor ?? '')
  const [scoutPreferredRoles, setScoutPreferredRoles] = useState(
    savedDraft.scoutPreferredRoles ?? 'customer support, operations, customer success',
  )
  const [scoutRefusedRoles, setScoutRefusedRoles] = useState(savedDraft.scoutRefusedRoles ?? '')
  const [scoutJobs, setScoutJobs] = useState<ScoutJob[]>(savedDraft.scoutJobs ?? [])
  const [scoutJobInput, setScoutJobInput] = useState('')
  const [scoutLastAction, setScoutLastAction] = useState('Paste job adverts into the basket to build a shortlist.')
  const [evidenceChoices, setEvidenceChoices] = useState<Record<string, EvidenceReviewChoice>>({})
  const [evidenceReviewedKey, setEvidenceReviewedKey] = useState('')
  const [rewriteDoneKey, setRewriteDoneKey] = useState('')
  const [coachDoneKey, setCoachDoneKey] = useState('')
  const [interviewDoneKey, setInterviewDoneKey] = useState('')
  const [packDoneKey, setPackDoneKey] = useState('')
  const [editedRewrite, setEditedRewrite] = useState<RewriteDraft | null>(null)
  const [editedRewriteKey, setEditedRewriteKey] = useState('')
  const knownModelSelected = modelOptions[provider].includes(model)
  const usingCustomModel = !knownModelSelected
  const modelSelectValue = knownModelSelected ? model : customModelOption
  const selectedModel = usingCustomModel ? model.trim() : model
  const modelReady = selectedModel.length > 0
  const modelKind = usingCustomModel ? 'Custom model' : 'Known model'

  const inputKey = useMemo(
    () => `${cvText.trim()}\n---rolefit-job---\n${jobText.trim()}`,
    [cvText, jobText],
  )
  const analysisKey = useMemo(
    () => `${inputKey}\n---rolefit-provider---\n${provider}\n---rolefit-model---\n${selectedModel}`,
    [inputKey, provider, selectedModel],
  )
  const apiKeyPresent = apiKey.trim().length > 0
  const comparisonKey = useMemo(
    () => `${analysisKey}\n---rolefit-session-key---\n${apiKeyPresent ? 'present' : 'missing'}`,
    [analysisKey, apiKeyPresent],
  )
  const hasCv = cvText.trim().length >= 60
  const hasJob = jobText.trim().length >= 60
  const importReady = hasCv && hasJob
  const comparisonReady = importReady && modelReady && provider !== 'mock'
  const currentComparisonCandidates =
    comparisonReady && comparisonRunKey === comparisonKey ? comparisonCandidates : []
  const hasCurrentComparison = currentComparisonCandidates.length > 0
  const scoutProfile = useMemo<ScoutProfile>(
    () => ({
      cvText,
      location: scoutLocation,
      preferredRoles: scoutPreferredRoles,
      qualifications: scoutQualifications,
      refusedRoles: scoutRefusedRoles,
      salaryFloor: scoutSalaryFloor,
      selfDescription: scoutDescription,
      travelRadius: scoutTravelRadius,
      workPreference: scoutWorkPreference,
    }),
    [
      cvText,
      scoutDescription,
      scoutLocation,
      scoutPreferredRoles,
      scoutQualifications,
      scoutRefusedRoles,
      scoutSalaryFloor,
      scoutTravelRadius,
      scoutWorkPreference,
    ],
  )
  const scoutMatches = useMemo(() => buildScoutMatches(scoutProfile, scoutJobs), [scoutJobs, scoutProfile])
  const scoutProfileHasDetails =
    scoutDescription.trim().length > 0 ||
    scoutQualifications.trim().length > 0 ||
    scoutLocation.trim().length > 0 ||
    scoutPreferredRoles.trim().length > 0
  const scoutProfileStatus: StepStatus = hasCv && scoutProfileHasDetails ? 'done' : hasCv ? 'next' : 'blocked'
  const scoutBasketStatus: StepStatus = scoutJobs.length > 0 ? 'done' : hasCv ? 'next' : 'blocked'
  const scoutShortlistStatus: StepStatus = scoutJobs.length > 0 ? 'done' : 'blocked'
  const scoutGuidance =
    scoutProfileStatus === 'blocked'
      ? {
          detail: 'Add CV proof before Scout can rank jobs honestly.',
          status: 'blocked' as StepStatus,
          title: 'Add candidate proof',
        }
      : scoutProfileStatus === 'next'
        ? {
            detail: 'Add a short self-description, location, pay floor, or role preferences.',
            status: 'next' as StepStatus,
            title: 'Describe the person',
          }
        : scoutBasketStatus === 'next'
          ? {
              detail: 'Paste one or more job adverts. Use dividers when adding several.',
              status: 'next' as StepStatus,
              title: 'Build the job basket',
            }
          : {
              detail: 'Review the honest shortlist, then send a chosen job into the Rolefit CV workflow.',
              status: 'done' as StepStatus,
              title: 'Shortlist ready',
            }
  const draftAnalysis = useMemo(() => buildAnalysis(cvText, jobText), [cvText, jobText])
  const currentAnalysisRun = importReady && analysisRunKey === analysisKey ? analysisRun : null
  const analysis = currentAnalysisRun?.analysis ?? draftAnalysis
  const interviewQuestions = useMemo(() => interviewQuestionsForAnalysis(analysis), [analysis])
  const selectedQuestionIndex = Math.min(selectedQuestion, Math.max(interviewQuestions.length - 1, 0))
  const selectedInterviewQuestion =
    interviewQuestions[selectedQuestionIndex] ??
    ({
      category: 'Practice',
      focus: analysis.title,
      id: 'practice-question',
      prompt: `Why are you a strong fit for ${analysis.title}?`,
      proof: 'Use one clear CV example.',
      risk: 'Avoid generic strengths.',
      status: 'next',
    } satisfies InterviewQuestion)
  const answerFeedback = useMemo(
    () => answerFeedbackFor(practiceAnswer, analysis, confidence, interviewStar),
    [analysis, confidence, interviewStar, practiceAnswer],
  )
  const qualityGate = useMemo(
    () => qualityGateForAnalysis({ analysis, cvText, jobText }),
    [analysis, cvText, jobText],
  )
  const answerScore = useMemo(
    () => scoreAnswer(practiceAnswer, analysis, confidence, interviewStar),
    [analysis, confidence, interviewStar, practiceAnswer],
  )
  const hasCurrentAnalysis = Boolean(currentAnalysisRun)
  const requirementTotal = hasCurrentAnalysis ? analysis.requirementMap.length : 0
  const reviewedRequirementCount = hasCurrentAnalysis
    ? analysis.requirementMap.filter((item) => evidenceChoices[item.term]).length
    : 0
  const allRequirementsReviewed = requirementTotal === 0 || reviewedRequirementCount === requirementTotal
  const evidenceReviewKey = useMemo(
    () => evidenceReviewKeyFor(analysisKey, analysis.requirementMap, evidenceChoices),
    [analysis.requirementMap, analysisKey, evidenceChoices],
  )
  const evidenceReviewed =
    hasCurrentAnalysis && allRequirementsReviewed && evidenceReviewedKey === evidenceReviewKey
  const generatedRewrite = useMemo(() => rewriteFromAnalysis(analysis), [analysis])
  const rewriteDraft =
    hasCurrentAnalysis && editedRewriteKey === evidenceReviewKey && editedRewrite ? editedRewrite : generatedRewrite
  const rewriteSafety = useMemo(
    () => rewriteSafetyItems(rewriteDraft, analysis, evidenceChoices),
    [analysis, evidenceChoices, rewriteDraft],
  )
  const rewriteBlockedCount = rewriteSafety.filter((item) => item.safety.status === 'blocked').length
  const rewriteWarningCount = rewriteSafety.filter((item) => item.safety.status === 'next').length
  const rewriteHasBlockedClaim = evidenceReviewed && rewriteBlockedCount > 0
  const rewriteReviewKey = useMemo(
    () =>
      [
        evidenceReviewKey,
        '---rolefit-edited-rewrite---',
        rewriteDraft.summary.trim(),
        ...rewriteDraft.bullets.map((bullet) => bullet.trim()),
        rewriteDraft.note.trim(),
      ].join('\n'),
    [evidenceReviewKey, rewriteDraft],
  )
  const rewriteDone = evidenceReviewed && !rewriteHasBlockedClaim && rewriteDoneKey === rewriteReviewKey
  const coachDone = rewriteDone && coachDoneKey === rewriteReviewKey
  const practiceKey = useMemo(
    () =>
      [
        rewriteReviewKey,
        '---rolefit-question---',
        selectedInterviewQuestion.id,
        '---rolefit-star---',
        interviewStar.situation.trim(),
        interviewStar.task.trim(),
        interviewStar.action.trim(),
        interviewStar.result.trim(),
        '---rolefit-answer---',
        practiceAnswer.trim(),
        '---confidence---',
        confidence,
      ].join('\n'),
    [confidence, interviewStar, practiceAnswer, rewriteReviewKey, selectedInterviewQuestion.id],
  )
  const packText = useMemo(
    () =>
      applicationPackText(
        analysis,
        rewriteDraft,
        practiceAnswer,
        confidence,
        evidenceChoices,
        selectedInterviewQuestion,
        interviewStar,
        answerFeedback,
      ),
    [analysis, answerFeedback, confidence, evidenceChoices, interviewStar, practiceAnswer, rewriteDraft, selectedInterviewQuestion],
  )
  const packMarkdown = useMemo(
    () =>
      applicationPackMarkdown(
        analysis,
        rewriteDraft,
        practiceAnswer,
        confidence,
        evidenceChoices,
        selectedInterviewQuestion,
        interviewStar,
        answerFeedback,
      ),
    [analysis, answerFeedback, confidence, evidenceChoices, interviewStar, practiceAnswer, rewriteDraft, selectedInterviewQuestion],
  )
  const interviewPack = useMemo(
    () =>
      interviewPackText(
        analysis,
        interviewQuestions,
        selectedInterviewQuestion,
        interviewStar,
        practiceAnswer,
        confidence,
        answerFeedback,
      ),
    [analysis, answerFeedback, confidence, interviewQuestions, interviewStar, practiceAnswer, selectedInterviewQuestion],
  )
  const interviewPackMd = useMemo(
    () =>
      interviewPackMarkdown(
        analysis,
        interviewQuestions,
        selectedInterviewQuestion,
        interviewStar,
        practiceAnswer,
        confidence,
        answerFeedback,
      ),
    [analysis, answerFeedback, confidence, interviewQuestions, interviewStar, practiceAnswer, selectedInterviewQuestion],
  )
  const packFilenameBase = useMemo(() => `rolefit-cv-${filenameSlug(analysis.title)}`, [analysis.title])
  const answerReady =
    practiceAnswer.trim().length >= 80 &&
    answerScore >= 55 &&
    answerFeedback.every((item) => item.status !== 'blocked') &&
    starDraftReady(interviewStar)
  const interviewDone = coachDone && interviewDoneKey === practiceKey
  const packDone = interviewDone && packDoneKey === practiceKey
  const liveProviderReturned = currentAnalysisRun?.mode === 'provider-live'
  const liveProviderUsedFallback =
    currentAnalysisRun?.mode === 'provider-contract' &&
    currentAnalysisRun.keyState === 'present' &&
    currentAnalysisRun.transportLabel === 'Local fallback'
  const providerStatus =
    analysisError && apiKey.trim()
      ? {
          detail: 'The last live request failed. The key stays in this browser session only.',
          label: 'Live request failed',
          status: 'blocked' as StepStatus,
        }
      : liveProviderReturned
        ? {
            detail: 'The selected provider returned structured Rolefit JSON through the local proxy.',
            label: 'Live provider returned',
            status: 'done' as StepStatus,
          }
        : liveProviderUsedFallback
          ? {
              detail: 'Local analysis kept the workflow moving. Check the key, model, or provider limit before retrying.',
              label: 'Live fallback used',
              status: 'next' as StepStatus,
            }
      : !modelReady
        ? {
            detail: 'Type a model ID before running analysis.',
            label: 'Model required',
            status: 'blocked' as StepStatus,
          }
        : provider === 'mock'
          ? {
              detail: 'Local analysis only. No provider request will be sent.',
              label: 'Local mock',
              status: 'done' as StepStatus,
            }
          : apiKey.trim()
            ? {
                detail: `Session-only key. Live calls use ${liveProviderInputLimitLabel} per input and a ${liveProviderTimeoutLabel} timeout.`,
                label: 'Session key present',
                status: 'done' as StepStatus,
              }
            : {
                detail: 'Runs the provider contract view until a session key is entered.',
                label: 'Needs key',
                status: 'next' as StepStatus,
              }
  const visibleTab: TabId =
    activeTab === 'pack' && !interviewDone
      ? coachDone
        ? 'interview'
        : rewriteDone
          ? 'coach'
          : 'tailor'
      : activeTab === 'interview' && !coachDone
      ? rewriteDone
        ? 'coach'
        : 'tailor'
      : activeTab === 'coach' && !rewriteDone
        ? 'tailor'
        : activeTab

  const guidedSteps = useMemo(
    () =>
      workflowSteps.map((step) => {
        let status: StepStatus = 'blocked'
        let detail = ''

        if (step.id === 'import') {
          status = importReady ? 'done' : 'next'
          detail = importReady ? 'CV and job advert are ready.' : 'Paste both inputs to begin.'
        }
        if (step.id === 'analyse') {
          status = evidenceReviewed ? 'done' : importReady ? 'next' : 'blocked'
          detail = evidenceReviewed
            ? 'Evidence map is confirmed.'
            : hasCurrentAnalysis
              ? allRequirementsReviewed
                ? 'Confirm the reviewed evidence map.'
                : `Review ${reviewedRequirementCount} of ${requirementTotal} requirements.`
              : importReady
                ? 'Run analysis to map proof against the role.'
                : 'Add both documents first.'
        }
        if (step.id === 'rewrite') {
          status = rewriteDone ? 'done' : evidenceReviewed ? 'next' : 'blocked'
          detail = rewriteDone
            ? 'Targeted rewrite has been marked done.'
            : evidenceReviewed
              ? rewriteHasBlockedClaim
                ? 'Resolve red claim warnings before coaching.'
                : 'Review the rewrite and mark it done.'
              : hasCurrentAnalysis
                ? 'Confirm the evidence map first.'
                : 'Run analysis first.'
        }
        if (step.id === 'coach') {
          status = coachDone ? 'done' : rewriteDone ? 'next' : 'blocked'
          detail = coachDone
            ? 'Coaching pass is complete.'
            : rewriteDone
              ? 'Use the coaching prompts before interview practice.'
              : 'Finish the rewrite step first.'
        }
        if (step.id === 'interview') {
          status = interviewDone ? 'done' : coachDone ? 'next' : 'blocked'
          detail = interviewDone
            ? 'Practice answer has been completed.'
            : coachDone
              ? 'Answer a role-specific question and mark practice done.'
              : 'Complete coaching first.'
        }
        if (step.id === 'pack') {
          status = packDone ? 'done' : interviewDone ? 'next' : 'blocked'
          detail = packDone
            ? 'Application pack is ready to use.'
            : interviewDone
              ? 'Review the final pack before applying.'
              : 'Finish interview practice first.'
        }

        return { ...step, status, detail }
      }),
    [
      allRequirementsReviewed,
      coachDone,
      evidenceReviewed,
      hasCurrentAnalysis,
      importReady,
      interviewDone,
      packDone,
      requirementTotal,
      reviewedRequirementCount,
      rewriteHasBlockedClaim,
      rewriteDone,
    ],
  )
  const nextStep = guidedSteps.find((step) => step.status === 'next') ?? guidedSteps.at(-1)!

  useEffect(() => {
    if (typeof window === 'undefined') return

    const draft: SavedDraft = {
      confidence,
      cvText,
      interviewStar,
      jobText,
      model: selectedModel,
      practiceAnswer,
      provider,
      scoutDescription,
      scoutJobs,
      scoutLocation,
      scoutPreferredRoles,
      scoutQualifications,
      scoutRefusedRoles,
      scoutSalaryFloor,
      scoutTravelRadius,
      scoutWorkPreference,
      selectedQuestion: selectedQuestionIndex,
      workMode,
    }
    window.localStorage.setItem(draftStorageKey, JSON.stringify(draft))
  }, [
    confidence,
    cvText,
    interviewStar,
    jobText,
    practiceAnswer,
    provider,
    scoutDescription,
    scoutJobs,
    scoutLocation,
    scoutPreferredRoles,
    scoutQualifications,
    scoutRefusedRoles,
    scoutSalaryFloor,
    scoutTravelRadius,
    scoutWorkPreference,
    selectedModel,
    selectedQuestionIndex,
    workMode,
  ])

  function handleProviderChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextProvider = event.target.value as ProviderId
    setProvider(nextProvider)
    setModel(modelOptions[nextProvider][0])
    setAnalysisError('')
    resetComparisonState()
  }

  function handleModelChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextModel = event.target.value
    setModel(nextModel === customModelOption ? '' : nextModel)
    setAnalysisError('')
    resetComparisonState()
  }

  function setEvidenceChoice(term: string, choice: EvidenceReviewChoice) {
    setEvidenceChoices((current) => ({
      ...current,
      [term]: choice,
    }))
    setEvidenceReviewedKey('')
    setRewriteDoneKey('')
    setCoachDoneKey('')
    setInterviewDoneKey('')
    setPackDoneKey('')
  }

  function updateRewriteDraft(updater: (current: RewriteDraft) => RewriteDraft) {
    setEditedRewrite((current) => {
      const base = current && editedRewriteKey === evidenceReviewKey ? current : generatedRewrite
      return updater(base)
    })
    setEditedRewriteKey(evidenceReviewKey)
    setRewriteDoneKey('')
    setCoachDoneKey('')
    setInterviewDoneKey('')
    setPackDoneKey('')
  }

  function updateRewriteField(target: RewriteFieldTarget, text: string) {
    updateRewriteDraft((current) => {
      if (target.field === 'summary') {
        return { ...current, summary: text }
      }

      if (target.field === 'note') {
        return { ...current, note: text }
      }

      return {
        ...current,
        bullets: current.bullets.map((item, index) => (index === target.index ? text : item)),
      }
    })
  }

  function updateInterviewStar(field: keyof StarDraft, text: string) {
    setInterviewStar((current) => ({
      ...current,
      [field]: text,
    }))
  }

  function useStarAsAnswer() {
    setPracticeAnswer(starAnswerFromDraft(interviewStar, selectedInterviewQuestion))
  }

  function applyHonestRewrite(item: RewriteSafetyItem) {
    updateRewriteField(item.target, honestRewriteForTerms(item.safety.terms))
  }

  function removeUnsafeClaim(item: RewriteSafetyItem) {
    const replacementTerms = item.safety.terms.filter((term) => term.status !== 'blocked')
    updateRewriteField(item.target, honestRewriteForTerms(replacementTerms))
  }

  function markClaimAsNeedsProof(terms: ClaimTermSafety[]) {
    const nextChoices = { ...evidenceChoices }

    terms
      .filter((term) => term.status === 'blocked')
      .forEach((term) => {
        nextChoices[term.term] = 'needs-proof'
      })

    const nextEvidenceReviewKey = evidenceReviewKeyFor(analysisKey, analysis.requirementMap, nextChoices)
    setEvidenceChoices(nextChoices)
    setEvidenceReviewedKey(nextEvidenceReviewKey)
    setEditedRewrite(rewriteDraft)
    setEditedRewriteKey(nextEvidenceReviewKey)
    setRewriteDoneKey('')
    setCoachDoneKey('')
    setInterviewDoneKey('')
    setPackDoneKey('')
  }

  function addProofPromptToCv(terms: ClaimTermSafety[]) {
    setCvText((current) => `${current.trim()}\n\n${proofPromptForClaimTerms(terms)}`)
    setAnalysisRunKey('')
    resetComparisonState()
    setEvidenceChoices({})
    setEvidenceReviewedKey('')
    setEditedRewrite(null)
    setEditedRewriteKey('')
    setRewriteDoneKey('')
    setCoachDoneKey('')
    setInterviewDoneKey('')
    setPackDoneKey('')
    setAnalysisError('')
    setLastRun('Proof prompt added')
    setActiveTab('tailor')
  }

  function resetWorkflowAfterInputChange() {
    setAnalysisRunKey('')
    resetComparisonState()
    setEvidenceChoices({})
    setEvidenceReviewedKey('')
    setEditedRewrite(null)
    setEditedRewriteKey('')
    setRewriteDoneKey('')
    setCoachDoneKey('')
    setInterviewDoneKey('')
    setPackDoneKey('')
    setSelectedQuestion(0)
    setInterviewStar(emptyStarDraft)
    setAnalysisError('')
    setLastRun('Input changed')
  }

  function updateCvInput(text: string) {
    setCvText(text)
    setImportStatuses((current) => ({
      ...current,
      cv: emptyImportStatus,
    }))
    resetWorkflowAfterInputChange()
  }

  function updateJobInput(text: string) {
    setJobText(text)
    setImportStatuses((current) => ({
      ...current,
      job: emptyImportStatus,
    }))
    resetWorkflowAfterInputChange()
  }

  async function handleImportFile(target: ImportTarget, file: File) {
    const targetLabel = importTargetLabels[target]

    if (!isSupportedImportFile(file)) {
      setImportStatuses((current) => ({
        ...current,
        [target]: {
          message: `${file.name} is not supported. Use ${supportedImportMessage()}.`,
          state: 'error',
        },
      }))
      return
    }

    if (file.size === 0) {
      setImportStatuses((current) => ({
        ...current,
        [target]: {
          message: `${file.name} is empty.`,
          state: 'error',
        },
      }))
      return
    }

    if (file.size > importSizeLimitFor(file)) {
      setImportStatuses((current) => ({
        ...current,
        [target]: {
          message: `${file.name} is larger than ${importSizeLimitMessage(file)}.`,
          state: 'error',
        },
      }))
      return
    }

    try {
      const imported = await extractImportedDocumentText(file)
      const cleanedText = imported.text.trim()

      if (!cleanedText) {
        setImportStatuses((current) => ({
          ...current,
          [target]: {
            message: `${file.name} is empty.`,
            state: 'error',
          },
        }))
        return
      }

      if (target === 'cv') {
        setCvText(cleanedText)
      } else {
        setJobText(cleanedText)
      }

      resetWorkflowAfterInputChange()
      setActiveTab('tailor')
      setImportStatuses((current) => ({
        ...current,
        [target]: {
          message: `${imported.message} Review it in the ${targetLabel} box before running analysis.`,
          state: imported.state,
        },
      }))
    } catch (error) {
      setImportStatuses((current) => ({
        ...current,
        [target]: {
          message: error instanceof Error ? error.message : `${file.name} could not be read.`,
          state: 'error',
        },
      }))
    }
  }

  function resetComparisonState() {
    setComparisonCandidates([])
    setComparisonError('')
    setComparisonRunKey('')
  }

  function applyAnalysisRun(nextRun: ProviderRunResult<Analysis>, lastRunLabel: string) {
    const nextInterviewQuestion = interviewQuestionsForAnalysis(nextRun.analysis)[0]

    setAnalysisRun(nextRun)
    setAnalysisRunKey(analysisKey)
    setEvidenceChoices({})
    setEvidenceReviewedKey('')
    setEditedRewrite(null)
    setEditedRewriteKey('')
    setRewriteDoneKey('')
    setCoachDoneKey('')
    setInterviewDoneKey('')
    setPackDoneKey('')
    setSelectedQuestion(0)
    setInterviewStar(nextInterviewQuestion ? starDraftForQuestion(nextRun.analysis, nextInterviewQuestion) : emptyStarDraft)
    setActiveTab('tailor')
    setLastRun(lastRunLabel)
  }

  function comparisonCandidateCanBeUsed(candidate: ComparisonCandidate) {
    return candidate.run.mode === 'local-mock' || candidate.run.mode === 'provider-live'
  }

  function comparisonActionDetail(run: ProviderRunResult<Analysis>) {
    if (run.mode === 'local-mock') return 'Local baseline is available without sending a provider request.'
    if (run.mode === 'provider-live') return 'Live structured output is available for this workflow.'
    if (run.mode === 'provider-needs-key') return `${run.providerLabel} needs a session key before live comparison.`
    if (run.transportLabel === 'Local fallback') {
      return 'Live request fell back locally, so this row cannot be used as a live provider result.'
    }
    return 'Provider contract is visible, but this is not a live provider result yet.'
  }

  function comparisonCandidatesFor(
    localRun: ProviderRunResult<Analysis>,
    selectedRun: ProviderRunResult<Analysis>,
  ): ComparisonCandidate[] {
    const localQualityGate = qualityGateForAnalysis({ analysis: localRun.analysis, cvText, jobText })
    const selectedQualityGate = qualityGateForAnalysis({ analysis: selectedRun.analysis, cvText, jobText })
    const selectedIsLive = selectedRun.mode === 'provider-live'
    const selectedWins =
      selectedIsLive &&
      (selectedQualityGate.score > localQualityGate.score || selectedQualityGate.score === localQualityGate.score)

    return [
      {
        actionDetail: comparisonActionDetail(localRun),
        id: 'local',
        qualityGate: localQualityGate,
        recommendation: selectedWins ? 'available' : 'recommended',
        run: localRun,
      },
      {
        actionDetail: comparisonActionDetail(selectedRun),
        id: 'selected',
        qualityGate: selectedQualityGate,
        recommendation: selectedIsLive ? (selectedWins ? 'recommended' : 'available') : 'locked',
        run: selectedRun,
      },
    ]
  }

  async function runAnalysis() {
    if (!importReady || !modelReady || isAnalysing || isComparing) return

    setIsAnalysing(true)
    setAnalysisError('')

    try {
      const nextAnalysis = buildAnalysis(cvText, jobText)
      const nextRun = await runRolefitProvider({
        analysis: nextAnalysis,
        apiKey,
        cvText,
        jobText,
        model: selectedModel,
        provider,
      })

      applyAnalysisRun(
        nextRun,
        `Updated ${new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })}`,
      )
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : 'The analysis adapter could not complete this run.')
    } finally {
      setIsAnalysing(false)
    }
  }

  async function compareProvider() {
    if (!comparisonReady || isComparing || isAnalysing) return

    setIsComparing(true)
    setAnalysisError('')
    setComparisonError('')

    try {
      const localAnalysis = buildAnalysis(cvText, jobText)
      const selectedAnalysis = buildAnalysis(cvText, jobText)
      const [localRun, selectedRun] = await Promise.all([
        runRolefitProvider({
          analysis: localAnalysis,
          apiKey: '',
          cvText,
          jobText,
          model: modelOptions.mock[0],
          provider: 'mock',
        }),
        runRolefitProvider({
          analysis: selectedAnalysis,
          apiKey,
          cvText,
          jobText,
          model: selectedModel,
          provider,
        }),
      ])

      setComparisonCandidates(comparisonCandidatesFor(localRun, selectedRun))
      setComparisonRunKey(comparisonKey)
      setLastRun(
        `Compared ${new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })}`,
      )
    } catch (error) {
      setComparisonError(error instanceof Error ? error.message : 'The provider comparison could not complete.')
    } finally {
      setIsComparing(false)
    }
  }

  function applyComparisonCandidate(candidate: ComparisonCandidate) {
    if (!comparisonCandidateCanBeUsed(candidate)) return
    applyAnalysisRun(candidate.run, `Used ${candidate.id === 'local' ? 'local mock baseline' : candidate.run.providerLabel}`)
  }

  function scoutLightFor(status: ScoutMatchStatus) {
    if (status === 'green') return 'done'
    if (status === 'amber') return 'next'
    if (status === 'red') return 'blocked'
    return 'black'
  }

  function addScoutJobsFromInput() {
    const parsedJobs = parseScoutJobAdverts(scoutJobInput)

    if (parsedJobs.length === 0) {
      setScoutLastAction('Paste at least one readable job advert. Use --- between adverts if adding several.')
      return
    }

    const createdAt = Date.now()
    const nextJobs = parsedJobs.map((job, index) => ({
      ...job,
      id: `scout-${createdAt}-${index}`,
    }))

    setScoutJobs((current) => [...nextJobs, ...current])
    setScoutJobInput('')
    setScoutLastAction(`${parsedJobs.length} job advert${parsedJobs.length === 1 ? '' : 's'} added to the basket.`)
  }

  function removeScoutJob(jobId: string) {
    setScoutJobs((current) => current.filter((job) => job.id !== jobId))
    setScoutLastAction('Job removed from the basket.')
  }

  function clearScoutJobs() {
    setScoutJobs([])
    setScoutLastAction('Job basket cleared.')
  }

  function sendScoutJobToRolefit(job: ScoutJob) {
    setJobText(job.text)
    resetWorkflowAfterInputChange()
    setImportStatuses((current) => ({
      ...current,
      job: {
        message: `${job.title} loaded from Scout. Review it before running analysis.`,
        state: 'done',
      },
    }))
    setActiveTab('tailor')
    setWorkMode('rolefit')
    setLastRun('Scout job selected')
  }

  async function copyRewrite() {
    const rewriteText = [
      rewriteDraft.summary,
      '',
      ...rewriteDraft.bullets.map((bullet) => `- ${bullet}`),
      '',
      rewriteDraft.note,
    ].join('\n')
    const didCopy = await writeTextToClipboard(rewriteText)
    setCopied(didCopy ? 'rewrite' : 'rewrite-error')
    window.setTimeout(() => setCopied(null), 1400)
  }

  async function copyPack() {
    const didCopy = await writeTextToClipboard(packText)
    setCopied(didCopy ? 'pack' : 'pack-error')
    window.setTimeout(() => setCopied(null), 1400)
  }

  function downloadPack(format: 'md' | 'txt') {
    const didDownload =
      format === 'md'
        ? downloadTextFile(`${packFilenameBase}.md`, packMarkdown, 'text/markdown')
        : downloadTextFile(`${packFilenameBase}.txt`, packText, 'text/plain')

    setDownloaded(didDownload ? format : `${format}-error`)
    window.setTimeout(() => setDownloaded(null), 1400)
  }

  function downloadInterviewPack(format: 'md' | 'txt') {
    const didDownload =
      format === 'md'
        ? downloadTextFile(`${packFilenameBase}-interview.md`, interviewPackMd, 'text/markdown')
        : downloadTextFile(`${packFilenameBase}-interview.txt`, interviewPack, 'text/plain')

    setDownloaded(didDownload ? `interview-${format}` : `interview-${format}-error`)
    window.setTimeout(() => setDownloaded(null), 1400)
  }

  function canOpenTab(tab: TabId) {
    if (tab === 'tailor') return hasCurrentAnalysis
    if (tab === 'coach') return rewriteDone
    if (tab === 'interview') return coachDone
    return interviewDone
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">
            <ShieldCheck size={22} />
          </div>
          <div>
            <h1>Rolefit CV</h1>
            <p>Build a CV for this job, then practise the person behind it.</p>
          </div>
        </div>

        <div className="provider-console" aria-label="AI provider setup">
          <label className="field">
            <span>Provider</span>
            <select value={provider} onChange={handleProviderChange}>
              {providers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Model</span>
            <select value={modelSelectValue} onChange={handleModelChange}>
              {modelOptions[provider].map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
              <option value={customModelOption}>Custom model</option>
            </select>
            {usingCustomModel && (
              <input
                aria-label="Custom model ID"
                onChange={(event) => {
                  setModel(event.target.value)
                  setAnalysisError('')
                  resetComparisonState()
                }}
                placeholder="provider-model-id"
                value={model}
              />
            )}
            <em className={`model-kind ${usingCustomModel ? 'custom' : 'known'}`}>{modelKind}</em>
          </label>
          <label className="field key-field">
            <span>Your API key</span>
            <div className="key-input">
              <KeyRound size={16} aria-hidden="true" />
              <input
                autoComplete="off"
                onChange={(event) => {
                  setApiKey(event.target.value)
                  setAnalysisError('')
                  resetComparisonState()
                }}
                placeholder="Paste key for this session"
                type="password"
                value={apiKey}
              />
            </div>
          </label>
          <div className={`provider-status ${providerStatus.status}`}>
            <span className={`status-light ${providerStatus.status}`} aria-hidden="true"></span>
            <div>
              <strong>{providerStatus.label}</strong>
              <span>{providerStatus.detail}</span>
            </div>
          </div>
        </div>
      </header>

      <div className="mode-bar" aria-label="Rolefit work mode">
        <div className="mode-switch">
          <button
            aria-pressed={workMode === 'rolefit'}
            className={`mode-option ${workMode === 'rolefit' ? 'active' : ''}`}
            onClick={() => setWorkMode('rolefit')}
            type="button"
          >
            <FileText size={17} aria-hidden="true" />
            <span>
              <strong>Rolefit CV</strong>
              One job application
            </span>
          </button>
          <button
            aria-pressed={workMode === 'scout'}
            className={`mode-option ${workMode === 'scout' ? 'active' : ''}`}
            onClick={() => setWorkMode('scout')}
            type="button"
          >
            <Compass size={17} aria-hidden="true" />
            <span>
              <strong>Scout Mode</strong>
              Worker-side shortlist
            </span>
          </button>
        </div>
        <p>
          {workMode === 'scout'
            ? 'Find roles the person can honestly prove, then prepare properly.'
            : 'Tailor one CV to one job, then practise the interview story.'}
        </p>
      </div>

      {workMode === 'scout' ? (
        <div className="scout-workspace">
          <aside className="workflow-rail scout-rail" aria-label="Scout workflow">
            <div className="rail-heading">
              <Compass size={18} aria-hidden="true" />
              <span>Scout flow</span>
            </div>
            <div className="traffic-legend" aria-label="Scout status legend">
              <span>
                <i className="status-light done" aria-hidden="true"></i>
                Green prove it
              </span>
              <span>
                <i className="status-light next" aria-hidden="true"></i>
                Orange strengthen it
              </span>
              <span>
                <i className="status-light blocked" aria-hidden="true"></i>
                Red do not fake it
              </span>
              <span>
                <i className="status-light black" aria-hidden="true"></i>
                Black question the role
              </span>
            </div>
            {[
              {
                description: 'CV, strengths, limits',
                icon: UserRoundCheck,
                status: scoutProfileStatus,
                title: 'Candidate proof',
              },
              {
                description: `${scoutJobs.length} saved advert${scoutJobs.length === 1 ? '' : 's'}`,
                icon: BriefcaseBusiness,
                status: scoutBasketStatus,
                title: 'Job basket',
              },
              {
                description: 'Fit, gaps, warnings',
                icon: SearchCheck,
                status: scoutShortlistStatus,
                title: 'Honest shortlist',
              },
            ].map((step, index) => {
              const StepIcon = step.icon
              return (
                <div
                  aria-current={step.status === 'next' ? 'step' : undefined}
                  className={`workflow-step ${step.status}`}
                  key={step.title}
                >
                  <span className="step-count">{index + 1}</span>
                  <span className={`status-light ${step.status}`} aria-hidden="true"></span>
                  <StepIcon size={18} aria-hidden="true" />
                  <div>
                    <strong>{step.title}</strong>
                    <span>{step.description}</span>
                    <em>{statusLabels[step.status]}</em>
                  </div>
                </div>
              )
            })}
          </aside>

          <section className="scout-main" aria-label="Scout mode">
            <div className={`guidance-strip ${scoutGuidance.status}`}>
              <span className={`status-light ${scoutGuidance.status}`} aria-hidden="true"></span>
              <div>
                <strong>{scoutGuidance.title}</strong>
                <span>{scoutGuidance.detail}</span>
              </div>
            </div>

            <section className="scout-panel">
              <div className="section-head">
                <div>
                  <span className="section-kicker">Candidate profile</span>
                  <h2>What can this person prove?</h2>
                </div>
                <span className={`scout-step-pill ${scoutProfileStatus}`}>
                  <span className={`status-light ${scoutProfileStatus}`} aria-hidden="true"></span>
                  {statusLabels[scoutProfileStatus]}
                </span>
              </div>
              <div className="scout-profile-grid">
                <div className="scout-field scout-wide">
                  <span>CV proof source</span>
                  <ImportDropZone
                    buttonLabel="Import CV"
                    onFile={handleImportFile}
                    status={importStatuses.cv}
                    target="cv"
                  />
                  <textarea aria-label="Scout CV proof source" value={cvText} onChange={(event) => updateCvInput(event.target.value)} />
                </div>
                <label className="scout-field scout-wide">
                  <span>Self-description</span>
                  <textarea
                    aria-label="Self-description"
                    onChange={(event) => setScoutDescription(event.target.value)}
                    value={scoutDescription}
                  />
                </label>
                <label className="scout-field">
                  <span>Qualifications</span>
                  <textarea
                    aria-label="Qualifications"
                    onChange={(event) => setScoutQualifications(event.target.value)}
                    placeholder="Licences, tickets, certificates, school/college, training"
                    value={scoutQualifications}
                  />
                </label>
                <label className="scout-field">
                  <span>Town or postcode</span>
                  <input
                    aria-label="Town or postcode"
                    onChange={(event) => setScoutLocation(event.target.value)}
                    placeholder="e.g. Manchester"
                    value={scoutLocation}
                  />
                </label>
                <label className="scout-field">
                  <span>Travel range</span>
                  <input
                    aria-label="Travel range"
                    onChange={(event) => setScoutTravelRadius(event.target.value)}
                    placeholder="e.g. 20 miles"
                    value={scoutTravelRadius}
                  />
                </label>
                <label className="scout-field">
                  <span>Work pattern</span>
                  <select
                    aria-label="Work pattern"
                    onChange={(event) => setScoutWorkPreference(event.target.value as ScoutWorkPreference)}
                    value={scoutWorkPreference}
                  >
                    {scoutWorkPreferenceOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="scout-field">
                  <span>Pay floor</span>
                  <input
                    aria-label="Pay floor"
                    onChange={(event) => setScoutSalaryFloor(event.target.value)}
                    placeholder="e.g. 12.50/hour or 24000"
                    value={scoutSalaryFloor}
                  />
                </label>
                <label className="scout-field">
                  <span>Roles wanted</span>
                  <textarea
                    aria-label="Roles wanted"
                    onChange={(event) => setScoutPreferredRoles(event.target.value)}
                    placeholder="Customer support, warehouse admin, junior analyst"
                    value={scoutPreferredRoles}
                  />
                </label>
                <label className="scout-field">
                  <span>Roles refused</span>
                  <textarea
                    aria-label="Roles refused"
                    onChange={(event) => setScoutRefusedRoles(event.target.value)}
                    placeholder="Commission only, night shifts, door-to-door sales"
                    value={scoutRefusedRoles}
                  />
                </label>
              </div>
            </section>

            <section className="scout-panel">
              <div className="section-head">
                <div>
                  <span className="section-kicker">Job basket</span>
                  <h2>Paste adverts, do not auto-apply</h2>
                </div>
                <div className="analysis-actions">
                  <button className="icon-button" disabled={scoutJobs.length === 0} onClick={clearScoutJobs} type="button">
                    <Trash2 size={16} aria-hidden="true" />
                    <span>Clear basket</span>
                  </button>
                  <button className="icon-button action-button" disabled={!scoutJobInput.trim()} onClick={addScoutJobsFromInput} type="button">
                    <Plus size={16} aria-hidden="true" />
                    <span>Add jobs</span>
                  </button>
                </div>
              </div>
              <textarea
                aria-label="Paste one or more job adverts"
                className="scout-job-input"
                onChange={(event) => setScoutJobInput(event.target.value)}
                placeholder={'Paste one advert, or separate several with a line containing ---'}
                value={scoutJobInput}
              />
              <div className={`review-progress ${scoutBasketStatus}`}>
                <span className={`status-light ${scoutBasketStatus}`} aria-hidden="true"></span>
                <div>
                  <strong>{scoutJobs.length} job advert{scoutJobs.length === 1 ? '' : 's'} in the basket</strong>
                  <span>{scoutLastAction}</span>
                </div>
              </div>
              {scoutJobs.length > 0 && (
                <div className="scout-basket-list" aria-label="Saved job adverts">
                  {scoutJobs.map((job) => (
                    <article className="scout-basket-card" key={job.id}>
                      <div>
                        <strong>{job.title}</strong>
                        <span>{job.text.length.toLocaleString()} characters</span>
                      </div>
                      <button className="icon-button" onClick={() => removeScoutJob(job.id)} type="button">
                        <Trash2 size={15} aria-hidden="true" />
                        <span>Remove</span>
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </section>

          <section className="scout-shortlist" aria-label="Scout shortlist">
            <div className="scout-panel">
              <div className="panel-head">
                <div>
                  <span className="section-kicker">Honest shortlist</span>
                  <h2>Jobs ranked by proof fit</h2>
                </div>
                <span className="comparison-summary-pill">{scoutMatches.length} ranked</span>
              </div>
              {scoutMatches.length === 0 ? (
                <LockedPanel
                  action={hasCv ? 'Add job adverts to the basket.' : 'Add CV proof first.'}
                  message="Scout needs real CV evidence and real job adverts before it can say green, amber, red, or black."
                  title="Shortlist is locked"
                />
              ) : (
                <div className="scout-match-list">
                  {scoutMatches.map((match) => {
                    const light = scoutLightFor(match.status)
                    return (
                      <article className={`scout-match-card ${match.status}`} key={match.job.id}>
                        <div className="scout-match-head">
                          <div>
                            <span className="section-kicker">{match.statusLabel}</span>
                            <h3>{match.job.title}</h3>
                          </div>
                          <div className="scout-score">
                            <strong>{match.score}</strong>
                            <span>fit</span>
                          </div>
                        </div>
                        <p>{match.summary}</p>
                        <div className="scout-metrics">
                          <div>
                            <span>Proof</span>
                            <strong>{match.evidenceTerms.length}</strong>
                          </div>
                          <div>
                            <span>Gaps</span>
                            <strong>{match.missingTerms.length}</strong>
                          </div>
                          <div>
                            <span>Warnings</span>
                            <strong>{match.warnings.length}</strong>
                          </div>
                        </div>
                        <div className="chip-list">
                          {match.evidenceTerms.slice(0, 6).map((term) => (
                            <span className="chip positive" key={term}>
                              <Check size={14} aria-hidden="true" />
                              {term}
                            </span>
                          ))}
                          {match.missingTerms.slice(0, 5).map((term) => (
                            <span className="chip warning" key={term}>
                              {term}
                            </span>
                          ))}
                          {match.warnings.slice(0, 4).map((warning) => (
                            <span className={`chip scout-warning ${match.status === 'black' ? 'black' : ''}`} key={warning}>
                              {warning}
                            </span>
                          ))}
                        </div>
                        <div className="scout-requirements" aria-label={`${match.job.title} requirement map`}>
                          {match.requirementMap.length > 0 ? (
                            match.requirementMap.slice(0, 6).map((item) => (
                              <div className={`scout-requirement ${item.status}`} key={item.term}>
                                <span className={`status-light ${item.status === 'green' ? 'done' : item.status === 'amber' ? 'next' : 'blocked'}`} aria-hidden="true"></span>
                                <p>
                                  <strong>{item.term}</strong>
                                  {item.evidence || item.detail}
                                </p>
                              </div>
                            ))
                          ) : (
                            <div className="scout-requirement amber">
                              <span className="status-light next" aria-hidden="true"></span>
                              <p>
                                <strong>Manual read needed</strong>
                                This advert does not contain enough recognised role language yet.
                              </p>
                            </div>
                          )}
                        </div>
                        <div className="scout-questions">
                          <span className="section-kicker">Questions to ask</span>
                          {match.employerQuestions.map((question) => (
                            <p key={question}>
                              <span className={`status-light ${light}`} aria-hidden="true"></span>
                              {question}
                            </p>
                          ))}
                        </div>
                        <button className="icon-button action-button" onClick={() => sendScoutJobToRolefit(match.job)} type="button">
                          <Send size={17} aria-hidden="true" />
                          <span>{match.status === 'black' ? 'Open in Rolefit anyway' : 'Send to Rolefit'}</span>
                        </button>
                      </article>
                    )
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      ) : (
      <div className="workspace">
        <aside className="workflow-rail" aria-label="Workflow">
          <div className="rail-heading">
            <BriefcaseBusiness size={18} aria-hidden="true" />
            <span>Application flow</span>
          </div>
          <div className="traffic-legend" aria-label="Workflow status legend">
            <span>
              <i className="status-light done" aria-hidden="true"></i>
              Green done
            </span>
            <span>
              <i className="status-light next" aria-hidden="true"></i>
              Orange next
            </span>
            <span>
              <i className="status-light blocked" aria-hidden="true"></i>
              Red locked
            </span>
          </div>
          {guidedSteps.map((step, index) => {
            const StepIcon = step.icon
            return (
              <div
                aria-current={step.status === 'next' ? 'step' : undefined}
                className={`workflow-step ${step.status}`}
                key={step.id}
              >
                <span className="step-count">{index + 1}</span>
                <span className={`status-light ${step.status}`} aria-hidden="true"></span>
                <StepIcon size={18} aria-hidden="true" />
                <div>
                  <strong>{step.title}</strong>
                  <span>{step.description}</span>
                  <em>{statusLabels[step.status]}</em>
                </div>
              </div>
            )
          })}
        </aside>

        <section className="input-column" aria-label="CV and job inputs">
          <div className={`guidance-strip ${nextStep.status}`}>
            <span className={`status-light ${nextStep.status}`} aria-hidden="true"></span>
            <div>
              <strong>{nextStep.title}</strong>
              <span>{nextStep.detail}</span>
            </div>
          </div>

          <div className="section-head">
            <div>
              <span className="section-kicker">Tailor to the role</span>
              <h2>Evidence in, targeted draft out</h2>
            </div>
            <div className="analysis-actions">
              <button
                className="icon-button"
                disabled={!comparisonReady || isAnalysing || isComparing}
                onClick={compareProvider}
                type="button"
              >
                <SearchCheck size={17} aria-hidden="true" />
                <span>{isComparing ? 'Comparing' : 'Compare provider'}</span>
              </button>
              <button
                className="icon-button action-button"
                disabled={!importReady || !modelReady || isAnalysing || isComparing}
                onClick={runAnalysis}
                type="button"
              >
                <RefreshCw size={17} aria-hidden="true" />
                <span>{isAnalysing ? 'Analysing' : 'Run analysis'}</span>
              </button>
            </div>
          </div>

          {analysisError && (
            <div className="error-strip" role="alert">
              <span className="status-light blocked" aria-hidden="true"></span>
              <span>{analysisError}</span>
            </div>
          )}
          {comparisonError && (
            <div className="error-strip" role="alert">
              <span className="status-light blocked" aria-hidden="true"></span>
              <span>{comparisonError}</span>
            </div>
          )}

          <div className="editor-grid">
            <div className="editor-panel">
              <span className="editor-title">
                <FileText size={17} aria-hidden="true" />
                CV
              </span>
              <ImportDropZone
                buttonLabel="Import CV"
                onFile={handleImportFile}
                status={importStatuses.cv}
                target="cv"
              />
              <textarea aria-label="CV" value={cvText} onChange={(event) => updateCvInput(event.target.value)} />
            </div>
            <div className="editor-panel">
              <span className="editor-title">
                <BriefcaseBusiness size={17} aria-hidden="true" />
                Job advert
              </span>
              <ImportDropZone
                buttonLabel="Import job"
                onFile={handleImportFile}
                status={importStatuses.job}
                target="job"
              />
              <textarea aria-label="Job advert" value={jobText} onChange={(event) => updateJobInput(event.target.value)} />
            </div>
          </div>

          {provider !== 'mock' && (hasCurrentComparison || isComparing) && (
            <div className="comparison-panel">
              <div className="panel-head">
                <div>
                  <span className="section-kicker">Provider comparison</span>
                  <h3>Choose the analysis to trust</h3>
                </div>
                <span className="comparison-summary-pill">
                  {isComparing ? 'Running comparison' : `${currentComparisonCandidates.length} candidates`}
                </span>
              </div>
              <p>
                Comparison is a preview. The workflow only unlocks after you choose one result with Use this analysis.
              </p>
              {hasCurrentComparison ? (
                <div className="comparison-list" aria-label="Provider comparison candidates">
                  {currentComparisonCandidates.map((candidate) => {
                    const candidateCanBeUsed = comparisonCandidateCanBeUsed(candidate)
                    const candidateStatus =
                      candidate.recommendation === 'locked'
                        ? 'blocked'
                        : candidate.recommendation === 'recommended'
                          ? 'done'
                          : 'next'

                    return (
                      <article className={`comparison-candidate ${candidateStatus}`} key={candidate.id}>
                        <div className="comparison-candidate-head">
                          <div>
                            <span className="section-kicker">
                              {candidate.id === 'local'
                                ? 'Local mock baseline'
                                : `${candidate.run.providerLabel} / ${candidate.run.model}`}
                            </span>
                            <h4>{candidate.run.statusTitle}</h4>
                          </div>
                          <div className="comparison-pills">
                            {candidate.recommendation === 'recommended' && (
                              <span className="comparison-pill recommended">Recommended</span>
                            )}
                            <span className="comparison-pill">{candidate.run.transportLabel}</span>
                          </div>
                        </div>
                        <div className="comparison-metrics">
                          <div>
                            <span>Quality</span>
                            <strong>{candidate.qualityGate.score}%</strong>
                          </div>
                          <div>
                            <span>Mode</span>
                            <strong>{candidate.run.mode}</strong>
                          </div>
                          <div>
                            <span>API key</span>
                            <strong>
                              {candidate.run.keyState === 'present'
                                ? 'Session key present'
                                : candidate.run.keyState === 'missing'
                                  ? 'Needed for live calls'
                                  : 'Not required'}
                            </strong>
                          </div>
                        </div>
                        <p>{candidate.actionDetail}</p>
                        <div className="comparison-checks">
                          {candidate.qualityGate.items.slice(0, 4).map((item) => (
                            <span className={`comparison-check ${item.status}`} key={item.id}>
                              <span className={`status-light ${item.status}`} aria-hidden="true"></span>
                              {item.label}: {item.metric}
                            </span>
                          ))}
                        </div>
                        <button
                          className="icon-button action-button"
                          disabled={!candidateCanBeUsed}
                          onClick={() => applyComparisonCandidate(candidate)}
                          type="button"
                        >
                          <Check size={17} aria-hidden="true" />
                          <span>{candidateCanBeUsed ? 'Use this analysis' : 'Locked for workflow'}</span>
                        </button>
                      </article>
                    )
                  })}
                </div>
              ) : (
                <div className="comparison-loading">
                  <span className="status-light next" aria-hidden="true"></span>
                  <strong>Comparing selected provider against local mock.</strong>
                </div>
              )}
            </div>
          )}

          {hasCurrentAnalysis ? (
            <div className="analysis-panel">
              <div className="score-block">
                <div
                  aria-label={`Fit score ${analysis.score} percent`}
                  className="score-ring"
                  style={{
                    background: `conic-gradient(var(--green) ${analysis.score * 3.6}deg, #dfe8e4 0deg)`,
                  }}
                >
                  <span>{analysis.score}</span>
                  <small>fit</small>
                </div>
                <div>
                  <span className="section-kicker">{lastRun}</span>
                  <h3>{analysis.title}</h3>
                  <p>The useful question is not whether the CV sounds impressive. It is whether it proves this exact role.</p>
                </div>
              </div>
              <div className="match-grid">
                <div>
                  <h4>Evidence</h4>
                  <div className="chip-list">
                    {analysis.matched.map((term) => (
                      <span className="chip positive" key={term}>
                        <Check size={14} aria-hidden="true" />
                        {term}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <h4>Fit gaps</h4>
                  <div className="chip-list">
                    {analysis.gaps.length > 0 ? (
                      analysis.gaps.map((term) => (
                        <span className="chip warning" key={term}>
                          {term}
                        </span>
                      ))
                    ) : (
                      <span className="empty-copy">No obvious gaps in the role language.</span>
                    )}
                  </div>
                </div>
              </div>
              {currentAnalysisRun && (
                <div className={`provider-run-card ${currentAnalysisRun.mode}`}>
                  <div className="provider-run-head">
                    <div>
                      <span className="section-kicker">AI provider contract</span>
                      <h3>{currentAnalysisRun.statusTitle}</h3>
                    </div>
                    <span className="adapter-pill">{currentAnalysisRun.transportLabel}</span>
                  </div>
                  <p>{currentAnalysisRun.statusDetail}</p>
                  <div className="contract-grid">
                    <div>
                      <span>Provider</span>
                      <strong>{currentAnalysisRun.providerLabel}</strong>
                    </div>
                    <div>
                      <span>Model</span>
                      <strong>{currentAnalysisRun.model}</strong>
                    </div>
                    <div>
                      <span>Contract</span>
                      <strong>{currentAnalysisRun.contract.version}</strong>
                    </div>
                    <div>
                      <span>API key</span>
                      <strong>
                        {currentAnalysisRun.keyState === 'present'
                          ? 'Session key present'
                          : currentAnalysisRun.keyState === 'missing'
                            ? 'Needed for live calls'
                            : 'Not required'}
                      </strong>
                    </div>
                  </div>
                  <div className="contract-guardrails" aria-label="Live provider guardrails">
                    <div>
                      <span className="status-light done" aria-hidden="true"></span>
                      <p>
                        <strong>Session key</strong>
                        {currentAnalysisRun.keyState === 'not-required'
                          ? 'No key is needed for local mock analysis.'
                          : 'Held only in this browser tab and never saved to the draft.'}
                      </p>
                    </div>
                    <div>
                      <span className="status-light next" aria-hidden="true"></span>
                      <p>
                        <strong>Live input limit</strong>
                        CV and job text are capped at {liveProviderInputLimitLabel} each before a live call.
                      </p>
                    </div>
                    <div>
                      <span className="status-light next" aria-hidden="true"></span>
                      <p>
                        <strong>Timeout fallback</strong>
                        Live calls wait {liveProviderTimeoutLabel}, then Rolefit keeps the local workflow available.
                      </p>
                    </div>
                  </div>
                  <div className="contract-fields">
                    {currentAnalysisRun.contract.outputFields.map((field) => (
                      <span key={field.field}>{field.field}</span>
                    ))}
                  </div>
                </div>
              )}
              <div className={`quality-gate-card ${qualityGate.status}`}>
                <div className="quality-gate-head">
                  <div>
                    <span className="section-kicker">Analysis quality gate</span>
                    <h3>{qualityGate.title}</h3>
                  </div>
                  <span className="quality-score-pill">{qualityGate.score}% checked</span>
                </div>
                <p>{qualityGate.detail}</p>
                <div className="quality-gate-list" aria-label="Analysis quality checks">
                  {qualityGate.items.map((item) => (
                    <div className={`quality-gate-item ${item.status}`} key={item.id}>
                      <span className={`status-light ${item.status}`} aria-hidden="true"></span>
                      <div>
                        <strong>{item.label}</strong>
                        <span>{statusLabels[item.status]} - {item.metric}</span>
                        <p>{item.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="evidence-map">
                <div className="panel-head">
                  <div>
                    <span className="section-kicker">Requirement evidence map</span>
                    <h3>Proof to use before rewriting</h3>
                  </div>
                  <button
                    className="icon-button action-button"
                    disabled={evidenceReviewed || !allRequirementsReviewed}
                    onClick={() => {
                      setEvidenceReviewedKey(evidenceReviewKey)
                      setEditedRewrite(rewriteFromAnalysis(analysis))
                      setEditedRewriteKey(evidenceReviewKey)
                      setRewriteDoneKey('')
                      setCoachDoneKey('')
                      setInterviewDoneKey('')
                      setPackDoneKey('')
                      setActiveTab('tailor')
                    }}
                    type="button"
                  >
                    <Check size={17} aria-hidden="true" />
                    <span>
                      {evidenceReviewed
                        ? 'Evidence map confirmed'
                        : allRequirementsReviewed
                          ? 'Confirm evidence map'
                          : `Review ${requirementTotal - reviewedRequirementCount} more`}
                    </span>
                  </button>
                </div>
                <div className={`review-progress ${evidenceReviewed ? 'done' : 'next'}`}>
                  <span className={`status-light ${evidenceReviewed ? 'done' : 'next'}`} aria-hidden="true"></span>
                  <div>
                    <strong>
                      {evidenceReviewed
                        ? 'All requirements checked'
                        : `${reviewedRequirementCount} of ${requirementTotal} requirements checked`}
                    </strong>
                    <span>Mark each requirement before the rewrite unlocks.</span>
                  </div>
                </div>
                <div className="requirement-list">
                  {analysis.requirementMap.map((item) => {
                    const reviewChoice = evidenceChoices[item.term]
                    return (
                      <article className={`requirement-card ${item.status}`} key={item.term}>
                        <span className={`status-light ${item.status === 'strong' ? 'done' : 'next'}`} aria-hidden="true"></span>
                        <div>
                          <strong>{item.term}</strong>
                          {item.status === 'strong' ? <p>{item.evidence}</p> : <p>No direct proof found in this CV yet.</p>}
                          <em>{item.nextAction}</em>
                          <div className="review-controls" role="group" aria-label={`Review ${item.term}`}>
                            {evidenceReviewOptions.map((option) => (
                              <button
                                className={[
                                  'review-option',
                                  option.status,
                                  reviewChoice === option.id ? 'selected' : '',
                                ]
                                  .filter(Boolean)
                                  .join(' ')}
                                key={option.id}
                                onClick={() => setEvidenceChoice(item.term, option.id)}
                                type="button"
                              >
                                <span className={`status-light ${option.status}`} aria-hidden="true"></span>
                                {option.label}
                              </button>
                            ))}
                          </div>
                          {reviewChoice && (
                            <span className="review-note">{evidenceReviewDetails[reviewChoice]}</span>
                          )}
                        </div>
                      </article>
                    )
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="analysis-panel pending-panel">
              <div className="pending-icon" aria-hidden="true">
                <SearchCheck size={24} />
              </div>
              <div>
                <span className="section-kicker">{importReady ? 'Orange next' : 'Red locked'}</span>
                <h3>{importReady ? 'Run analysis to unlock rewrite' : 'Add both inputs first'}</h3>
                <p>Later steps stay locked until the earlier work is complete. This keeps people from jumping to generic CV text.</p>
              </div>
            </div>
          )}
        </section>

        <section className="output-column" aria-label="Rewrite and coaching">
          <div className="tab-row" role="tablist" aria-label="Output modes">
            {tabs.map((tab) => {
              const TabIcon = tab.icon
              const enabled = canOpenTab(tab.id)
              return (
                <button
                  aria-selected={visibleTab === tab.id}
                  className={['tab', visibleTab === tab.id ? 'active' : '', enabled ? '' : 'blocked']
                    .filter(Boolean)
                    .join(' ')}
                  disabled={!enabled}
                  key={tab.id}
                  onClick={() => enabled && setActiveTab(tab.id)}
                  role="tab"
                  type="button"
                >
                  <TabIcon size={16} aria-hidden="true" />
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </div>

          {visibleTab === 'tailor' && !hasCurrentAnalysis && (
            <LockedPanel
              action={importReady ? 'Run analysis is orange. Do that next.' : 'Paste both inputs first.'}
              message="The rewrite step is locked so the app cannot create a generic CV before it understands the job."
              title="Targeted CV draft is locked"
            />
          )}

          {visibleTab === 'tailor' && hasCurrentAnalysis && !evidenceReviewed && (
            <LockedPanel
              action="Confirm the evidence map first."
              message="The CV rewrite waits until the role requirements have been checked against real proof from the CV."
              title="Targeted CV draft is locked"
            />
          )}

          {visibleTab === 'tailor' && evidenceReviewed && (
            <div className="output-panel">
              <div className="panel-head">
                <div>
                  <span className="section-kicker">Rewrite</span>
                  <h2>Targeted CV draft</h2>
                </div>
                <button className="icon-button" onClick={copyRewrite} type="button">
                  {copied === 'rewrite' ? <Check size={17} /> : <Clipboard size={17} />}
                  <span>{copied === 'rewrite' ? 'Copied' : copied === 'rewrite-error' ? 'Copy unavailable' : 'Copy'}</span>
                </button>
              </div>
              <div className="rewrite-editor">
                <label className="rewrite-field">
                  <span>Summary</span>
                  <textarea
                    aria-label="Rewrite summary"
                    onChange={(event) =>
                      updateRewriteDraft((current) => ({
                        ...current,
                        summary: event.target.value,
                      }))
                    }
                    rows={4}
                    value={rewriteDraft.summary}
                  />
                </label>

                <div className="rewrite-bullet-list">
                  {rewriteDraft.bullets.map((bullet, index) => (
                    <label className="rewrite-field" key={`bullet-${index}`}>
                      <span>Bullet {index + 1}</span>
                      <textarea
                        aria-label={`Rewrite bullet ${index + 1}`}
                        onChange={(event) =>
                          updateRewriteDraft((current) => ({
                            ...current,
                            bullets: current.bullets.map((item, itemIndex) =>
                              itemIndex === index ? event.target.value : item,
                            ),
                          }))
                        }
                        rows={3}
                        value={bullet}
                      />
                    </label>
                  ))}
                </div>

                <label className="rewrite-field">
                  <span>Positioning note</span>
                  <textarea
                    aria-label="Rewrite positioning note"
                    onChange={(event) =>
                      updateRewriteDraft((current) => ({
                        ...current,
                        note: event.target.value,
                      }))
                    }
                    rows={3}
                    value={rewriteDraft.note}
                  />
                </label>
              </div>

              <div className="claim-safety-panel" aria-label="Evidence warning lights" aria-live="polite">
                <div className="claim-safety-head">
                  <div>
                    <span className="section-kicker">Claim safety</span>
                    <strong>
                      {rewriteBlockedCount > 0
                        ? `${rewriteBlockedCount} red claim${rewriteBlockedCount === 1 ? '' : 's'} to fix`
                        : rewriteWarningCount > 0
                          ? `${rewriteWarningCount} orange claim${rewriteWarningCount === 1 ? '' : 's'} need proof`
                          : 'Every claim is backed by reviewed evidence'}
                    </strong>
                  </div>
                  <span className={`status-light ${rewriteHasBlockedClaim ? 'blocked' : rewriteWarningCount > 0 ? 'next' : 'done'}`} aria-hidden="true"></span>
                </div>
                <div className="claim-safety-list">
                  {rewriteSafety.map((item) => {
                    const blockedTerms = item.safety.terms.filter((term) => term.status === 'blocked')
                    const proofTerms = item.safety.terms.filter((term) => term.status === 'next')
                    const fixTerms = proofTerms.length > 0 ? proofTerms : item.safety.terms
                    const needsFix = item.safety.status !== 'done'

                    return (
                      <div className={`claim-safety-item ${item.safety.status}`} key={item.id}>
                        <span className={`status-light ${item.safety.status}`} aria-hidden="true"></span>
                        <div>
                          <strong>{item.label}</strong>
                          <span>{item.safety.label}</span>
                          <em>{item.safety.detail}</em>

                          {item.safety.terms.length > 0 ? (
                            <div className="claim-term-list" aria-label={`${item.label} matched terms`}>
                              {item.safety.terms.map((term) => (
                                <div className={`claim-term-chip ${term.status}`} key={term.term}>
                                  <span className={`status-light ${term.status}`} aria-hidden="true"></span>
                                  <strong>{term.term}</strong>
                                  <small>{term.label}</small>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="claim-empty">No role requirement is named in this line.</p>
                          )}

                          <p className="claim-suggestion">{item.safety.suggestion}</p>

                          {needsFix && (
                            <div className="claim-fix-actions" aria-label={`${item.label} fix actions`}>
                              {blockedTerms.length > 0 && (
                                <button
                                  className="claim-fix-button"
                                  onClick={() => removeUnsafeClaim(item)}
                                  type="button"
                                >
                                  <RefreshCw size={14} aria-hidden="true" />
                                  <span>Remove unsafe claim</span>
                                </button>
                              )}
                              <button
                                className="claim-fix-button"
                                onClick={() => applyHonestRewrite(item)}
                                type="button"
                              >
                                <Sparkles size={14} aria-hidden="true" />
                                <span>Rewrite honestly</span>
                              </button>
                              {fixTerms.length > 0 && (
                                <button
                                  className="claim-fix-button"
                                  onClick={() => addProofPromptToCv(fixTerms)}
                                  type="button"
                                >
                                  <FileText size={14} aria-hidden="true" />
                                  <span>Add proof to CV input</span>
                                </button>
                              )}
                              {blockedTerms.length > 0 && (
                                <button
                                  className="claim-fix-button"
                                  onClick={() => markClaimAsNeedsProof(blockedTerms)}
                                  type="button"
                                >
                                  <Check size={14} aria-hidden="true" />
                                  <span>Mark as needs proof</span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
              <button
                className="icon-button action-button"
                disabled={rewriteHasBlockedClaim}
                onClick={() => {
                  setRewriteDoneKey(rewriteReviewKey)
                  setActiveTab('coach')
                }}
                type="button"
              >
                <Check size={17} aria-hidden="true" />
                <span>
                  {rewriteDone ? 'Rewrite done' : rewriteHasBlockedClaim ? 'Resolve red claims' : 'Mark rewrite done'}
                </span>
              </button>
            </div>
          )}

          {visibleTab === 'coach' && (
            <div className="output-panel">
              <div className="panel-head">
                <div>
                  <span className="section-kicker">Interview coach</span>
                  <h2>Make the CV speakable</h2>
                </div>
                <Brain size={22} className="panel-icon" aria-hidden="true" />
              </div>
              <div className={`coach-readiness ${coachDone ? 'done' : 'next'}`}>
                <span className={`status-light ${coachDone ? 'done' : 'next'}`} aria-hidden="true"></span>
                <div>
                  <strong>{coachDone ? 'Coach pass complete' : 'Coach the story next'}</strong>
                  <span>Turn the rewrite into proof, gap handling, and a calm spoken version before practice.</span>
                </div>
              </div>
              <div className="coach-grid">
                <section className="coach-card">
                  <span className="section-kicker">Proof anchors</span>
                  <div className="coach-mini-list">
                    {analysis.evidence.length > 0 ? (
                      analysis.evidence.slice(0, 3).map((item) => (
                        <div className="coach-mini-item" key={item.term}>
                          <span className="status-light done" aria-hidden="true"></span>
                          <p>
                            <strong>{item.term}</strong>
                            {item.line}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="empty-copy">Add one proof line before relying on confidence language.</p>
                    )}
                  </div>
                </section>
                <section className="coach-card">
                  <span className="section-kicker">Gap handling</span>
                  <div className="coach-mini-list">
                    {analysis.gaps.length > 0 ? (
                      analysis.gaps.slice(0, 3).map((term) => (
                        <div className="coach-mini-item" key={term}>
                          <span className="status-light next" aria-hidden="true"></span>
                          <p>
                            <strong>{term}</strong>
                            Connect adjacent proof, name the limit, then say how you would close it.
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="empty-copy">No major mapped gaps. Keep the strongest examples specific.</p>
                    )}
                  </div>
                </section>
              </div>
              <div className="coach-list">
                {analysis.coaching.map((item) => (
                  <div className="coach-item" key={item}>
                    <ArrowRight size={16} aria-hidden="true" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
              <label className="confidence-meter">
                <span>Confidence</span>
                <input
                  max="100"
                  min="0"
                  onChange={(event) => setConfidence(Number(event.target.value))}
                  type="range"
                  value={confidence}
                />
                <strong>{confidence}%</strong>
              </label>
              <button
                className="icon-button action-button"
                onClick={() => {
                  setCoachDoneKey(rewriteReviewKey)
                  setActiveTab('interview')
                }}
                type="button"
              >
                <Check size={17} aria-hidden="true" />
                <span>{coachDone ? 'Coaching done' : 'Mark coaching done'}</span>
              </button>
            </div>
          )}

          {visibleTab === 'interview' && (
            <div className="output-panel interview-panel">
              <div className="panel-head">
                <div>
                  <span className="section-kicker">Mock interview</span>
                  <h2>Practice answer</h2>
                </div>
                <div className="interview-actions" aria-label="Interview pack export actions">
                  <button className="icon-button" onClick={() => downloadInterviewPack('md')} type="button">
                    {downloaded === 'interview-md' ? <Check size={17} /> : <Download size={17} />}
                    <span>
                      {downloaded === 'interview-md'
                        ? 'Saved .md'
                        : downloaded === 'interview-md-error'
                          ? 'Save failed'
                          : 'Interview .md'}
                    </span>
                  </button>
                  <button className="icon-button" onClick={() => downloadInterviewPack('txt')} type="button">
                    {downloaded === 'interview-txt' ? <Check size={17} /> : <FileText size={17} />}
                    <span>
                      {downloaded === 'interview-txt'
                        ? 'Saved .txt'
                        : downloaded === 'interview-txt-error'
                          ? 'Save failed'
                          : 'Interview .txt'}
                    </span>
                  </button>
                </div>
              </div>
              <div className="question-stack">
                {interviewQuestions.map((question, index) => (
                  <button
                    className={selectedQuestionIndex === index ? 'question active' : 'question'}
                    key={question.id}
                    onClick={() => setSelectedQuestion(index)}
                    type="button"
                  >
                    <span>Q{index + 1}</span>
                    <strong>{question.category}</strong>
                    {question.prompt}
                  </button>
                ))}
              </div>
              <div className={`question-brief ${selectedInterviewQuestion.status}`}>
                <span className={`status-light ${selectedInterviewQuestion.status}`} aria-hidden="true"></span>
                <div>
                  <strong>{selectedInterviewQuestion.focus}</strong>
                  <p>{selectedInterviewQuestion.proof}</p>
                  <em>{selectedInterviewQuestion.risk}</em>
                </div>
              </div>
              <div className="star-builder">
                <div className="panel-head compact">
                  <div>
                    <span className="section-kicker">STAR builder</span>
                    <h3>Build the spoken answer</h3>
                  </div>
                  <button
                    className="icon-button"
                    disabled={!starDraftHasContent(interviewStar)}
                    onClick={useStarAsAnswer}
                    type="button"
                  >
                    <Sparkles size={16} aria-hidden="true" />
                    <span>Use STAR</span>
                  </button>
                </div>
                <div className="star-grid">
                  {(['situation', 'task', 'action', 'result'] as const).map((field) => (
                    <label className="star-field" key={field}>
                      <span>{field}</span>
                      <textarea
                        aria-label={`STAR ${field}`}
                        onChange={(event) => updateInterviewStar(field, event.target.value)}
                        rows={3}
                        value={interviewStar[field]}
                      />
                    </label>
                  ))}
                </div>
              </div>
              <label className="answer-box">
                <span>{selectedInterviewQuestion.prompt}</span>
                <textarea
                  value={practiceAnswer}
                  onChange={(event) => setPracticeAnswer(event.target.value)}
                />
              </label>
              <div className="answer-score">
                <div>
                  <span className="section-kicker">Practice answer</span>
                  <strong>{answerScore}% ready</strong>
                </div>
                <p>
                  {answerReady
                    ? 'This is ready to mark complete. Keep it natural, specific, and honest.'
                    : 'Complete the STAR builder, use one CV proof line, and make the result clear.'}
                </p>
              </div>
              <div className="answer-feedback" aria-label="Answer coaching lights" aria-live="polite">
                {answerFeedback.map((item) => (
                  <div className={`answer-feedback-item ${item.status}`} key={item.id}>
                    <span className={`status-light ${item.status}`} aria-hidden="true"></span>
                    <div>
                      <strong>{item.label}</strong>
                      <span>{statusLabels[item.status]}</span>
                      <p>{item.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
              <button
                className="icon-button action-button"
                disabled={!answerReady}
                onClick={() => {
                  setInterviewDoneKey(practiceKey)
                  setActiveTab('pack')
                }}
                type="button"
              >
                <Check size={17} aria-hidden="true" />
                <span>{interviewDone ? 'Practice done' : 'Mark practice done'}</span>
              </button>
            </div>
          )}

          {visibleTab === 'pack' && (
            <div className="output-panel pack-panel">
              <div className="panel-head">
                <div>
                  <span className="section-kicker">Application pack</span>
                  <h2>Ready-to-apply notes</h2>
                </div>
                <div className="pack-actions" aria-label="Application pack export actions">
                  <button className="icon-button" onClick={copyPack} type="button">
                    {copied === 'pack' ? <Check size={17} /> : <Clipboard size={17} />}
                    <span>
                      {copied === 'pack' ? 'Copied' : copied === 'pack-error' ? 'Copy unavailable' : 'Copy'}
                    </span>
                  </button>
                  <button className="icon-button" onClick={() => downloadPack('md')} type="button">
                    {downloaded === 'md' ? <Check size={17} /> : <Download size={17} />}
                    <span>
                      {downloaded === 'md'
                        ? 'Saved .md'
                        : downloaded === 'md-error'
                          ? 'Save failed'
                          : 'Download .md'}
                    </span>
                  </button>
                  <button className="icon-button" onClick={() => downloadPack('txt')} type="button">
                    {downloaded === 'txt' ? <Check size={17} /> : <FileText size={17} />}
                    <span>
                      {downloaded === 'txt'
                        ? 'Saved .txt'
                        : downloaded === 'txt-error'
                          ? 'Save failed'
                          : 'Download .txt'}
                    </span>
                  </button>
                </div>
              </div>

              <div className={`pack-ready-strip ${packDone ? 'done' : 'next'}`}>
                <span className={`status-light ${packDone ? 'done' : 'next'}`} aria-hidden="true"></span>
                <div>
                  <strong>{packDone ? 'Pack ready' : 'Final check'}</strong>
                  <span>
                    {packDone
                      ? 'The CV direction, proof, gap handling, and interview answer are bundled.'
                      : 'Read this pack once before applying so the CV and interview story match.'}
                  </span>
                </div>
              </div>

              <div className="pack-grid">
                <section className="pack-card">
                  <span className="section-kicker">Role fit</span>
                  <strong>{analysis.score}% fit for {analysis.title}</strong>
                  <p>
                    {analysis.matched.length} proof areas mapped. {analysis.gaps.length} gap
                    {analysis.gaps.length === 1 ? '' : 's'} need an honest answer.
                  </p>
                </section>

                <section className="pack-card">
                  <span className="section-kicker">CV lead</span>
                  <strong>{phraseList(analysis.matched.slice(0, 3))}</strong>
                  <p>{rewriteDraft.summary}</p>
                </section>
              </div>

              <section className="pack-card">
                <span className="section-kicker">Proof lines</span>
                <div className="pack-list">
                  {analysis.evidence.slice(0, 4).map((item) => (
                    <div className="pack-list-item" key={item.term}>
                      <span className="status-light done" aria-hidden="true"></span>
                      <p>
                        <strong>{item.term}</strong>
                        {item.line}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="pack-card">
                <span className="section-kicker">Gap talk-track</span>
                {analysis.gaps.length > 0 ? (
                  <div className="pack-list">
                    {analysis.gaps.slice(0, 4).map((term) => (
                      <div className="pack-list-item" key={term}>
                        <span className="status-light next" aria-hidden="true"></span>
                        <p>
                          <strong>{term}</strong>
                          Connect nearby proof, name the gap calmly, and explain how you would close it.
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>No obvious role-language gaps. Keep the claims specific and interview-safe.</p>
                )}
              </section>

              <section className="pack-card">
                <span className="section-kicker">Evidence review</span>
                <div className="pack-list">
                  {analysis.requirementMap.slice(0, 6).map((item) => {
                    const choice = evidenceChoices[item.term] ?? 'needs-proof'
                    return (
                      <div className="pack-list-item" key={item.term}>
                        <span className={`status-light ${evidenceReviewStatuses[choice]}`} aria-hidden="true"></span>
                        <p>
                          <strong>{item.term}</strong>
                          {evidenceReviewLabels[choice]}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </section>

              <section className="pack-card story-card">
                <span className="section-kicker">Interview anchor</span>
                <strong>{selectedInterviewQuestion.prompt}</strong>
                <blockquote>{practiceAnswer.trim()}</blockquote>
                <p>Confidence: {confidence}%. Use this as the calm version, not a script to recite word for word.</p>
              </section>

              <section className="pack-card">
                <span className="section-kicker">Interview coach lights</span>
                <div className="pack-list">
                  {answerFeedback.map((item) => (
                    <div className="pack-list-item" key={item.id}>
                      <span className={`status-light ${item.status}`} aria-hidden="true"></span>
                      <p>
                        <strong>{item.label}</strong>
                        {statusLabels[item.status]} - {item.detail}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <button
                className="icon-button action-button"
                onClick={() => setPackDoneKey(practiceKey)}
                type="button"
              >
                <Check size={17} aria-hidden="true" />
                <span>{packDone ? 'Pack ready' : 'Mark pack ready'}</span>
              </button>
            </div>
          )}
        </section>
      </div>
      )}
    </main>
  )
}

export default App
