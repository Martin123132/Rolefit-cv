import type { ScoutMatch } from './scoutEngine'
import {
  scoutMatchFeedbackLabels,
  type ScoutMatchFeedbackState,
} from './scoutFeedback'

export type ScoutTrackerStatus = 'saved' | 'interested' | 'applied' | 'interview' | 'offer' | 'rejected' | 'archived'

export type ScoutTrackerFilter = 'all' | 'active' | 'due' | 'applied' | 'interview' | 'archived'

export type ScoutTrackerHistoryType = 'created' | 'status' | 'follow-up' | 'field' | 'rolefit' | 'note'

export type ScoutTrackerHistoryItem = {
  createdAt: string
  id: string
  message: string
  type: ScoutTrackerHistoryType
}

export type ScoutTrackerEntry = {
  contact: string
  employer: string
  followUpDate: string
  history: ScoutTrackerHistoryItem[]
  nextAction: string
  notes: string
  sourceUrl: string
  status: ScoutTrackerStatus
  updatedAt: string
}

export type ScoutTrackerDueState = 'closed' | 'due-today' | 'future' | 'none' | 'overdue'

export type ScoutTrackerState = Record<string, ScoutTrackerEntry>

export const scoutTrackerStatuses: Array<{ id: ScoutTrackerStatus; label: string }> = [
  { id: 'saved', label: 'Saved' },
  { id: 'interested', label: 'Interested' },
  { id: 'applied', label: 'Applied' },
  { id: 'interview', label: 'Interview' },
  { id: 'offer', label: 'Offer' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'archived', label: 'Archived' },
]

export const scoutTrackerFilters: Array<{ id: ScoutTrackerFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'due', label: 'Due now' },
  { id: 'applied', label: 'Applied' },
  { id: 'interview', label: 'Interview' },
  { id: 'archived', label: 'Archived' },
]

const scoutTrackerStatusRank: Record<ScoutTrackerStatus, number> = {
  interested: 0,
  applied: 1,
  interview: 2,
  offer: 3,
  saved: 4,
  rejected: 5,
  archived: 6,
}

export const scoutTrackerStatusLabels = Object.fromEntries(
  scoutTrackerStatuses.map((status) => [status.id, status.label]),
) as Record<ScoutTrackerStatus, string>

export const scoutTrackerDueLabels: Record<ScoutTrackerDueState, string> = {
  closed: 'Closed',
  'due-today': 'Due today',
  future: 'Follow-up set',
  none: 'No follow-up date',
  overdue: 'Overdue',
}

export const scoutTrackerHistoryTypeLabels: Record<ScoutTrackerHistoryType, string> = {
  created: 'Created',
  field: 'Updated',
  'follow-up': 'Follow-up',
  note: 'Note',
  rolefit: 'Rolefit',
  status: 'Status',
}

function hashText(text: string) {
  let hash = 0
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0
  }
  return hash.toString(36)
}

export function createScoutTrackerHistoryItem({
  createdAt = new Date().toISOString(),
  message,
  type,
}: {
  createdAt?: string
  message: string
  type: ScoutTrackerHistoryType
}): ScoutTrackerHistoryItem {
  return {
    createdAt,
    id: `history-${Date.parse(createdAt) || 0}-${type}-${hashText(message).slice(0, 8)}`,
    message,
    type,
  }
}

function readSavedScoutTrackerHistory(value: unknown): ScoutTrackerHistoryItem[] {
  if (!Array.isArray(value)) return []

  return value
    .map((item): ScoutTrackerHistoryItem | null => {
      if (!item || typeof item !== 'object') return null

      const candidate = item as Partial<ScoutTrackerHistoryItem>
      const type = candidate.type
      const message = typeof candidate.message === 'string' ? candidate.message.trim() : ''
      const createdAt = typeof candidate.createdAt === 'string' ? candidate.createdAt : ''
      if (!message || !createdAt) return null
      if (type !== 'created' && type !== 'status' && type !== 'follow-up' && type !== 'field' && type !== 'rolefit' && type !== 'note') return null

      return {
        createdAt,
        id:
          typeof candidate.id === 'string' && candidate.id.trim()
            ? candidate.id.trim()
            : createScoutTrackerHistoryItem({ createdAt, message, type }).id,
        message,
        type,
      }
    })
    .filter((item): item is ScoutTrackerHistoryItem => Boolean(item))
    .sort((left, right) => trackerTimestamp(right.createdAt) - trackerTimestamp(left.createdAt))
}

