// Phase G #1: plan_code is real data (functions/api/session.ts sets it at
// signup) but had zero gating logic anywhere until now. Candidate side is
// free, always — only employer tenants have a paid tier.
export const freeEmployerPlan = 'hiring_team'
export const paidEmployerPlan = 'hiring_team_pro'

export function isPaidEmployerPlan(planCode: string): boolean {
  return planCode === paidEmployerPlan
}

// Free tier: limited active postings, keyword-only matching, owner-only
// (no team seats), no structured scorecards. Paid: unlimited postings, AI
// matching tier, team seats, scorecards.
export const freeOpenJobsCap = 3
export const freeTeamMemberCap = 1

// Phase G #3: the usage guardrail for paid tenants doing meaningfully more
// (posting more roles, running AI job-intake more often) is the rate limit
// that already exists on those endpoints — paid tenants get a multiplier on
// the same limit rather than a separate metering system being built.
const paidRateMultiplier = 3
export function planRateLimit(planCode: string, freeLimit: number): number {
  return isPaidEmployerPlan(planCode) ? freeLimit * paidRateMultiplier : freeLimit
}
