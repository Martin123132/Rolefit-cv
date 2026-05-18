export type QualityGateStatus = 'done' | 'next' | 'blocked'

export type QualityGateAnalysis = {
  coaching: readonly string[]
  evidence: readonly {
    line: string
    term: string
  }[]
  gaps: readonly string[]
  matched: readonly string[]
  questions: readonly string[]
  requirementMap: readonly {
    evidence: string
    nextAction: string
    status: 'strong' | 'missing'
    term: string
  }[]
  rewrite: {
    bullets: readonly string[]
    note: string
    summary: string
  }
  score: number
  title: string
}

export type QualityGateItem = {
  detail: string
  id: string
  label: string
  metric: string
  status: QualityGateStatus
}

export type QualityGateResult = {
  detail: string
  items: QualityGateItem[]
  score: number
  status: QualityGateStatus
  title: string
}

const roleTerms = [
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

const termAliases: Partial<Record<(typeof roleTerms)[number], readonly string[]>> = {
  'account management': ['account health', 'client accounts', 'clients after onboarding'],
  communication: ['call handling', 'calm escalation', 'explained', 'language'],
  'customer service': ['customer support', 'customer problems', 'customers', 'service'],
  documentation: ['process notes', 'notes', 'documented'],
  stakeholder: ['warehouse', 'finance', 'sales teams', 'managers', 'cross-functional'],
  support: ['helping', 'supported', 'supporting'],
  training: ['trained', 'new starters', 'onboarding'],
}

const cautionWords = /\b(gap|bridge|leave|until|proof|adjacent|honest|handle|close|not yet|missing|needs)\b/i

function normalise(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function textContains(text: string, candidate: string) {
  const safeCandidate = normalise(candidate).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return safeCandidate.length > 0 && new RegExp(`\\b${safeCandidate}\\b`).test(normalise(text))
}

function termCandidates(term: (typeof roleTerms)[number]) {
  return [term, ...(termAliases[term] ?? [])]
}

function extractRoleTerms(text: string) {
  return roleTerms.filter((term) => termCandidates(term).some((candidate) => textContains(text, candidate)))
}

function uniqueNormalisedTexts(lines: readonly string[]) {
  const seen = new Set<string>()
  return lines
    .map((line) => line.trim())
    .filter((line) => {
      const key = normalise(line)
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function lineAppearsInSource(sourceText: string, line: string) {
  const source = normalise(sourceText)
  const candidate = normalise(line)

  if (!candidate) return false
  if (source.includes(candidate)) return true

  const anchor = candidate.split(' ').slice(0, 10).join(' ')
  return anchor.length >= 24 && source.includes(anchor)
}

function gateStatus(items: QualityGateItem[]): QualityGateStatus {
  if (items.some((item) => item.status === 'blocked')) return 'blocked'
  if (items.every((item) => item.status === 'done')) return 'done'
  return 'next'
}

function gateScore(items: QualityGateItem[]) {
  const total = items.reduce((score, item) => {
    if (item.status === 'done') return score + 100
    if (item.status === 'next') return score + 55
    return score
  }, 0)

  return Math.round(total / Math.max(items.length, 1))
}

function contractCompleteness(analysis: QualityGateAnalysis): QualityGateItem {
  const checks = [
    analysis.title.trim().length > 0,
    Number.isFinite(analysis.score),
    Array.isArray(analysis.matched),
    Array.isArray(analysis.gaps),
    analysis.evidence.length > 0,
    analysis.requirementMap.length > 0,
    analysis.rewrite.summary.trim().length > 0,
    analysis.rewrite.bullets.some((bullet) => bullet.trim().length > 0),
    analysis.questions.length > 0,
    analysis.coaching.length > 0,
  ]
  const passed = checks.filter(Boolean).length

  return {
    detail:
      passed === checks.length
        ? 'The provider output has all Rolefit sections needed for the workflow.'
        : 'Some Rolefit sections are thin or missing, so later steps may be weaker.',
    id: 'contract',
    label: 'Contract completeness',
    metric: `${passed}/${checks.length} sections`,
    status: passed === checks.length ? 'done' : passed >= 7 ? 'next' : 'blocked',
  }
}

function evidenceGrounding(analysis: QualityGateAnalysis, cvText: string): QualityGateItem {
  const evidenceLines = uniqueNormalisedTexts([
    ...analysis.evidence.map((item) => item.line),
    ...analysis.requirementMap.filter((item) => item.status === 'strong').map((item) => item.evidence),
  ])
  const grounded = evidenceLines.filter((line) => lineAppearsInSource(cvText, line)).length

  if (evidenceLines.length === 0) {
    return {
      detail: 'No direct CV evidence lines were returned.',
      id: 'grounding',
      label: 'CV grounding',
      metric: '0 evidence lines',
      status: 'blocked',
    }
  }

  return {
    detail:
      grounded === evidenceLines.length
        ? 'Every direct evidence line can be traced back to the CV text.'
        : grounded > 0
          ? 'Some evidence is grounded, but at least one line could not be found in the CV.'
          : 'Evidence lines could not be traced back to the CV text.',
    id: 'grounding',
    label: 'CV grounding',
    metric: `${grounded}/${evidenceLines.length} lines found`,
    status: grounded === evidenceLines.length ? 'done' : grounded > 0 ? 'next' : 'blocked',
  }
}

function roleCoverage(analysis: QualityGateAnalysis, jobText: string): QualityGateItem {
  const jobTerms = extractRoleTerms(jobText)
  const mappedTerms = analysis.requirementMap.map((item) => item.term)
  const covered = jobTerms.filter((term) => mappedTerms.some((mappedTerm) => textContains(mappedTerm, term) || textContains(term, mappedTerm))).length

  if (jobTerms.length === 0) {
    return {
      detail: 'The job advert has no known Rolefit terms, so coverage should be checked manually.',
      id: 'coverage',
      label: 'Role coverage',
      metric: 'manual check',
      status: 'next',
    }
  }

  return {
    detail:
      covered === jobTerms.length
        ? 'The analysis mapped every recognised role requirement.'
        : covered > 0
          ? 'The analysis mapped some role requirements, but missed recognised job language.'
          : 'The analysis did not map the recognised role requirements.',
    id: 'coverage',
    label: 'Role coverage',
    metric: `${covered}/${jobTerms.length} terms mapped`,
    status: covered === jobTerms.length ? 'done' : covered > 0 ? 'next' : 'blocked',
  }
}

function gapHonesty(analysis: QualityGateAnalysis): QualityGateItem {
  const missingRequirements = analysis.requirementMap.filter((item) => item.status === 'missing').map((item) => item.term)
  const gapsInMap = analysis.gaps.filter((gap) => analysis.requirementMap.some((item) => textContains(item.term, gap) || textContains(gap, item.term)))
  const matchedGapConflicts = analysis.gaps.filter((gap) => analysis.matched.some((matched) => textContains(matched, gap) || textContains(gap, matched)))

  if (matchedGapConflicts.length > 0) {
    return {
      detail: 'A requirement appears as both matched and missing, so it needs review before the user trusts it.',
      id: 'gaps',
      label: 'Gap honesty',
      metric: `${matchedGapConflicts.length} conflict${matchedGapConflicts.length === 1 ? '' : 's'}`,
      status: 'blocked',
    }
  }

  if (missingRequirements.length > 0 && gapsInMap.length === 0) {
    return {
      detail: 'The map has missing requirements, but the gap list does not explain them.',
      id: 'gaps',
      label: 'Gap honesty',
      metric: `${missingRequirements.length} missing`,
      status: 'next',
    }
  }

  return {
    detail:
      missingRequirements.length > 0
        ? 'Missing requirements are carried through as gaps instead of being hidden.'
        : 'No mapped missing requirements were found.',
    id: 'gaps',
    label: 'Gap honesty',
    metric: missingRequirements.length > 0 ? `${gapsInMap.length}/${missingRequirements.length} gaps named` : 'no mapped gaps',
    status: 'done',
  }
}

function rewriteSafety(analysis: QualityGateAnalysis): QualityGateItem {
  const rewriteParts = [analysis.rewrite.summary, ...analysis.rewrite.bullets, analysis.rewrite.note].map((part) => part.trim())
  const rewriteText = rewriteParts.join(' ')
  const hasRewrite = rewriteParts.some(Boolean)
  const riskyGapClaims = analysis.gaps.filter((term) => textContains(rewriteText, term) && !cautionWords.test(rewriteText))
  const proofTerms = analysis.matched.filter((term) => textContains(rewriteText, term))

  if (!hasRewrite) {
    return {
      detail: 'No rewrite direction was returned.',
      id: 'rewrite',
      label: 'Rewrite safety',
      metric: 'empty rewrite',
      status: 'blocked',
    }
  }

  if (riskyGapClaims.length > 0) {
    return {
      detail: 'The rewrite mentions a gap without clear caution language.',
      id: 'rewrite',
      label: 'Rewrite safety',
      metric: `${riskyGapClaims.length} risky claim${riskyGapClaims.length === 1 ? '' : 's'}`,
      status: 'next',
    }
  }

  return {
    detail:
      proofTerms.length > 0
        ? 'The rewrite is anchored in matched proof terms and does not hide mapped gaps.'
        : 'The rewrite is present, but could name stronger proof terms from the evidence map.',
    id: 'rewrite',
    label: 'Rewrite safety',
    metric: proofTerms.length > 0 ? `${proofTerms.length} proof terms` : 'needs proof terms',
    status: proofTerms.length > 0 ? 'done' : 'next',
  }
}

function interviewUsefulness(analysis: QualityGateAnalysis): QualityGateItem {
  const roleTerms = [...analysis.matched, ...analysis.gaps]
  const specificQuestions = analysis.questions.filter((question) =>
    roleTerms.some((term) => textContains(question, term)) || textContains(question, analysis.title),
  ).length
  const hasEnoughMaterial = analysis.questions.length >= 3 && analysis.coaching.length >= 3

  return {
    detail:
      hasEnoughMaterial && specificQuestions > 0
        ? 'Questions and coaching are specific enough to rehearse the person behind the CV.'
        : analysis.questions.length > 0
          ? 'Interview material exists, but it should be more specific to the mapped proof and gaps.'
          : 'No interview practice material was returned.',
    id: 'interview',
    label: 'Interview usefulness',
    metric: `${specificQuestions}/${Math.max(analysis.questions.length, 1)} specific`,
    status: hasEnoughMaterial && specificQuestions > 0 ? 'done' : analysis.questions.length > 0 ? 'next' : 'blocked',
  }
}

export function qualityGateForAnalysis({
  analysis,
  cvText,
  jobText,
}: {
  analysis: QualityGateAnalysis
  cvText: string
  jobText: string
}): QualityGateResult {
  const items = [
    contractCompleteness(analysis),
    evidenceGrounding(analysis, cvText),
    roleCoverage(analysis, jobText),
    gapHonesty(analysis),
    rewriteSafety(analysis),
    interviewUsefulness(analysis),
  ]
  const status = gateStatus(items)
  const score = gateScore(items)

  return {
    detail:
      status === 'done'
        ? 'This analysis is ready to use as the working basis for rewrite and interview practice.'
        : status === 'next'
          ? 'This analysis can keep the workflow moving, but the orange items should be reviewed before relying on it.'
          : 'This analysis has a red quality issue. Keep the local workflow available, but do not trust the flagged output blindly.',
    items,
    score,
    status,
    title: status === 'done' ? 'Output looks grounded' : status === 'next' ? 'Review output quality' : 'Output needs caution',
  }
}
