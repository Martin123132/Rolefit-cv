import { useEffect, useMemo, useState, type ChangeEvent, type DragEvent } from 'react'
import {
  ArrowRight,
  Brain,
  BriefcaseBusiness,
  Check,
  Clipboard,
  FileText,
  KeyRound,
  Lock,
  MessageSquareText,
  Mic,
  RefreshCw,
  SearchCheck,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
  type LucideIcon,
} from 'lucide-react'
import {
  runRolefitProvider,
  type ProviderId,
  type ProviderRunResult,
} from './ai/rolefitProvider'
import './App.css'

type TabId = 'tailor' | 'coach' | 'interview' | 'pack'
type StepId = 'import' | 'analyse' | 'rewrite' | 'coach' | 'interview' | 'pack'
type StepStatus = 'done' | 'next' | 'blocked'
type EvidenceReviewChoice = 'true' | 'needs-proof' | 'do-not-claim'
type ImportTarget = 'cv' | 'job'
type ImportStatus = {
  message: string
  state: 'idle' | 'done' | 'error'
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

type SavedDraft = {
  confidence: number
  cvText: string
  jobText: string
  model: string
  practiceAnswer: string
  provider: ProviderId
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

const providers: Array<{ id: ProviderId; label: string; note: string }> = [
  { id: 'mock', label: 'Local mock', note: 'No request sent' },
  { id: 'openai', label: 'OpenAI', note: 'Bring your key' },
  { id: 'claude', label: 'Claude', note: 'Bring your key' },
  { id: 'gemini', label: 'Gemini', note: 'Bring your key' },
]

const draftStorageKey = 'rolefit-cv-draft-v1'
const maxImportBytes = 64 * 1024
const importAccept = '.txt,.md,.markdown'
const importExtensions = new Set(['.txt', '.md', '.markdown'])

const importTargetLabels: Record<ImportTarget, string> = {
  cv: 'CV',
  job: 'job advert',
}

const emptyImportStatus: ImportStatus = {
  message: '',
  state: 'idle',
}

const modelOptions: Record<ProviderId, string[]> = {
  mock: ['Rolefit demo model', 'Fast local draft'],
  openai: ['gpt-5', 'gpt-4o', 'gpt-4o-mini'],
  claude: ['claude-sonnet-4-20250514', 'claude-opus-4-1-20250805', 'claude-3-7-sonnet-20250219'],
  gemini: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
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

function importExtension(filename: string) {
  const trimmed = filename.trim().toLowerCase()
  const dotIndex = trimmed.lastIndexOf('.')
  return dotIndex >= 0 ? trimmed.slice(dotIndex) : ''
}

function isSupportedImportFile(file: File) {
  return importExtensions.has(importExtension(file.name))
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

function readImportedText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()

    reader.onerror = () => reject(new Error('This file could not be read.'))
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }

      reject(new Error('This file did not contain readable text.'))
    }

    reader.readAsText(file)
  })
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
      jobText: typeof parsed.jobText === 'string' ? parsed.jobText : undefined,
      model,
      practiceAnswer: typeof parsed.practiceAnswer === 'string' ? parsed.practiceAnswer : undefined,
      provider,
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

function scoreAnswer(answer: string, analysis: Analysis, confidence: number) {
  const answerTerms = extractTerms(answer)
  const termHits = analysis.matched.filter(
    (term) => answerTerms.includes(term as SkillTerm) || textContains(answer, term),
  ).length
  const lengthScore = Math.min(35, Math.floor(answer.trim().length / 14))
  const evidenceScore = Math.min(40, termHits * 12)
  const confidenceScore = Math.round(confidence / 5)
  return Math.min(100, lengthScore + evidenceScore + confidenceScore)
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

function applicationPackText(
  analysis: Analysis,
  rewrite: RewriteDraft,
  practiceAnswer: string,
  confidence: number,
  evidenceChoices: Record<string, EvidenceReviewChoice>,
) {
  const reviewLines = analysis.requirementMap.map((item) => {
    const choice = evidenceChoices[item.term] ?? 'needs-proof'
    return `- ${item.term}: ${evidenceReviewLabels[choice]}`
  })

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
    'Interview anchor',
    practiceAnswer.trim(),
    '',
    `Confidence check: ${confidence}%`,
    'Before applying: read every claim out loud and remove anything you cannot explain calmly in an interview.',
  ].join('\n')
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
        <span>Drop .txt or .md</span>
      </div>
      {status.state !== 'idle' && (
        <div className={`import-status ${status.state}`} role={status.state === 'error' ? 'alert' : 'status'}>
          <span className={`status-light ${status.state === 'done' ? 'done' : 'blocked'}`} aria-hidden="true"></span>
          <span>{status.message}</span>
        </div>
      )}
    </div>
  )
}

