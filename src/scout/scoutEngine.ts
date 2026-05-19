export type ScoutWorkPreference = 'any' | 'remote' | 'hybrid' | 'on-site'

export type ScoutJob = {
  id: string
  text: string
  title: string
}

export type ParsedScoutJob = {
  text: string
  title: string
}

export type ScoutProfile = {
  cvText: string
  location: string
  preferredRoles: string
  qualifications: string
  refusedRoles: string
  salaryFloor: string
  selfDescription: string
  travelRadius: string
  workPreference: ScoutWorkPreference
}

export type ScoutMatchStatus = 'green' | 'amber' | 'red' | 'black'
export type ScoutSignalStatus = ScoutMatchStatus

export type ScoutRequirementCategory = 'mandatory' | 'preferred' | 'responsibility'

export type ScoutRequirement = {
  category: ScoutRequirementCategory
  detail: string
  evidence: string
  status: 'green' | 'amber' | 'red'
  term: string
}

export type ScoutCheck = {
  detail: string
  label: string
  status: ScoutSignalStatus
}

export type ScoutSignalGroup = {
  id: 'mandatory' | 'preferred' | 'responsibilities' | 'pay' | 'work-pattern' | 'warnings'
  items: ScoutCheck[]
  label: string
  status: ScoutSignalStatus
}

export type ScoutMatch = {
  employerQuestions: string[]
  evidenceTerms: string[]
  job: ScoutJob
  missingTerms: string[]
  requirementMap: ScoutRequirement[]
  score: number
  scoreBreakdown: ScoutCheck[]
  signalGroups: ScoutSignalGroup[]
  status: ScoutMatchStatus
  statusLabel: string
  summary: string
  warnings: string[]
}

const roleTerms = [
  'account management',
  'administration',
  'automation',
  'cleaning',
  'communication',
  'complaints',
  'crm',
  'customer service',
  'data',
  'delivery',
  'documentation',
  'driving licence',
  'excel',
  'finance',
  'first aid',
  'forklift',
  'health and safety',
  'hospitality',
  'inventory',
  'leadership',
  'manufacturing',
  'operations',
  'project management',
  'reporting',
  'retail',
  'risk',
  'sales',
  'scheduling',
  'stakeholder',
  'stock control',
  'support',
  'training',
  'warehouse',
  'writing',
] as const

type RoleTerm = (typeof roleTerms)[number]

const credentialTerms = [
  'cscs card',
  'dbs check',
  'degree',
  'forklift licence',
  'gcse',
  'nvq',
  'sia licence',
] as const

const termAliases: Partial<Record<RoleTerm, readonly string[]>> = {
  'account management': ['account health', 'client accounts', 'clients after onboarding'],
  administration: ['admin', 'office support', 'paperwork'],
  cleaning: ['cleaner', 'hygiene', 'housekeeping'],
  communication: ['call handling', 'calm escalation', 'explained', 'language'],
  complaints: ['complaint handling', 'refund risk', 'escalation'],
  'customer service': ['customer support', 'customer problems', 'customers', 'service'],
  delivery: ['driver', 'driving', 'deliveries'],
  documentation: ['process notes', 'notes', 'documented'],
  'driving licence': ['driver licence', 'driving license', 'driver license', 'full uk licence'],
  excel: ['spreadsheets', 'sheets'],
  forklift: ['flt', 'fork lift'],
  'health and safety': ['h&s', 'safe working', 'safety'],
  inventory: ['stock', 'stockroom'],
  stakeholder: ['warehouse', 'finance', 'sales teams', 'managers', 'cross-functional'],
  'stock control': ['stock taking', 'stock counts', 'inventory'],
  support: ['helping', 'supported', 'supporting'],
  training: ['trained', 'new starters', 'onboarding'],
}

