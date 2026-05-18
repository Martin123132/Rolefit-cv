import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
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

type SavedDraft = {
  confidence: number
  cvText: string
  jobText: string
  model: string
  practiceAnswer: string
  provider: ProviderId
}

type EvidenceItem = {
  term: SkillTerm
  line: string
}

type RequirementEvidence = {
  term: SkillTerm
  status: 'strong' | 'missing'
  evidence: string
  nextAction: string
}

type Analysis = {
  title: string
  score: number
  matched: SkillTerm[]
  gaps: SkillTerm[]
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

const modelOptions: Record<ProviderId, string[]> = {
  mock: ['Rolefit demo model', 'Fast local draft'],
  openai: ['GPT model', 'GPT reasoning model', 'Custom OpenAI model'],
  claude: ['Claude model', 'Claude fast model', 'Custom Claude model'],
  gemini: ['Gemini model', 'Gemini fast model', 'Custom Gemini model'],
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

function loadSavedDraft(): Partial<SavedDraft> {
  if (typeof window === 'undefined') return {}

  try {
    const saved = window.localStorage.getItem(draftStorageKey)
    if (!saved) return {}

    const parsed = JSON.parse(saved) as Partial<SavedDraft>
    const provider = isProviderId(parsed.provider) ? parsed.provider : undefined
    const model =
      provider && typeof parsed.model === 'string' && modelOptions[provider].includes(parsed.model)
        ? parsed.model
        : undefined

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
  const termHits = analysis.matched.filter((term) => answerTerms.includes(term)).length
  const lengthScore = Math.min(35, Math.floor(answer.trim().length / 14))
  const evidenceScore = Math.min(40, termHits * 12)
  const confidenceScore = Math.round(confidence / 5)
  return Math.min(100, lengthScore + evidenceScore + confidenceScore)
}

function applicationPackText(analysis: Analysis, practiceAnswer: string, confidence: number) {
  return [
    `Rolefit CV application pack: ${analysis.title}`,
    '',
    `Fit score: ${analysis.score}%`,
    `Proof areas: ${phraseList(analysis.matched.slice(0, 6))}`,
    analysis.gaps.length > 0 ? `Gaps to handle honestly: ${phraseList(analysis.gaps.slice(0, 4))}` : 'Gaps to handle honestly: none found in the mapped role language',
    '',
    'Targeted CV direction',
    analysis.rewrite.summary,
    ...analysis.rewrite.bullets.map((bullet) => `- ${bullet}`),
    analysis.rewrite.note,
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

function App() {
  const [savedDraft] = useState(() => loadSavedDraft())
  const [provider, setProvider] = useState<ProviderId>(savedDraft.provider ?? 'mock')
  const [model, setModel] = useState(
    savedDraft.model ?? modelOptions[savedDraft.provider ?? 'mock'][0],
  )
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
  const [evidenceReviewedKey, setEvidenceReviewedKey] = useState('')
  const [rewriteDoneKey, setRewriteDoneKey] = useState('')
  const [coachDoneKey, setCoachDoneKey] = useState('')
  const [interviewDoneKey, setInterviewDoneKey] = useState('')
  const [packDoneKey, setPackDoneKey] = useState('')

  const inputKey = useMemo(
    () => `${cvText.trim()}\n---rolefit-job---\n${jobText.trim()}`,
    [cvText, jobText],
  )
  const analysisKey = useMemo(
    () => `${inputKey}\n---rolefit-provider---\n${provider}\n---rolefit-model---\n${model}`,
    [inputKey, model, provider],
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
  const practiceKey = useMemo(
    () => `${analysisKey}\n---rolefit-answer---\n${practiceAnswer.trim()}\n---confidence---\n${confidence}`,
    [analysisKey, confidence, practiceAnswer],
  )
  const packText = useMemo(
    () => applicationPackText(analysis, practiceAnswer, confidence),
    [analysis, confidence, practiceAnswer],
  )
  const selectedProvider = providers.find((item) => item.id === provider) ?? providers[0]
  const hasCurrentAnalysis = Boolean(currentAnalysisRun)
  const evidenceReviewed = hasCurrentAnalysis && evidenceReviewedKey === analysisKey
  const rewriteDone = evidenceReviewed && rewriteDoneKey === analysisKey
  const coachDone = rewriteDone && coachDoneKey === analysisKey
  const answerReady = practiceAnswer.trim().length >= 80 && answerScore >= 45
  const interviewDone = coachDone && interviewDoneKey === practiceKey
  const packDone = interviewDone && packDoneKey === practiceKey
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
              ? 'Review and confirm the evidence map.'
              : importReady
                ? 'Run analysis to map proof against the role.'
                : 'Add both documents first.'
        }
        if (step.id === 'rewrite') {
          status = rewriteDone ? 'done' : evidenceReviewed ? 'next' : 'blocked'
          detail = rewriteDone
            ? 'Targeted rewrite has been marked done.'
            : evidenceReviewed
              ? 'Review the rewrite and mark it done.'
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
    [coachDone, evidenceReviewed, hasCurrentAnalysis, importReady, interviewDone, packDone, rewriteDone],
  )
  const nextStep = guidedSteps.find((step) => step.status === 'next') ?? guidedSteps.at(-1)!

  useEffect(() => {
    if (typeof window === 'undefined') return

    const draft: SavedDraft = {
      confidence,
      cvText,
      jobText,
      model,
      practiceAnswer,
      provider,
    }
    window.localStorage.setItem(draftStorageKey, JSON.stringify(draft))
  }, [confidence, cvText, jobText, model, practiceAnswer, provider])

  function handleProviderChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextProvider = event.target.value as ProviderId
    setProvider(nextProvider)
    setModel(modelOptions[nextProvider][0])
  }

  async function runAnalysis() {
    if (!importReady || isAnalysing) return

    setIsAnalysing(true)
    setAnalysisError('')

    try {
      const nextAnalysis = buildAnalysis(cvText, jobText)
      const nextRun = await runRolefitProvider({
        analysis: nextAnalysis,
        apiKey,
        cvText,
        jobText,
        model,
        provider,
      })

      setAnalysisRun(nextRun)
      setAnalysisRunKey(analysisKey)
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
      analysis.rewrite.summary,
      '',
      ...analysis.rewrite.bullets.map((bullet) => `- ${bullet}`),
      '',
      analysis.rewrite.note,
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
            <select value={model} onChange={(event) => setModel(event.target.value)}>
              {modelOptions[provider].map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="field key-field">
            <span>Your API key</span>
            <div className="key-input">
              <KeyRound size={16} aria-hidden="true" />
              <input
                autoComplete="off"
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="Paste key for real calls later"
                type="password"
                value={apiKey}
              />
            </div>
          </label>
          <div className="provider-status">
            <Lock size={15} aria-hidden="true" />
            <span>{apiKey ? 'Session key ready' : selectedProvider.note}</span>
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
            <button className="icon-button action-button" disabled={!importReady || isAnalysing} onClick={runAnalysis} type="button">
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
            <label className="editor-panel">
              <span className="editor-title">
                <FileText size={17} aria-hidden="true" />
                CV
              </span>
              <textarea value={cvText} onChange={(event) => setCvText(event.target.value)} />
            </label>
            <label className="editor-panel">
              <span className="editor-title">
                <BriefcaseBusiness size={17} aria-hidden="true" />
                Job advert
              </span>
              <textarea value={jobText} onChange={(event) => setJobText(event.target.value)} />
            </label>
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
                    disabled={evidenceReviewed}
                    onClick={() => {
                      setEvidenceReviewedKey(analysisKey)
                      setActiveTab('tailor')
                    }}
                    type="button"
                  >
                    <Check size={17} aria-hidden="true" />
                    <span>{evidenceReviewed ? 'Evidence map confirmed' : 'Confirm evidence map'}</span>
                  </button>
                </div>
                <div className="requirement-list">
                  {analysis.requirementMap.map((item) => (
                    <article className={`requirement-card ${item.status}`} key={item.term}>
                      <span className={`status-light ${item.status === 'strong' ? 'done' : 'next'}`} aria-hidden="true"></span>
                      <div>
                        <strong>{item.term}</strong>
                        {item.status === 'strong' ? <p>{item.evidence}</p> : <p>No direct proof found in this CV yet.</p>}
                        <em>{item.nextAction}</em>
                      </div>
                    </article>
                  ))}
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
              <div className="generated-copy">
                <p>{analysis.rewrite.summary}</p>
                <ul>
                  {analysis.rewrite.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
                <p>{analysis.rewrite.note}</p>
              </div>
              <button
                className="icon-button action-button"
                onClick={() => {
                  setRewriteDoneKey(analysisKey)
                  setActiveTab('coach')
                }}
                type="button"
              >
                <Check size={17} aria-hidden="true" />
                <span>{rewriteDone ? 'Rewrite done' : 'Mark rewrite done'}</span>
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
                  setCoachDoneKey(analysisKey)
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
                  <p>{analysis.rewrite.summary}</p>
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
