export type ScoutMatchFeedbackRating = 'right' | 'too-high' | 'too-low' | 'missed-warning'

export type ScoutMatchFeedback = {
  note: string
  rating: ScoutMatchFeedbackRating
  updatedAt: string
}

export type ScoutMatchFeedbackState = Record<string, ScoutMatchFeedback>

export const scoutMatchFeedbackOptions: Array<{
  id: ScoutMatchFeedbackRating
  label: string
}> = [
  { id: 'right', label: 'Looks right' },
  { id: 'too-high', label: 'Too generous' },
  { id: 'too-low', label: 'Too harsh' },
  { id: 'missed-warning', label: 'Missed warning' },
]

export const scoutMatchFeedbackLabels = Object.fromEntries(
  scoutMatchFeedbackOptions.map((option) => [option.id, option.label]),
) as Record<ScoutMatchFeedbackRating, string>

export function isScoutMatchFeedbackRating(value: unknown): value is ScoutMatchFeedbackRating {
  return scoutMatchFeedbackOptions.some((option) => option.id === value)
}

export function readSavedScoutMatchFeedback(value: unknown): ScoutMatchFeedbackState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  return Object.entries(value as Record<string, unknown>).reduce<ScoutMatchFeedbackState>((entries, [jobId, item]) => {
    if (!jobId.trim() || !item || typeof item !== 'object' || Array.isArray(item)) return entries

    const candidate = item as Partial<ScoutMatchFeedback>
    if (!isScoutMatchFeedbackRating(candidate.rating)) return entries

    entries[jobId] = {
      note: typeof candidate.note === 'string' ? candidate.note : '',
      rating: candidate.rating,
      updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : '',
    }

    return entries
  }, {})
}

export function saveScoutMatchFeedback(
  current: ScoutMatchFeedbackState,
  jobId: string,
  feedback: Pick<ScoutMatchFeedback, 'rating'> & Partial<Pick<ScoutMatchFeedback, 'note'>>,
  updatedAt = new Date().toISOString(),
): ScoutMatchFeedbackState {
  if (!jobId.trim() || !isScoutMatchFeedbackRating(feedback.rating)) return current

  const existing = current[jobId]

  return {
    ...current,
    [jobId]: {
      note: typeof feedback.note === 'string' ? feedback.note : existing?.note ?? '',
      rating: feedback.rating,
      updatedAt,
    },
  }
}

export function clearScoutMatchFeedback(current: ScoutMatchFeedbackState, jobId: string): ScoutMatchFeedbackState {
  if (!current[jobId]) return current

  const nextFeedback = { ...current }
  delete nextFeedback[jobId]
  return nextFeedback
}

export function scoutMatchFeedbackLight(feedback?: ScoutMatchFeedback) {
  if (!feedback) return 'idle'
  return feedback.rating === 'right' ? 'done' : 'next'
}

export function scoutMatchFeedbackSummary(feedbackState: ScoutMatchFeedbackState, jobIds: readonly string[]) {
  return jobIds.reduce(
    (summary, jobId) => {
      const feedback = feedbackState[jobId]
      if (!feedback) return summary

      summary.reviewedCount += 1
      if (feedback.rating !== 'right') summary.issueCount += 1
      return summary
    },
    {
      issueCount: 0,
      reviewedCount: 0,
    },
  )
}