const cautionPatterns = [
  {
    label: 'Agency listing',
    regex: /\b(recruitment agency|agency work|temp agency|temporary agency)\b/i,
    severity: 'warning',
  },
  {
    label: 'Temporary role',
    regex: /\b(temp|temporary|ongoing temporary|seasonal)\b/i,
    severity: 'warning',
  },
  {
    label: 'Competitive salary only',
    regex: /\bcompetitive salary\b/i,
    severity: 'warning',
  },
  {
    label: 'Immediate start pressure',
    regex: /\b(immediate start|start tomorrow|start asap)\b/i,
    severity: 'warning',
  },
  {
    label: 'Own transport warning',
    regex: /\b(own transport|own vehicle|must drive|car required)\b/i,
    severity: 'warning',
  },
  {
    label: 'Zero hours',
    regex: /\bzero[-\s]?hours?\b/i,
    severity: 'hard',
  },
  {
    label: 'Commission only',
    regex: /\bcommission only\b/i,
    severity: 'hard',
  },
  {
    label: 'Umbrella payroll',
    regex: /\bumbrella\b/i,
    severity: 'hard',
  },
  {
    label: 'Self-employed terms',
    regex: /\bself[-\s]?employed\b/i,
    severity: 'hard',
  },
  {
    label: 'Pay-to-work warning',
    regex: /\b(training fee|pay for your own|must pay|admin fee)\b/i,
    severity: 'hard',
  },
  {
    label: 'Unclear earning claim',
    regex: /\b(earn up to|uncapped earnings|no experience needed)\b/i,
    severity: 'hard',
  },
] as const

const mandatoryPattern =
  /\b(must have|required|essential|minimum|valid|licence|license|qualification|certificate|certification|need|needs)\b/i
const preferredPattern = /\b(preferred|desirable|nice to have|bonus|advantage|beneficial|ideally|would help)\b/i
const responsibilityPattern =
  /\b(you will|responsible for|day to day|duties|role involves|role includes|will include|tasks include|main duties|handle|manage|support|prepare|maintain|deliver|build|create|work with|report|document)\b/i
const salaryContextPattern =
  /\b(pay|salary|rate|wage|wages|hourly|annual|annum|per annum|per year|per hour|hr|ph|gbp|earn|earning|package)\b|(?:\u00a3)/i
const workPatternUnknownPattern = /\b(flexible|shift|shifts|rota|weekend|evening|night)\b/i

