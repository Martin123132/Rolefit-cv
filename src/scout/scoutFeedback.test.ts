import { describe, expect, it } from 'vitest'

import { buildScoutMatches, type ScoutJob, type ScoutProfile } from './scoutEngine'
import {
  clearScoutMatchFeedback,
  readSavedScoutMatchFeedback,
  saveScoutMatchFeedback,
  scoutMatchFeedbackSummary,
} from './scoutFeedback'

const supportProfile: ScoutProfile = {
  cvText: 'Customer service, CRM, communication, complaints, reporting and support experience.',
  location: 'Manchester',
  preferredRoles: 'customer support, reporting',
  qualifications: 'GCSE English and Maths.',
  refusedRoles: '',
  salaryFloor: 'GBP 24000 per year',
  selfDescription: 'Calm practical customer support worker.',
  travelRadius: '20 miles',
  workPreference: 'hybrid',
}

const fixtureJobs: ScoutJob[] = [
  {
    id: 'job-1',
    text: 'Customer Support Advisor. Required customer service and CRM. Salary GBP 28000 per year. Hybrid work.',
    title: 'Customer Support Advisor',
  },
  {
    id: 'job-2',
    text: 'Warehouse Driver. Must have forklift licence. Salary GBP 26000 per year. On-site role.',
    title: 'Warehouse Driver',
  },
]

describe('Scout match feedback', () => {
  it('loads older drafts without feedback safely', () => {
    expect(readSavedScoutMatchFeedback(undefined)).toEqual({})
    expect(readSavedScoutMatchFeedback({})).toEqual({})
  })

  it('ignores invalid feedback ratings when reading saved drafts', () => {
    const feedback = readSavedScoutMatchFeedback({
      'job-1': {
        note: 'This seems too generous.',
        rating: 'wrong',
        updatedAt: '2026-05-25T10:00:00.000Z',
      },
      'job-2': {
        note: 'Looks accurate.',
        rating: 'right',
        updatedAt: '2026-05-25T11:00:00.000Z',
      },
    })

    expect(feedback).toEqual({
      'job-2': {
        note: 'Looks accurate.',
        rating: 'right',
        updatedAt: '2026-05-25T11:00:00.000Z',
      },
    })
  })

  it('saves, updates, summarizes, and clears feedback', () => {
    const saved = saveScoutMatchFeedback(
      {},
      'job-1',
      {
        note: 'This should be amber because pay is unclear.',
        rating: 'too-high',
      },
      '2026-05-25T10:00:00.000Z',
    )
    const updated = saveScoutMatchFeedback(saved, 'job-1', { rating: 'right' }, '2026-05-25T11:00:00.000Z')

    expect(updated['job-1']).toEqual({
      note: 'This should be amber because pay is unclear.',
      rating: 'right',
      updatedAt: '2026-05-25T11:00:00.000Z',
    })
    expect(scoutMatchFeedbackSummary(updated, ['job-1', 'job-2'])).toEqual({
      issueCount: 0,
      reviewedCount: 1,
    })
    expect(clearScoutMatchFeedback(updated, 'job-1')).toEqual({})
  })

  it('does not affect Scout match scores or ordering', () => {
    const beforeFeedback = buildScoutMatches(supportProfile, fixtureJobs).map((match) => ({
      id: match.job.id,
      score: match.score,
      status: match.status,
    }))
    const feedback = saveScoutMatchFeedback({}, 'job-2', { rating: 'too-low' }, '2026-05-25T10:00:00.000Z')
    const afterFeedback = buildScoutMatches(supportProfile, fixtureJobs).map((match) => ({
      id: match.job.id,
      score: match.score,
      status: match.status,
    }))

    expect(feedback['job-2'].rating).toBe('too-low')
    expect(afterFeedback).toEqual(beforeFeedback)
  })
})
