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

export type ScoutRequirement = {
  detail: string
  evidence: string
  status: 'green' | 'amber' | 'red'
  term: string
}

export type ScoutMatch = {
  employerQuestions: string[]
  evidenceTerms: string[]
  job: ScoutJob
  missingTerms: string[]
  requirementMap: ScoutRequirement[]
  score: number
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
  const sentences = text
    .split(/\n|(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter(Boolean)
  const candidates = termCandidates(term).slice().sort((left, right) => normalise(right).length - normalise(left).length)

  for (const candidate of candidates) {
    const match = sentences.find((line) => textContains(line, candidate))
    if (match) return match
  }

  return ''
}

function termAppearsNearMandatory(jobText: string, term: string) {
  return jobText
    .split(/\n|(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .some((line) => mandatoryPattern.test(line) && termMatches(line, term))
}

type SalaryValue = {
  period: 'hour' | 'year'
  value: number
}

function parseSalary(text: string): SalaryValue | null {
  const hourly = [...text.matchAll(/(?:\u00a3|\bgbp\s*)?\s*(\d{1,3}(?:\.\d{1,2})?)\s*(?:per\s*)?(?:hour|hr|ph)\b/gi)]
    .map((match) => Number(match[1]))
    .filter((value) => value >= 1)

  if (hourly.length > 0) {
    return { period: 'hour', value: Math.min(...hourly) }
  }

  const annualValues = [
    ...[...text.matchAll(/(?:\u00a3|\bgbp\s*)\s*(\d{2,3}(?:,\d{3})+|\d{5,6})\b/gi)].map((match) =>
      Number(match[1].replace(/,/g, '')),
    ),
    ...[...text.matchAll(/\b(\d{2,3})\s?k\b/gi)].map((match) => Number(match[1]) * 1000),
    ...[...text.matchAll(/\b(\d{5,6})\b/g)].map((match) => Number(match[1])),
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

function workPreferenceWarning(profile: ScoutProfile, jobText: string) {
  const jobMentionsRemote = /\b(remote|work from home|wfh)\b/i.test(jobText)
  const jobMentionsHybrid = /\bhybrid\b/i.test(jobText)
  const jobMentionsOnSite = /\b(on[-\s]?site|onsite|site based|office based|warehouse|factory|retail store)\b/i.test(jobText)

  if (profile.workPreference === 'remote' && jobMentionsOnSite && !jobMentionsRemote) {
    return 'Work pattern may not match remote preference'
  }

  if (profile.workPreference === 'on-site' && jobMentionsRemote && !jobMentionsOnSite) {
    return 'Work pattern may not match on-site preference'
  }

  if (profile.workPreference === 'hybrid' && !jobMentionsHybrid && (jobMentionsRemote || jobMentionsOnSite)) {
    return 'Hybrid preference is not clearly offered'
  }

  return ''
}

function statusLabel(status: ScoutMatchStatus) {
  if (status === 'green') return 'Green - strong proof fit'
  if (status === 'amber') return 'Amber - possible fit'
  if (status === 'red') return 'Red - proof gap'
  return 'Black - avoid or challenge'
}

function summaryFor(status: ScoutMatchStatus, evidenceTerms: string[], missingTerms: string[], warnings: string[]) {
  if (status === 'black') {
    return `Do not treat this as a good opportunity until the warning is answered: ${warnings[0] ?? 'bad conditions'}.`
  }

  if (status === 'red') {
    return `This advert asks for proof the profile does not currently show: ${missingTerms.slice(0, 3).join(', ')}.`
  }

  if (status === 'green') {
    return `This looks worth attention because the profile can already prove ${evidenceTerms.slice(0, 4).join(', ')}.`
  }

  return `This could be worth applying for, but the CV needs clearer proof around ${missingTerms.slice(0, 3).join(', ') || 'the role requirements'}.`
}

function employerQuestions({
  missingMandatory,
  salaryFloor,
  salaryWarning,
  warnings,
}: {
  missingMandatory: readonly string[]
  salaryFloor: SalaryValue | null
  salaryWarning: string
  warnings: readonly string[]
}) {
  const questions: string[] = []

  if (warnings.some((warning) => /agency|umbrella|self-employed/i.test(warning))) {
    questions.push('Is this employed directly by the company, through an agency, or through umbrella payroll?')
  }

  if (salaryWarning) {
    questions.push(
      salaryFloor
        ? `Can you confirm the pay is at or above ${salaryLabel(salaryFloor)} before interview?`
        : 'Can you confirm the real pay range and hours before interview?',
    )
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
  jobTerms,
  matchingPreferred,
  matched,
  missingMandatory,
  warnings,
}: {
  hardWarnings: readonly string[]
  jobTerms: readonly string[]
  matchingPreferred: readonly string[]
  matched: readonly string[]
  missingMandatory: readonly string[]
  warnings: readonly string[]
}) {
  const base = jobTerms.length === 0 ? 42 : 36 + Math.round((matched.length / jobTerms.length) * 54)
  const bonus = matchingPreferred.length > 0 ? 7 : 0
  const penalty = warnings.length * 5 + missingMandatory.length * 18 + hardWarnings.length * 28

  return Math.min(96, Math.max(8, base + bonus - penalty))
}

export function buildScoutMatches(profile: ScoutProfile, jobs: readonly ScoutJob[]): ScoutMatch[] {
  const candidateText = profileText(profile)
  const candidateTerms = extractKnownTerms(candidateText)
  const preferredPhrases = splitPhrases(profile.preferredRoles)
  const refusedPhrases = splitPhrases(profile.refusedRoles)
  const salaryFloor = parseSalary(profile.salaryFloor)

  const matches = jobs.map((job) => {
    const jobTerms = extractKnownTerms(job.text)
    const evidenceTerms = jobTerms.filter((term) => candidateTerms.some((candidateTerm) => normalise(candidateTerm) === normalise(term)))
    const missingTerms = jobTerms.filter((term) => !evidenceTerms.includes(term))
    const missingMandatory = missingTerms.filter((term) => termAppearsNearMandatory(job.text, term))
    const matchingPreferred = matchingPhrases(job.text, preferredPhrases)
    const matchingRefused = matchingPhrases(job.text, refusedPhrases)
    const cautionHits = cautionPatterns.filter((pattern) => pattern.regex.test(job.text))
    const hardWarnings: string[] = cautionHits.filter((pattern) => pattern.severity === 'hard').map((pattern) => pattern.label)
    const warnings: string[] = unique(cautionHits.map((pattern) => pattern.label))
    const jobSalary = parseSalary(job.text)
    const salaryWarning =
      salaryFloor && jobSalary && salaryFloor.period === jobSalary.period && jobSalary.value < salaryFloor.value
        ? `Pay appears below floor (${salaryLabel(jobSalary)} shown, ${salaryLabel(salaryFloor)} wanted)`
        : salaryFloor && !jobSalary
          ? 'Pay is not clear against the salary floor'
          : ''
    const preferenceWarning = workPreferenceWarning(profile, job.text)

    if (matchingRefused.length > 0) {
      hardWarnings.push(`Refused role match: ${matchingRefused.slice(0, 2).join(', ')}`)
    }

    if (salaryWarning.includes('below floor')) {
      hardWarnings.push(salaryWarning)
    } else if (salaryWarning) {
      warnings.push(salaryWarning)
    }

    if (preferenceWarning) {
      warnings.push(preferenceWarning)
    }

    if (preferredPhrases.length > 0 && matchingPreferred.length === 0) {
      warnings.push('Does not clearly match preferred role types')
    }

    const score = scoreMatch({
      hardWarnings,
      jobTerms,
      matchingPreferred,
      matched: evidenceTerms,
      missingMandatory,
      warnings,
    })
    const status: ScoutMatchStatus =
      hardWarnings.length > 0
        ? 'black'
        : missingMandatory.length > 0
          ? 'red'
          : score >= 74 && missingTerms.length <= Math.max(2, Math.floor(jobTerms.length / 3))
            ? 'green'
            : score >= 48
              ? 'amber'
              : 'red'

    const allWarnings = unique([...hardWarnings, ...warnings])
    const requirementMap = jobTerms.map((term) => {
      const evidence = sentenceForTerm(candidateText, term)
      const isMatched = evidenceTerms.includes(term)
      const isMandatoryGap = missingMandatory.includes(term)

      return {
        detail: isMatched
          ? 'Use this as proof in the application.'
          : isMandatoryGap
            ? 'This looks mandatory and is not proven yet.'
            : 'This may be trainable or adjacent, but it needs honest wording.',
        evidence,
        status: isMatched ? 'green' : isMandatoryGap ? 'red' : 'amber',
        term,
      } satisfies ScoutRequirement
    })

    return {
      employerQuestions: employerQuestions({
        missingMandatory,
        salaryFloor,
        salaryWarning,
        warnings: allWarnings,
      }),
      evidenceTerms,
      job,
      missingTerms,
      requirementMap,
      score,
      status,
      statusLabel: statusLabel(status),
      summary: summaryFor(status, evidenceTerms, missingTerms, allWarnings),
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