export function isScoutTrackerStatus(value: unknown): value is ScoutTrackerStatus {
  return scoutTrackerStatuses.some((status) => status.id === value)
}

export function isActiveScoutTrackerStatus(status: ScoutTrackerStatus) {
  return status !== 'rejected' && status !== 'archived'
}

export function defaultScoutTrackerEntry(): ScoutTrackerEntry {
  return {
    contact: '',
    employer: '',
    followUpDate: '',
    history: [],
    nextAction: '',
    notes: '',
    sourceUrl: '',
    status: 'saved',
    updatedAt: '',
  }
}

export function createScoutTrackerEntryForJob({
  createdAt = new Date().toISOString(),
  sourceUrl = '',
  title,
}: {
  createdAt?: string
  sourceUrl?: string
  title: string
}): ScoutTrackerEntry {
  return {
    ...defaultScoutTrackerEntry(),
    history: [
      createScoutTrackerHistoryItem({
        createdAt,
        message: `${title} added to the basket.`,
        type: 'created',
      }),
    ],
    sourceUrl,
    updatedAt: createdAt,
  }
}

export function readSavedScoutTracker(value: unknown): ScoutTrackerState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  return Object.entries(value as Record<string, unknown>).reduce<ScoutTrackerState>((entries, [jobId, item]) => {
    if (!jobId.trim() || !item || typeof item !== 'object' || Array.isArray(item)) return entries

    const candidate = item as Partial<ScoutTrackerEntry>
    const status = isScoutTrackerStatus(candidate.status) ? candidate.status : 'saved'
    entries[jobId] = {
      contact: typeof candidate.contact === 'string' ? candidate.contact : '',
      employer: typeof candidate.employer === 'string' ? candidate.employer : '',
      followUpDate: typeof candidate.followUpDate === 'string' ? candidate.followUpDate : '',
      history: readSavedScoutTrackerHistory(candidate.history),
      nextAction: typeof candidate.nextAction === 'string' ? candidate.nextAction : '',
      notes: typeof candidate.notes === 'string' ? candidate.notes : '',
      sourceUrl: typeof candidate.sourceUrl === 'string' ? candidate.sourceUrl : '',
      status,
      updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : '',
    }

    return entries
  }, {})
}

export function appendScoutTrackerHistory(
  tracker: ScoutTrackerEntry,
  type: ScoutTrackerHistoryType,
  message: string,
  createdAt = new Date().toISOString(),
): ScoutTrackerEntry {
  const cleanMessage = message.trim()
  if (!cleanMessage) return tracker

  return {
    ...tracker,
    history: [
      createScoutTrackerHistoryItem({
        createdAt,
        message: cleanMessage,
        type,
      }),
      ...tracker.history,
    ],
    updatedAt: createdAt,
  }
}

export function updateScoutTrackerEntry(
  tracker: ScoutTrackerEntry,
  updates: Partial<Omit<ScoutTrackerEntry, 'history' | 'updatedAt'>>,
  createdAt = new Date().toISOString(),
): ScoutTrackerEntry {
  let nextTracker: ScoutTrackerEntry = {
    ...tracker,
    ...updates,
    updatedAt: createdAt,
  }

  if (updates.status && updates.status !== tracker.status) {
    nextTracker = appendScoutTrackerHistory(nextTracker, 'status', `Status changed to ${scoutTrackerStatusLabels[updates.status]}.`, createdAt)
  }

  if (typeof updates.followUpDate === 'string' && updates.followUpDate !== tracker.followUpDate) {
    nextTracker = appendScoutTrackerHistory(
      nextTracker,
      'follow-up',
      updates.followUpDate ? `Follow-up date set to ${updates.followUpDate}.` : 'Follow-up date cleared.',
      createdAt,
    )
  }

  return nextTracker
}