function App() {
  const [savedDraft] = useState(() => loadSavedDraft())
  const initialProvider = savedDraft.provider ?? 'mock'
  const [provider, setProvider] = useState<ProviderId>(initialProvider)
  const [model, setModel] = useState(savedDraft.model ?? modelOptions[initialProvider][0])
  const [apiKey, setApiKey] = useState('')
  const [cvText, setCvText] = useState(savedDraft.cvText ?? seedCv)
  const [jobText, setJobText] = useState(savedDraft.jobText ?? seedJob)
  const [activeTab, setActiveTab] = useState<TabId>('tailor')
  const [selectedQuestion, setSelectedQuestion] = useState(0)
  const [practiceAnswer, setPracticeAnswer] = useState(
    savedDraft.practiceAnswer ??
      'In customer service I handled delayed order problems by communicating clearly with customers, updating CRM notes, and working with warehouse, sales, and finance stakeholders. I used reporting to spot refund risk, documented the process, and trained new starters so the support team could stay consistent during busy weeks.',
  )
  const [confidence, setConfidence] = useState(savedDraft.confidence ?? 62)
  const [lastRun, setLastRun] = useState('Ready')
  const [copied, setCopied] = useState<string | null>(null)
  const [analysisRun, setAnalysisRun] = useState<ProviderRunResult<Analysis> | null>(null)
  const [analysisRunKey, setAnalysisRunKey] = useState('')
  const [analysisError, setAnalysisError] = useState('')
  const [isAnalysing, setIsAnalysing] = useState(false)
  const [importStatuses, setImportStatuses] = useState<Record<ImportTarget, ImportStatus>>({
    cv: emptyImportStatus,
    job: emptyImportStatus,
  })
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
  const hasCv = cvText.trim().length >= 60
  const hasJob = jobText.trim().length >= 60
  const importReady = hasCv && hasJob
  const draftAnalysis = useMemo(() => buildAnalysis(cvText, jobText), [cvText, jobText])
  const currentAnalysisRun = importReady && analysisRunKey === analysisKey ? analysisRun : null
  const analysis = currentAnalysisRun?.analysis ?? draftAnalysis
  const answerScore = useMemo(
    () => scoreAnswer(practiceAnswer, analysis, confidence),
    [analysis, confidence, practiceAnswer],
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
    () => `${rewriteReviewKey}\n---rolefit-answer---\n${practiceAnswer.trim()}\n---confidence---\n${confidence}`,
    [confidence, practiceAnswer, rewriteReviewKey],
  )
  const packText = useMemo(
    () => applicationPackText(analysis, rewriteDraft, practiceAnswer, confidence, evidenceChoices),
    [analysis, confidence, evidenceChoices, practiceAnswer, rewriteDraft],
  )
  const answerReady = practiceAnswer.trim().length >= 80 && answerScore >= 45
  const interviewDone = coachDone && interviewDoneKey === practiceKey
  const packDone = interviewDone && packDoneKey === practiceKey
  const providerStatus =
    analysisError && apiKey.trim()
      ? {
          detail: 'The last live request failed. The key stays in this browser session only.',
          label: 'Live request failed',
          status: 'blocked' as StepStatus,
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
                detail: 'Stored in memory for this tab, not saved in the draft.',
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
      jobText,
      model: selectedModel,
      practiceAnswer,
      provider,
    }
    window.localStorage.setItem(draftStorageKey, JSON.stringify(draft))
  }, [confidence, cvText, jobText, practiceAnswer, provider, selectedModel])

  function handleProviderChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextProvider = event.target.value as ProviderId
    setProvider(nextProvider)
    setModel(modelOptions[nextProvider][0])
    setAnalysisError('')
  }

  function handleModelChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextModel = event.target.value
    setModel(nextModel === customModelOption ? '' : nextModel)
    setAnalysisError('')
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

  async function handleImportFile(target: ImportTarget, file: File) {
    const targetLabel = importTargetLabels[target]

    if (!isSupportedImportFile(file)) {
      setImportStatuses((current) => ({
        ...current,
        [target]: {
          message: `${file.name} is not supported. Use .txt, .md, or .markdown.`,
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

    if (file.size > maxImportBytes) {
      setImportStatuses((current) => ({
        ...current,
        [target]: {
          message: `${file.name} is larger than 64 KB.`,
          state: 'error',
        },
      }))
      return
    }

    try {
      const importedText = await readImportedText(file)
      const cleanedText = importedText.trim()

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

      setAnalysisError('')
      setActiveTab('tailor')
      setImportStatuses((current) => ({
        ...current,
        [target]: {
          message: `Loaded ${file.name} into ${targetLabel}.`,
          state: 'done',
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

  async function runAnalysis() {
    if (!importReady || !modelReady || isAnalysing) return

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
      setActiveTab('tailor')
      setLastRun(
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
                }}
                placeholder="Paste key for real calls later"
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
            <button className="icon-button action-button" disabled={!importReady || !modelReady || isAnalysing} onClick={runAnalysis} type="button">
              <RefreshCw size={17} aria-hidden="true" />
              <span>{isAnalysing ? 'Analysing' : 'Run analysis'}</span>
            </button>
          </div>

          {analysisError && (
            <div className="error-strip" role="alert">
              <span className="status-light blocked" aria-hidden="true"></span>
              <span>{analysisError}</span>
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
              <textarea aria-label="CV" value={cvText} onChange={(event) => setCvText(event.target.value)} />
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
              <textarea aria-label="Job advert" value={jobText} onChange={(event) => setJobText(event.target.value)} />
            </div>
          </div>

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
                  <div className="contract-fields">
                    {currentAnalysisRun.contract.outputFields.map((field) => (
                      <span key={field.field}>{field.field}</span>
                    ))}
                  </div>
                </div>
              )}
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
                <MessageSquareText size={22} className="panel-icon" aria-hidden="true" />
              </div>
              <div className="question-stack">
                {analysis.questions.map((question, index) => (
                  <button
                    className={selectedQuestion === index ? 'question active' : 'question'}
                    key={question}
                    onClick={() => setSelectedQuestion(index)}
                    type="button"
                  >
                    <span>Q{index + 1}</span>
                    {question}
                  </button>
                ))}
              </div>
              <label className="answer-box">
                <span>{analysis.questions[selectedQuestion]}</span>
                <textarea value={practiceAnswer} onChange={(event) => setPracticeAnswer(event.target.value)} />
              </label>
              <div className="answer-score">
                <div>
                  <span className="section-kicker">Practice answer</span>
                  <strong>{answerScore}% ready</strong>
                </div>
                <p>
                  {answerReady
                    ? 'This is ready to mark complete. Keep it natural, specific, and honest.'
                    : 'Add a specific situation, action, result, and one sentence on what you learned.'}
                </p>
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
                <button className="icon-button" onClick={copyPack} type="button">
                  {copied === 'pack' ? <Check size={17} /> : <Clipboard size={17} />}
                  <span>{copied === 'pack' ? 'Copied' : copied === 'pack-error' ? 'Copy unavailable' : 'Copy pack'}</span>
                </button>
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
                <blockquote>{practiceAnswer.trim()}</blockquote>
                <p>Confidence: {confidence}%. Use this as the calm version, not a script to recite word for word.</p>
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
    </main>
  )
}

export default App
