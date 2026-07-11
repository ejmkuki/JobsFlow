import { describe, expect, it } from 'vitest'
import { evaluateResumeHealth } from '../src/lib/resumeHealth'

describe('evaluateResumeHealth', () => {
  it('fails every check on an empty resume', () => {
    const result = evaluateResumeHealth('')
    expect(result.done).toBe(0)
    expect(result.total).toBe(4)
    expect(result.checks.every((check) => !check.done)).toBe(true)
  })

  it('passes every check on a well-formed resume', () => {
    const resume =
      'Summary\n' +
      'Senior Database Administrator with 8+ years of Oracle and MongoDB experience. Contact: jane@example.com, linkedin.com/in/jane\n\n' +
      'Experience\n' +
      'Led a migration that cut incident response time by 40% and saved $2,000,000 annually. '.repeat(6) +
      '\n\nEducation\nB.S. Computer Science\n\nSkills\nOracle, MongoDB, RMAN, RAC'
    const result = evaluateResumeHealth(resume)
    expect(result.done).toBe(4)
    expect(result.checks.find((c) => c.id === 'length')?.done).toBe(true)
    expect(result.checks.find((c) => c.id === 'sections')?.done).toBe(true)
    expect(result.checks.find((c) => c.id === 'metrics')?.done).toBe(true)
    expect(result.checks.find((c) => c.id === 'contact')?.done).toBe(true)
  })

  it('flags a resume with no quantified impact or contact info', () => {
    const resume =
      'Experience\n' +
      'Worked on database systems and helped the team ship things. '.repeat(20) +
      '\n\nEducation\nWent to school.\n\nSkills\nDatabases, teamwork'
    const result = evaluateResumeHealth(resume)
    expect(result.checks.find((c) => c.id === 'metrics')?.done).toBe(false)
    expect(result.checks.find((c) => c.id === 'contact')?.done).toBe(false)
    expect(result.checks.find((c) => c.id === 'sections')?.done).toBe(true)
  })

  it('detects a phone-free professional link as contact info', () => {
    const resume = 'x'.repeat(700) + ' github.com/janedoe'
    const result = evaluateResumeHealth(resume)
    expect(result.checks.find((c) => c.id === 'contact')?.done).toBe(true)
  })
})
