import type { RequestContext } from '../_shared'
import { json, requireDb } from '../_shared'

export async function onRequestGet({ env }: RequestContext) {
  const db = requireDb(env)
  let achievementProfilesReady = false
  let atsSyncReady = false
  let databaseReady = false
  let antiGhostingPipelineReady = false
  let interviewPrepReady = false
  let jobSyndicationReady = false
  let passiveSourcingReady = false
  let packetReviewEngineReady = false
  let prescreeningReady = false
  let resumeIntelligenceReady = false
  let skillMatchingReady = false
  let transparencyBlueprintReady = false
  let workflowKernelReady = false

  if (db) {
    try {
      const achievementProfileRow = await db.prepare('SELECT COUNT(*) AS count FROM achievement_profiles').first<{ count: number }>()
      const atsSyncRow = await db.prepare('SELECT COUNT(*) AS count FROM ats_connections').first<{ count: number }>()
      const row = await db.prepare('SELECT COUNT(*) AS count FROM tenants').first<{ count: number }>()
      const interviewPrepRow = await db.prepare('SELECT COUNT(*) AS count FROM interview_prep_sessions').first<{ count: number }>()
      const jobSyndicationRow = await db.prepare('SELECT COUNT(*) AS count FROM job_syndication_posts').first<{ count: number }>()
      const passiveSourcingRow = await db.prepare('SELECT COUNT(*) AS count FROM passive_sourcing_cards').first<{ count: number }>()
      const pipelineRow = await db.prepare('SELECT COUNT(*) AS count FROM application_pipeline_items').first<{ count: number }>()
      const packetRow = await db.prepare('SELECT COUNT(*) AS count FROM application_packets').first<{ count: number }>()
      const prescreeningRow = await db.prepare('SELECT COUNT(*) AS count FROM prescreening_agents').first<{ count: number }>()
      const resumeIntelRow = await db.prepare('SELECT COUNT(*) AS count FROM resume_tailoring_analyses').first<{ count: number }>()
      const skillMatchingRow = await db.prepare('SELECT COUNT(*) AS count FROM semantic_match_runs').first<{ count: number }>()
      const transparencyRow = await db.prepare('SELECT COUNT(*) AS count FROM transparency_reports').first<{ count: number }>()
      const workflowRow = await db.prepare('SELECT COUNT(*) AS count FROM workflow_definitions').first<{ count: number }>()
      achievementProfilesReady = typeof achievementProfileRow?.count === 'number'
      atsSyncReady = typeof atsSyncRow?.count === 'number'
      databaseReady = typeof row?.count === 'number' && typeof packetRow?.count === 'number'
      antiGhostingPipelineReady = typeof pipelineRow?.count === 'number'
      interviewPrepReady = typeof interviewPrepRow?.count === 'number'
      jobSyndicationReady = typeof jobSyndicationRow?.count === 'number'
      passiveSourcingReady = typeof passiveSourcingRow?.count === 'number'
      packetReviewEngineReady = typeof packetRow?.count === 'number'
      prescreeningReady = typeof prescreeningRow?.count === 'number'
      resumeIntelligenceReady = typeof resumeIntelRow?.count === 'number'
      skillMatchingReady = typeof skillMatchingRow?.count === 'number'
      transparencyBlueprintReady = typeof transparencyRow?.count === 'number'
      workflowKernelReady = typeof workflowRow?.count === 'number'
    } catch {
      achievementProfilesReady = false
      atsSyncReady = false
      databaseReady = false
      antiGhostingPipelineReady = false
      interviewPrepReady = false
      jobSyndicationReady = false
      passiveSourcingReady = false
      packetReviewEngineReady = false
      prescreeningReady = false
      resumeIntelligenceReady = false
      skillMatchingReady = false
      transparencyBlueprintReady = false
      workflowKernelReady = false
    }
  }

  return json({
    ok: true,
    service: 'JobsFlow API',
    runtime: 'Cloudflare Pages Functions',
    bindings: {
      db: Boolean(env.DB),
      resumeBucket: Boolean(env.RESUME_BUCKET),
      sessionSecret: Boolean(env.AUTH_SESSION_SECRET),
      bootstrapToken: Boolean(env.AUTH_BOOTSTRAP_TOKEN),
    },
    databaseReady,
    features: {
      achievementProfiles: achievementProfilesReady,
      atsSync: atsSyncReady,
      antiGhostingPipeline: antiGhostingPipelineReady,
      interviewPrep: interviewPrepReady,
      jobSyndication: jobSyndicationReady,
      passiveSourcing: passiveSourcingReady,
      packetReviewEngine: packetReviewEngineReady,
      prescreening: prescreeningReady,
      resumeIntelligence: resumeIntelligenceReady,
      skillMatching: skillMatchingReady,
      ssoProvider: Boolean(env.CLERK_JWKS_URL && env.CLERK_ISSUER && env.CLERK_SECRET_KEY),
      transparencyBlueprint: transparencyBlueprintReady,
      workflowKernel: workflowKernelReady,
    },
    externalSubmissionsEnabled: false,
  })
}
