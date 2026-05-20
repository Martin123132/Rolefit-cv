import { describe, expect, it } from 'vitest'

import type { ScoutMatch } from './scoutEngine'
import {
  appendScoutTrackerHistory,
  createScoutTrackerEntryForJob,
  readSavedScoutTracker,
  scoutTrackerCsv,
  scoutTrackerMarkdown,
  updateScoutTrackerEntry,
  type ScoutTrackerState,
} from './scoutTracker'

const fixtureCreatedAt = '2026-05-20T10:00:00.000Z'

function fixtureMatch(): ScoutMatch {
  return {
    employerQuestions: ['Can you confirm the working pattern?'],
    evidenceTerms: ['customer service'],
    job: {
      id: 'job-1',
      text: 'Customer Support Advisor',
      title: 'Customer Support Advisor',
    },
    missingTerms: ['crm'],
    requirementMap: [],
    score: 82,
    scoreBreakdown: [],
    signalGroups: [],
    status: 'green',
    statusLabel: 'Green - strong proof fit',
    summary: 'Strong proof fit.',
    warnings: ['Pay not shown'],
  }
}

describe('Scout tracker history', () => {
  it('loads older tracker entries without history safely', () => {
    const tracker = readSavedScoutTracker({
      'job-1': {
        employer: 'Acme',
        status: 'applied',
      },
    })

    expect(tracker['job-1']).toMatchObject({
      employer: 'Acme',
      history: [],
      status: 'applied',
    })
  })

  it('creates a history item when a job is added', () => {
    const tracker = createScoutTrackerEntryForJob({
      createdAt: fixtureCreatedAt,
      title: 'Customer Support Advisor',
    })

    expect(tracker.history).toHaveLength(1)
    expect(tracker.history[0]).toMatchObject({
      createdAt: fixtureCreatedAt,
      message: 'Customer Support Advisor added to the basket.',
      type: 'created',
    })
  })

  it('adds status and follow-up history when tracker fields change', () => {
    const tracker = createScoutTrackerEntryForJob({
      createdAt: fixtureCreatedAt,
      title: 'Customer Support Advisor',
    })
    const updated = updateScoutTrackerEntry(
      tracker,
      {
        followUpDate: '2026-05-22',
        status: 'interview',
      },
      '2026-05-20T11:00:00.000Z',
    )

    expect(updated.history.map((item) => item.type)).toEqual(['follow-up', 'status', 'created'])
    expect(updated.history.map((item) => item.message)).toEqual(
      expect.arrayContaining(['Status changed to Interview.', 'Follow-up date set to 2026-05-22.']),
    )
  })

  it('adds manual notes as note history entries', () => {
    const tracker = createScoutTrackerEntryForJob({
      createdAt: fixtureCreatedAt,
      title: 'Customer Support Advisor',
    })
    const withNote = appendScoutTrackerHistory(
      tracker,
      'note',
      'Called employer and confirmed the role is direct hire.',
      '2026-05-20T12:00:00.000Z',
    )

    expect(withNote.history[0]).toMatchObject({
      message: 'Called employer and confirmed the role is direct hire.',
      type: 'note',
    })
  })

  it('includes history in Markdown and CSV exports', () => {
    const tracker: ScoutTrackerState = {
      'job-1': appendScoutTrackerHistory(
        createScoutTrackerEntryForJob({
          createdAt: fixtureCreatedAt,
          title: 'Customer Support Advisor',
        }),
        'note',
        'Applied with tailored CV.',
        '2026-05-20T12:00:00.000Z',
      ),
    }
    const match = fixtureMatch()

    expect(scoutTrackerMarkdown([match], tracker, '2026-05-20')).toContain('Note: Applied with tailored CV.')
    expect(scoutTrackerCsv([match], tracker, '2026-05-20')).toContain('History')
    expect(scoutTrackerCsv([match], tracker, '2026-05-20')).toContain('Applied with tailored CV.')
  })
})