function normalise(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function textContains(text: string, candidate: string) {
  const safeCandidate = escapeRegex(normalise(candidate))
  return safeCandidate.length > 0 && new RegExp(`\\b${safeCandidate}\\b`).test(normalise(text))
}

function unique(items: readonly string[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = normalise(item)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function termCandidates(term: string) {
  if ((roleTerms as readonly string[]).includes(term)) {
    return [term, ...(termAliases[term as RoleTerm] ?? [])]
  }

  return [term]
}

function termMatches(text: string, term: string) {
  return termCandidates(term).some((candidate) => textContains(text, candidate))
}

function extractKnownTerms(text: string) {
  return unique([
    ...roleTerms.filter((term) => termMatches(text, term)),
    ...credentialTerms.filter((term) => termMatches(text, term)),
  ])
}

function splitSentences(text: string) {
  return text
    .split(/\n|(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function titleForJob(text: string) {
  const title = text
    .split('\n')
    .map((line) => line.trim().replace(/^(job|role|advert|vacancy)\s*\d{0,2}\s*[:-]\s*/i, ''))
    .find(Boolean)

  if (!title) return 'Untitled job advert'
  return title.length <= 72 ? title : `${title.slice(0, 69).trim()}...`
}

export function parseScoutJobAdverts(input: string): ParsedScoutJob[] {
  const cleaned = input.trim()
  if (!cleaned) return []

  const dividerChunks = cleaned.split(/\n\s*(?:-{3,}|={3,}|\*{3,})\s*\n/g)
  const markerChunks = cleaned.split(/\n(?=(?:job|role|advert|vacancy)\s*\d{0,2}\s*[:-])/i)
  const chunks = dividerChunks.length > 1 ? dividerChunks : markerChunks.length > 1 ? markerChunks : [cleaned]

  return chunks
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length >= 30)
    .map((chunk) => ({
      text: chunk,
      title: titleForJob(chunk),
    }))
}

function profileText(profile: ScoutProfile) {
  return [
    profile.cvText,
    profile.selfDescription,
    profile.qualifications,
    profile.preferredRoles,
    profile.location,
  ].join('\n')
}

function splitPhrases(text: string) {
  return text
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter((item) => normalise(item).length >= 3)
}

function matchingPhrases(text: string, phrases: readonly string[]) {
  return phrases.filter((phrase) => textContains(text, phrase))
}

function sentenceForTerm(text: string, term: string) {
  const sentences = splitSentences(text)
  const candidates = termCandidates(term).slice().sort((left, right) => normalise(right).length - normalise(left).length)

  for (const candidate of candidates) {
    const match = sentences.find((line) => textContains(line, candidate))
    if (match) return match
  }

  return ''
}

type JobSignals = {
  allTerms: string[]
  mandatoryTerms: string[]
  preferredTerms: string[]
  responsibilityTerms: string[]
}

function termsFromSentences(sentences: readonly string[], pattern: RegExp) {
  return unique(sentences.filter((line) => pattern.test(line)).flatMap((line) => extractKnownTerms(line)))
}

function extractJobSignals(jobText: string): JobSignals {
  const sentences = splitSentences(jobText)
  const allTerms = extractKnownTerms(jobText)
  const mandatoryTerms = termsFromSentences(sentences, mandatoryPattern)
  const preferredTerms = termsFromSentences(sentences, preferredPattern).filter((term) => !mandatoryTerms.includes(term))
  const responsibilityTerms = unique([
    ...termsFromSentences(sentences, responsibilityPattern),
    ...allTerms.filter((term) => !mandatoryTerms.includes(term) && !preferredTerms.includes(term)),
  ]).filter((term) => !mandatoryTerms.includes(term) && !preferredTerms.includes(term))

  return {
    allTerms,
    mandatoryTerms,
    preferredTerms,
    responsibilityTerms,
  }
}

type SalaryValue = {
  period: 'hour' | 'year'
  value: number
}

function salaryFragments(text: string, allowLooseNumbers: boolean) {
  if (allowLooseNumbers) return [text]

  return splitSentences(text).filter((line) => salaryContextPattern.test(line))
}

function parseSalary(text: string, allowLooseNumbers = false): SalaryValue | null {
  const fragments = salaryFragments(text, allowLooseNumbers)
  const scopedText = fragments.join('\n')
  const hourly = [
    ...scopedText.matchAll(/(?:\u00a3|\bgbp\s*)?\s*(\d{1,3}(?:\.\d{1,2})?)\s*(?:per\s*)?(?:hour|hr|ph)\b/gi),
  ]
    .map((match) => Number(match[1]))
    .filter((value) => value >= 1)

  if (hourly.length > 0) {
    return { period: 'hour', value: Math.min(...hourly) }
  }

  const annualValues = [
    ...[...scopedText.matchAll(/(?:\u00a3|\bgbp\s*)\s*(\d{2,3}(?:,\d{3})+|\d{5,6})\b/gi)].map((match) =>
      Number(match[1].replace(/,/g, '')),
    ),
    ...[...scopedText.matchAll(/\b(\d{2,3})\s?k\b/gi)].map((match) => Number(match[1]) * 1000),
    ...[...scopedText.matchAll(/\b(\d{5,6})\b/g)].map((match) => Number(match[1])),
  ].filter((value) => value >= 1000)

  if (annualValues.length > 0) {
    return { period: 'year', value: Math.min(...annualValues) }
  }

  return null
}

function salaryLabel(salary: SalaryValue) {
  return salary.period === 'hour'
    ? `GBP ${salary.value}/hour`
    : `GBP ${Math.round(salary.value).toLocaleString()}/year`
}

function payCheckFor(profile: ScoutProfile, jobText: string): ScoutCheck {
  const salaryFloor = parseSalary(profile.salaryFloor, true)
  const jobSalary = parseSalary(jobText)

  if (salaryFloor && jobSalary && salaryFloor.period === jobSalary.period && jobSalary.value < salaryFloor.value) {
    return {
      detail: `${salaryLabel(jobSalary)} shown, below ${salaryLabel(salaryFloor)} wanted.`,
      label: 'Pay below floor',
      status: 'black',
    }
  }

  if (salaryFloor && jobSalary && salaryFloor.period === jobSalary.period) {
    return {
      detail: `${salaryLabel(jobSalary)} appears to meet the user's floor.`,
      label: 'Pay meets floor',
      status: 'green',
    }
  }

  if (salaryFloor && jobSalary && salaryFloor.period !== jobSalary.period) {
    return {
      detail: `${salaryLabel(jobSalary)} found, but it cannot be compared cleanly with ${salaryLabel(salaryFloor)}.`,
      label: 'Pay needs checking',
      status: 'amber',
    }
  }

  if (salaryFloor && !jobSalary) {
    return {
      detail: `The advert does not show a clear pay figure against ${salaryLabel(salaryFloor)}.`,
      label: 'Pay not clear',
      status: 'amber',
    }
  }

  if (/\bcompetitive salary\b/i.test(jobText)) {
    return {
      detail: 'The advert says competitive salary but does not give a clear figure.',
      label: 'Competitive salary',
      status: 'amber',
    }
  }

  if (jobSalary) {
    return {
      detail: `${salaryLabel(jobSalary)} is visible in the advert.`,
      label: 'Pay visible',
      status: 'green',
    }
  }

  return {
    detail: 'The advert does not show a clear pay figure.',
    label: 'Pay not shown',
    status: 'amber',
  }
}

function workPatternCheckFor(profile: ScoutProfile, jobText: string): ScoutCheck {
  const jobMentionsRemote = /\b(remote|work from home|wfh)\b/i.test(jobText)
  const jobMentionsHybrid = /\bhybrid\b/i.test(jobText)
  const jobMentionsOnSite = /\b(on[-\s]?site|onsite|site based|office based|warehouse|factory|retail store)\b/i.test(jobText)

  if (profile.workPreference === 'any') {
    return {
      detail: jobMentionsRemote || jobMentionsHybrid || jobMentionsOnSite ? 'The advert gives some work-pattern signal.' : 'No work-pattern preference set.',
      label: 'Work pattern flexible',
      status: 'green',
    }
  }

  if (profile.workPreference === 'remote' && jobMentionsOnSite && !jobMentionsRemote) {
    return {
      detail: 'The advert looks site-based, but the user prefers remote work.',
      label: 'Remote mismatch',
      status: 'red',
    }
  }

  if (profile.workPreference === 'on-site' && jobMentionsRemote && !jobMentionsOnSite) {
    return {
      detail: 'The advert looks remote, but the user prefers on-site work.',
      label: 'On-site mismatch',
      status: 'red',
    }
  }

  if (profile.workPreference === 'hybrid' && jobMentionsHybrid) {
    return {
      detail: 'Hybrid work is named in the advert.',
      label: 'Hybrid match',
      status: 'green',
    }
  }

  if (profile.workPreference === 'remote' && jobMentionsRemote) {
    return {
      detail: 'Remote work is named in the advert.',
      label: 'Remote match',
      status: 'green',
    }
  }

  if (profile.workPreference === 'on-site' && jobMentionsOnSite) {
    return {
      detail: 'On-site work is named in the advert.',
      label: 'On-site match',
      status: 'green',
    }
  }

  if (workPatternUnknownPattern.test(jobText)) {
    return {
      detail: 'The advert mentions shifts or flexibility, so hours should be checked.',
      label: 'Pattern needs checking',
      status: 'amber',
    }
  }

  return {
    detail: `The advert does not clearly confirm ${profile.workPreference} work.`,
    label: 'Pattern not clear',
    status: 'amber',
  }
}

function requirementForTerm({
  candidateText,
  category,
  isMatched,
  term,
}: {
  candidateText: string
  category: ScoutRequirementCategory
  isMatched: boolean
  term: string
}): ScoutRequirement {
  const evidence = sentenceForTerm(candidateText, term)
  const status = isMatched ? 'green' : category === 'mandatory' ? 'red' : 'amber'

  return {
    category,
    detail: isMatched
      ? 'Use this as proof in the application.'
      : category === 'mandatory'
        ? 'This looks mandatory and is not proven yet.'
        : category === 'preferred'
          ? 'This is an extra advantage if the user can prove it.'
          : 'This core responsibility needs stronger proof or honest adjacent wording.',
    evidence,
    status,
    term,
  }
}

function checkForRequirement(requirement: ScoutRequirement): ScoutCheck {
  return {
    detail: requirement.evidence || requirement.detail,
    label: requirement.term,
    status: requirement.status === 'green' ? 'green' : requirement.status === 'red' ? 'red' : 'amber',
  }
}

function groupStatus(items: readonly ScoutCheck[], emptyStatus: ScoutSignalStatus = 'amber'): ScoutSignalStatus {
  if (items.length === 0) return emptyStatus
  if (items.some((item) => item.status === 'black')) return 'black'
  if (items.some((item) => item.status === 'red')) return 'red'
  if (items.some((item) => item.status === 'amber')) return 'amber'
  return 'green'
}

function coverageCheck(label: string, matchedCount: number, totalCount: number, missingIsRed = false): ScoutCheck {
  if (totalCount === 0) {
    return {
      detail: 'No clear terms were extracted for this section.',
      label,
      status: 'amber',
    }
  }

  if (matchedCount === totalCount) {
    return {
      detail: `${matchedCount}/${totalCount} proven.`,
      label,
      status: 'green',
    }
  }

  if (matchedCount > 0) {
    return {
      detail: `${matchedCount}/${totalCount} proven; strengthen the missing proof before applying.`,
      label,
      status: 'amber',
    }
  }

  return {
    detail: `0/${totalCount} proven.`,
    label,
    status: missingIsRed ? 'red' : 'amber',
  }
}

function statusLabel(status: ScoutMatchStatus) {
  if (status === 'green') return 'Green - strong proof fit'
  if (status === 'amber') return 'Amber - possible fit'
  if (status === 'red') return 'Red - proof gap'
  return 'Black - avoid or challenge'
}

function summaryFor({
  evidenceTerms,
  missingMandatory,
  missingResponsibilities,
  status,
  warnings,
}: {
  evidenceTerms: string[]
  missingMandatory: string[]
  missingResponsibilities: string[]
  status: ScoutMatchStatus
  warnings: string[]
}) {
  if (status === 'black') {
    return `Do not treat this as a good opportunity until the warning is answered: ${warnings[0] ?? 'bad conditions'}.`
  }

  if (status === 'red') {
    return `This advert asks for mandatory proof the profile does not currently show: ${missingMandatory.slice(0, 3).join(', ') || missingResponsibilities.slice(0, 3).join(', ')}.`
  }

  if (status === 'green') {
    return `This looks worth attention because the profile can already prove ${evidenceTerms.slice(0, 4).join(', ')}.`
  }

  return `This could be worth applying for, but the CV or advert needs more clarity around ${[
    ...missingMandatory,
    ...missingResponsibilities,
  ].slice(0, 3).join(', ') || 'pay, pattern, or role proof'}.`
}

function employerQuestions({
  missingMandatory,
  payCheck,
  warnings,
  workPatternCheck,
}: {
  missingMandatory: readonly string[]
  payCheck: ScoutCheck
  warnings: readonly string[]
  workPatternCheck: ScoutCheck
}) {
  const questions: string[] = []

  if (warnings.some((warning) => /agency|umbrella|self-employed/i.test(warning))) {
    questions.push('Is this employed directly by the company, through an agency, or through umbrella payroll?')
  }

  if (payCheck.status !== 'green') {
    questions.push('Can you confirm the real pay range and hours before interview?')
  }

  if (workPatternCheck.status !== 'green') {
    questions.push('Can you confirm the working pattern, location, shifts, and travel expectations?')
  }

  if (missingMandatory.length > 0) {
    questions.push(`Are ${missingMandatory.slice(0, 2).join(' and ')} essential on day one or trainable?`)
  }

  questions.push('Which two requirements matter most in the first month?')
  questions.push('What evidence would make you confident this person can do the job?')

  return questions.slice(0, 4)
}

function scoreMatch({
  hardWarnings,
  mandatoryMatched,
  mandatoryTotal,
  payCheck,
  preferredMatched,
  preferredTotal,
  responsibilityMatched,
  responsibilityTotal,
  warnings,
  workPatternCheck,
}: {
  hardWarnings: readonly string[]
  mandatoryMatched: number
  mandatoryTotal: number
  payCheck: ScoutCheck
  preferredMatched: number
  preferredTotal: number
  responsibilityMatched: number
  responsibilityTotal: number
  warnings: readonly string[]
  workPatternCheck: ScoutCheck
}) {
  const mandatoryScore = mandatoryTotal === 0 ? 20 : Math.round((mandatoryMatched / mandatoryTotal) * 28)
  const responsibilityScore =
    responsibilityTotal === 0 ? 14 : Math.round((responsibilityMatched / responsibilityTotal) * 34)
  const preferredScore = preferredTotal === 0 ? 4 : Math.round((preferredMatched / preferredTotal) * 10)
  const payAdjustment = payCheck.status === 'green' ? 6 : payCheck.status === 'black' ? -34 : -6
  const workAdjustment = workPatternCheck.status === 'green' ? 6 : workPatternCheck.status === 'red' ? -18 : -5
  const warningPenalty = warnings.length * 4 + hardWarnings.length * 24

  return Math.min(
    96,
    Math.max(8, 18 + mandatoryScore + responsibilityScore + preferredScore + payAdjustment + workAdjustment - warningPenalty),
  )
}

export function buildScoutMatches(profile: ScoutProfile, jobs: readonly ScoutJob[]): ScoutMatch[] {
  const candidateText = profileText(profile)
  const candidateTerms = extractKnownTerms(candidateText)
  const preferredPhrases = splitPhrases(profile.preferredRoles)
  const refusedPhrases = splitPhrases(profile.refusedRoles)

  const matches = jobs.map((job) => {
    const jobSignals = extractJobSignals(job.text)
    const matchingPreferred = matchingPhrases(job.text, preferredPhrases)
    const matchingRefused = matchingPhrases(job.text, refusedPhrases)
    const cautionHits = cautionPatterns.filter((pattern) => pattern.regex.test(job.text))
    const hardWarnings: string[] = cautionHits.filter((pattern) => pattern.severity === 'hard').map((pattern) => pattern.label)
    const softWarnings: string[] = cautionHits.filter((pattern) => pattern.severity === 'warning').map((pattern) => pattern.label)
    const payCheck = payCheckFor(profile, job.text)
    const workPatternCheck = workPatternCheckFor(profile, job.text)

    if (matchingRefused.length > 0) {
      hardWarnings.push(`Refused role match: ${matchingRefused.slice(0, 2).join(', ')}`)
    }

    if (payCheck.status === 'black') {
      hardWarnings.push(payCheck.label)
    } else if (payCheck.status === 'amber') {
      softWarnings.push(payCheck.label)
    }

    if (workPatternCheck.status === 'red') {
      softWarnings.push(workPatternCheck.label)
    } else if (workPatternCheck.status === 'amber') {
      softWarnings.push(workPatternCheck.label)
    }

    if (preferredPhrases.length > 0 && matchingPreferred.length === 0) {
      softWarnings.push('Does not clearly match preferred role types')
    }

    const mandatoryRequirements = jobSignals.mandatoryTerms.map((term) =>
      requirementForTerm({
        candidateText,
        category: 'mandatory',
        isMatched: candidateTerms.some((candidateTerm) => normalise(candidateTerm) === normalise(term)),
        term,
      }),
    )
    const preferredRequirements = jobSignals.preferredTerms.map((term) =>
      requirementForTerm({
        candidateText,
        category: 'preferred',
        isMatched: candidateTerms.some((candidateTerm) => normalise(candidateTerm) === normalise(term)),
        term,
      }),
    )
    const responsibilityRequirements = jobSignals.responsibilityTerms.map((term) =>
      requirementForTerm({
        candidateText,
        category: 'responsibility',
        isMatched: candidateTerms.some((candidateTerm) => normalise(candidateTerm) === normalise(term)),
        term,
      }),
    )
    const requirementMap = [...mandatoryRequirements, ...responsibilityRequirements, ...preferredRequirements]
    const evidenceTerms = requirementMap.filter((item) => item.status === 'green').map((item) => item.term)
    const missingMandatory = mandatoryRequirements.filter((item) => item.status !== 'green').map((item) => item.term)
    const missingResponsibilities = responsibilityRequirements
      .filter((item) => item.status !== 'green')
      .map((item) => item.term)
    const missingPreferred = preferredRequirements.filter((item) => item.status !== 'green').map((item) => item.term)
    const missingTerms = unique([...missingMandatory, ...missingResponsibilities, ...missingPreferred])
    const allWarnings = unique([...hardWarnings, ...softWarnings])
    const mandatoryMatched = mandatoryRequirements.filter((item) => item.status === 'green').length
    const responsibilityMatched = responsibilityRequirements.filter((item) => item.status === 'green').length
    const preferredMatched = preferredRequirements.filter((item) => item.status === 'green').length
    const score = scoreMatch({
      hardWarnings,
      mandatoryMatched,
      mandatoryTotal: mandatoryRequirements.length,
      payCheck,
      preferredMatched,
      preferredTotal: preferredRequirements.length,
      responsibilityMatched,
      responsibilityTotal: responsibilityRequirements.length,
      warnings: softWarnings,
      workPatternCheck,
    })
    const mandatoryCoverage = coverageCheck(
      'Mandatory proof',
      mandatoryMatched,
      mandatoryRequirements.length,
      true,
    )
    const responsibilityCoverage = coverageCheck(
      'Responsibilities',
      responsibilityMatched,
      responsibilityRequirements.length,
    )
    const preferredCoverage = coverageCheck('Preferred extras', preferredMatched, preferredRequirements.length)
    const warningCheck: ScoutCheck =
      hardWarnings.length > 0
        ? {
            detail: `${hardWarnings.length} hard warning${hardWarnings.length === 1 ? '' : 's'} found.`,
            label: 'Hard warnings',
            status: 'black',
          }
        : softWarnings.length > 0
          ? {
              detail: `${softWarnings.length} check${softWarnings.length === 1 ? '' : 's'} before applying.`,
              label: 'Warnings',
              status: 'amber',
            }
          : {
              detail: 'No bad-condition signals found.',
              label: 'Warnings',
              status: 'green',
            }
    const scoreBreakdown = [mandatoryCoverage, responsibilityCoverage, preferredCoverage, payCheck, workPatternCheck, warningCheck]
    const status: ScoutMatchStatus =
      hardWarnings.length > 0 || payCheck.status === 'black'
        ? 'black'
        : missingMandatory.length > 0 || workPatternCheck.status === 'red'
          ? 'red'
          : score >= 74 && responsibilityCoverage.status === 'green' && payCheck.status === 'green'
            ? 'green'
            : score >= 45
              ? 'amber'
              : 'red'
    const signalGroups: ScoutSignalGroup[] = [
      {
        id: 'mandatory',
        items:
          mandatoryRequirements.length > 0
            ? mandatoryRequirements.map(checkForRequirement)
            : [{ detail: 'No mandatory requirement language detected.', label: 'Mandatory proof', status: 'amber' }],
        label: 'Mandatory proof',
        status: groupStatus(mandatoryRequirements.map(checkForRequirement)),
      },
      {
        id: 'responsibilities',
        items:
          responsibilityRequirements.length > 0
            ? responsibilityRequirements.map(checkForRequirement)
            : [{ detail: 'No clear responsibility language detected.', label: 'Responsibilities', status: 'amber' }],
        label: 'Responsibilities',
        status: groupStatus(responsibilityRequirements.map(checkForRequirement)),
      },
      {
        id: 'preferred',
        items:
          preferredRequirements.length > 0
            ? preferredRequirements.map(checkForRequirement)
            : [{ detail: 'No preferred or bonus requirements detected.', label: 'Preferred extras', status: 'green' }],
        label: 'Preferred extras',
        status: groupStatus(preferredRequirements.map(checkForRequirement), 'green'),
      },
      {
        id: 'pay',
        items: [payCheck],
        label: 'Pay check',
        status: payCheck.status,
      },
      {
        id: 'work-pattern',
        items: [workPatternCheck],
        label: 'Work pattern',
        status: workPatternCheck.status,
      },
      {
        id: 'warnings',
        items:
          allWarnings.length > 0
            ? allWarnings.map((warning) => ({
                detail: hardWarnings.includes(warning) ? 'Hard warning: question or avoid this role.' : 'Check this before applying.',
                label: warning,
                status: hardWarnings.includes(warning) ? 'black' : 'amber',
              }))
            : [{ detail: 'No agency/payroll/scam-style warning found.', label: 'Warnings', status: 'green' }],
        label: 'Warnings',
        status: warningCheck.status,
      },
    ]

    return {
      employerQuestions: employerQuestions({
        missingMandatory,
        payCheck,
        warnings: allWarnings,
        workPatternCheck,
      }),
      evidenceTerms,
      job,
      missingTerms,
      requirementMap,
      score,
      scoreBreakdown,
      signalGroups,
      status,
      statusLabel: statusLabel(status),
      summary: summaryFor({
        evidenceTerms,
        missingMandatory,
        missingResponsibilities,
        status,
        warnings: allWarnings,
      }),
      warnings: allWarnings,
    } satisfies ScoutMatch
  })

  const statusRank: Record<ScoutMatchStatus, number> = {
    green: 0,
    amber: 1,
    red: 2,
    black: 3,
  }

  return matches.slice().sort((left, right) => statusRank[left.status] - statusRank[right.status] || right.score - left.score)
}