export function isLocalDateValue(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export function scoutTrackerDueState(tracker: ScoutTrackerEntry, today: string): ScoutTrackerDueState {
  if (!isActiveScoutTrackerStatus(tracker.status)) return 'closed'
  if (!isLocalDateValue(tracker.followUpDate)) return 'none'
  if (tracker.followUpDate < today) return 'overdue'
  if (tracker.followUpDate === today) return 'due-today'
  return 'future'
}

export function scoutTrackerIsDueNow(dueState: ScoutTrackerDueState) {
  return dueState === 'overdue' || dueState === 'due-today'
}

export function scoutTrackerVisibleForFilter(tracker: ScoutTrackerEntry, filter: ScoutTrackerFilter, today: string) {
  if (filter === 'all') return true
  if (filter === 'active') return isActiveScoutTrackerStatus(tracker.status)
  if (filter === 'due') return scoutTrackerIsDueNow(scoutTrackerDueState(tracker, today))
  if (filter === 'archived') return tracker.status === 'archived' || tracker.status === 'rejected'
  return tracker.status === filter
}

export function scoutTrackerUpdatedLabel(updatedAt: string) {
  if (!updatedAt) return 'Not updated yet'

  const timestamp = Date.parse(updatedAt)
  if (Number.isNaN(timestamp)) return 'Updated recently'

  return `Updated ${new Date(timestamp).toLocaleDateString([], {
    day: 'numeric',
    month: 'short',
  })}`
}

function trackerTimestamp(updatedAt: string) {
  const timestamp = Date.parse(updatedAt)
  return Number.isNaN(timestamp) ? 0 : timestamp
}

export function compareScoutTrackerEntries(left: ScoutTrackerEntry, right: ScoutTrackerEntry) {
  const leftActive = isActiveScoutTrackerStatus(left.status)
  const rightActive = isActiveScoutTrackerStatus(right.status)

  if (leftActive !== rightActive) return leftActive ? -1 : 1

  const updatedAt = trackerTimestamp(right.updatedAt) - trackerTimestamp(left.updatedAt)
  if (updatedAt !== 0) return updatedAt

  const statusRank = scoutTrackerStatusRank[left.status] - scoutTrackerStatusRank[right.status]
  if (statusRank !== 0) return statusRank

  return 0
}

export function scoutTrackerDueLight(dueState: ScoutTrackerDueState) {
  if (dueState === 'overdue') return 'blocked'
  if (dueState === 'due-today') return 'next'
  if (dueState === 'future') return 'done'
  if (dueState === 'closed') return 'black'
  return 'idle'
}

export function scoutTrackerDueDetail(tracker: ScoutTrackerEntry, dueState: ScoutTrackerDueState) {
  if (dueState === 'closed') return 'Rejected or archived jobs are hidden from due-now follow-up.'
  if (dueState === 'none') return 'Set a date when this application needs attention.'
  if (dueState === 'overdue') return `${tracker.followUpDate} needs attention.`
  if (dueState === 'due-today') return `${tracker.followUpDate} is due today.`
  return `${tracker.followUpDate} is scheduled.`
}

function csvCell(value: string | number) {
  const text = String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function historyExportText(history: readonly ScoutTrackerHistoryItem[]) {
  return history
    .map((item) => `${item.createdAt} ${scoutTrackerHistoryTypeLabels[item.type]}: ${item.message}`)
    .join(' | ')
}

function trackerExportRows(
  matches: readonly ScoutMatch[],
  trackerState: ScoutTrackerState,
  today: string,
  feedbackState: ScoutMatchFeedbackState = {},
) {
  return matches.map((match) => {
    const tracker = trackerState[match.job.id] ?? defaultScoutTrackerEntry()
    const dueState = scoutTrackerDueState(tracker, today)
    const feedback = feedbackState[match.job.id]

    return {
      contact: tracker.contact.trim(),
      dueState,
      employer: tracker.employer.trim(),
      feedbackNote: feedback?.note.trim() ?? '',
      feedbackRating: feedback ? scoutMatchFeedbackLabels[feedback.rating] : 'Not reviewed',
      feedbackUpdatedAt: feedback?.updatedAt ?? '',
      followUpDate: tracker.followUpDate.trim(),
      gaps: match.missingTerms.join('; '),
      history: historyExportText(tracker.history),
      matchScore: match.score,
      matchStatus: match.statusLabel,
      nextAction: tracker.nextAction.trim(),
      notes: tracker.notes.trim(),
      sourceUrl: tracker.sourceUrl.trim(),
      status: scoutTrackerStatusLabels[tracker.status],
      title: match.job.title,
      warnings: match.warnings.join('; '),
    }
  })
}

export function scoutTrackerMarkdown(
  matches: readonly ScoutMatch[],
  trackerState: ScoutTrackerState,
  today: string,
  feedbackState: ScoutMatchFeedbackState = {},
) {
  const rows = trackerExportRows(matches, trackerState, today, feedbackState)

  return [
    '# Rolefit Scout Tracker',
    '',
    `Exported: ${new Date().toLocaleString()}`,
    `Jobs: ${rows.length}`,
    '',
    ...rows.flatMap((row, index) => [
      `## ${index + 1}. ${row.title}`,
      '',
      `- Status: ${row.status}`,
      `- Due state: ${scoutTrackerDueLabels[row.dueState]}`,
      `- Follow-up date: ${row.followUpDate || 'Not set'}`,
      `- Employer: ${row.employer || 'Not set'}`,
      `- Contact: ${row.contact || 'Not set'}`,
      `- Source URL: ${row.sourceUrl || 'Not set'}`,
      `- Next action: ${row.nextAction || 'Not set'}`,
      `- Match: ${row.matchStatus} (${row.matchScore})`,
      `- Match feedback: ${row.feedbackRating}`,
      `- Feedback updated: ${row.feedbackUpdatedAt || 'Not reviewed'}`,
      `- Feedback note: ${row.feedbackNote || 'None'}`,
      `- Warnings: ${row.warnings || 'None'}`,
      `- Gaps: ${row.gaps || 'None'}`,
      `- History: ${row.history || 'None'}`,
      '',
      row.notes ? `Notes: ${row.notes}` : 'Notes: Not set',
      '',
    ]),
  ].join('\n')
}

export function scoutTrackerCsv(
  matches: readonly ScoutMatch[],
  trackerState: ScoutTrackerState,
  today: string,
  feedbackState: ScoutMatchFeedbackState = {},
) {
  const headers = [
    'Title',
    'Status',
    'Due state',
    'Follow-up date',
    'Employer',
    'Contact',
    'Source URL',
    'Next action',
    'Notes',
    'Match score',
    'Match status',
    'Match feedback',
    'Feedback note',
    'Feedback updated',
    'Warnings',
    'Gaps',
    'History',
  ]
  const rows = trackerExportRows(matches, trackerState, today, feedbackState).map((row) => [
    row.title,
    row.status,
    scoutTrackerDueLabels[row.dueState],
    row.followUpDate,
    row.employer,
    row.contact,
    row.sourceUrl,
    row.nextAction,
    row.notes,
    row.matchScore,
    row.matchStatus,
    row.feedbackRating,
    row.feedbackNote,
    row.feedbackUpdatedAt,
    row.warnings,
    row.gaps,
    row.history,
  ])

  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')
}
