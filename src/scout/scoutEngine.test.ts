import { describe, expect, it } from 'vitest'

import {
  buildScoutMatches,
  parseScoutJobAdverts,
  type ScoutJob,
  type ScoutMatch,
  type ScoutProfile,
} from './scoutEngine'

const strongSupportProfile: ScoutProfile = {
  cvText: [
    'Customer service specialist with strong communication, CRM, support, complaints and documentation experience.',
    'Worked with stakeholders across warehouse, finance and sales teams.',
    'Trained new starters and maintained process notes for customer support.',
  ].join(' '),
  location: 'Manchester',
  preferredRoles: 'customer service, customer support, support advisor',
  qualifications: 'GCSE English and Maths.',
  refusedRoles: '',
  salaryFloor: 'GBP 24000 per year',
  selfDescription: 'Calm, practical and confident helping customers solve problems.',
  travelRadius: '20 miles',
  workPreference: 'hybrid',
}

function matchFor(jobText: string, profile: ScoutProfile = strongSupportProfile): ScoutMatch {
  const jobs: ScoutJob[] = [
    {
      id: 'job-1',
      text: jobText,
      title: 'Fixture job',
    },
  ]

  return buildScoutMatches(profile, jobs)[0]
}

function groupStatus(match: ScoutMatch, groupId: ScoutMatch['signalGroups'][number]['id']) {
  return match.signalGroups.find((group) => group.id === groupId)?.status
}

describe('parseScoutJobAdverts', () => {
  it('splits multiple pasted adverts into separate job cards', () => {
    const parsed = parseScoutJobAdverts(`
Job 1: Customer Support Advisor
Required customer service. Salary GBP 28000 per year.

---

Job 2: Warehouse Operative
Must have forklift licence. Salary GBP 26000 per year.
`)

    expect(parsed).toHaveLength(2)
    expect(parsed.map((job) => job.title)).toEqual(['Customer Support Advisor', 'Warehouse Operative'])
    expect(parsed[0].text).toContain('Required customer service')
    expect(parsed[1].text).toContain('forklift licence')
  })
})

describe('buildScoutMatches', () => {
  it('ranks a strong direct-employer support advert green with proven evidence', () => {
    const match = matchFor(`
Customer Support Advisor
Direct employer. Salary GBP 28000 per year. Hybrid in Manchester.
Required: customer service, communication and CRM experience.
You will support customers, handle complaints, maintain documentation and work with stakeholders.
Desirable: training new starters.
`)

    expect(match.status).toBe('green')
    expect(match.score).toBeGreaterThanOrEqual(74)
    expect(groupStatus(match, 'mandatory')).toBe('green')
    expect(groupStatus(match, 'responsibilities')).toBe('green')
    expect(groupStatus(match, 'pay')).toBe('green')
    expect(groupStatus(match, 'work-pattern')).toBe('green')
    expect(match.evidenceTerms).toEqual(
      expect.arrayContaining(['customer service', 'communication', 'crm', 'support', 'complaints', 'documentation']),
    )
    expect(match.warnings).toHaveLength(0)
  })

  it('marks a partial fit red when mandatory proof is missing', () => {
    const match = matchFor(`
Warehouse Driver
Salary GBP 28000 per year. Hybrid depot planning role.
Must have a valid driving licence and forklift licence.
You will manage stock control, inventory and delivery documentation.
`)

    expect(match.status).toBe('red')
    expect(groupStatus(match, 'mandatory')).toBe('red')
    expect(match.missingTerms).toEqual(expect.arrayContaining(['driving licence', 'forklift licence']))
    expect(match.summary).toContain('mandatory proof')
  })

  it.each([
    ['commission-only advert', 'Commission only role with uncapped earnings. Required customer service. You will support customers. Salary GBP 30000 per year. Hybrid work.', 'Commission only'],
    ['umbrella payroll advert', 'Paid through umbrella payroll. Required customer service. You will support customers. Salary GBP 30000 per year. Hybrid work.', 'Umbrella payroll'],
    ['zero-hours advert', 'Zero-hours contract. Required customer service. You will support customers. Salary GBP 30000 per year. Hybrid work.', 'Zero hours'],
    ['refused role advert', 'Sales Advisor. Required customer service. You will support customers and sales teams. Salary GBP 30000 per year. Hybrid work.', 'Refused role match: sales'],
    ['below-floor pay advert', 'Required customer service. You will support customers. Salary GBP 20000 per year. Hybrid work.', 'Pay below floor'],
  ])('marks %s black with a clear warning', (_name, jobText, expectedWarning) => {
    const profile = { ...strongSupportProfile, refusedRoles: 'sales' }
    const match = matchFor(jobText, profile)

    expect(match.status).toBe('black')
    expect(match.warnings).toEqual(expect.arrayContaining([expectedWarning]))
    expect(groupStatus(match, 'warnings')).toBe('black')
  })

  it.each([
    ['missing salary', 'Required customer service. You will support customers and handle complaints. Hybrid work.'],
    ['competitive salary', 'Required customer service. You will support customers and handle complaints. Competitive salary. Hybrid work.'],
  ])('keeps %s as amber rather than black', (_name, jobText) => {
    const match = matchFor(jobText)

    expect(match.status).toBe('amber')
    expect(groupStatus(match, 'pay')).toBe('amber')
    expect(groupStatus(match, 'warnings')).not.toBe('black')
  })

  it('marks an on-site advert red when the profile needs remote work', () => {
    const remoteProfile = {
      ...strongSupportProfile,
      workPreference: 'remote' as const,
    }
    const match = matchFor(
      'Required customer service and CRM. You will support customers and maintain documentation. Salary GBP 30000 per year. Office based on-site role.',
      remoteProfile,
    )

    expect(match.status).toBe('red')
    expect(groupStatus(match, 'work-pattern')).toBe('red')
    expect(match.scoreBreakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Remote mismatch',
          status: 'red',
        }),
      ]),
    )
  })

  it('orders stronger honest matches before red and black jobs', () => {
    const matches = buildScoutMatches(strongSupportProfile, [
      {
        id: 'black',
        title: 'Commission Sales',
        text: 'Commission only. Required customer service. You will support customers. Salary GBP 30000 per year. Hybrid work.',
      },
      {
        id: 'green',
        title: 'Customer Support',
        text: 'Required customer service, communication and CRM. You will support customers, handle complaints and maintain documentation. Salary GBP 30000 per year. Hybrid work.',
      },
      {
        id: 'red',
        title: 'Warehouse Driver',
        text: 'Must have driving licence and forklift licence. You will manage stock control. Salary GBP 30000 per year. Hybrid work.',
      },
    ])

    expect(matches.map((match) => match.job.id)).toEqual(['green', 'red', 'black'])
  })
})
