import type { RequestContext } from '../_shared'
import { json, requireDb } from '../_shared'

export async function onRequestGet({ env }: RequestContext) {
  const db = requireDb(env)
  let databaseReady = false
  let antiGhostingPipelineReady = false
  let interviewPrepReady = false
  let packetReviewEngineReady = false
  let resumeIntelligenceReady = false
  let transparencyBlueprintReady = false
  let workflowKernelReady = false

  if (db) {
    try {
      const row = await db.prepare('SELECT COUNT(*) AS count FROM tenants').first<{ count: number }>()
      const interviewPrepRow = await db.prepare('SELECT COUNT(*) AS count FROM interview_prep_sessions').first<{ count: number }>()
      const pipelineRow = await db.prepare('SELECT COUNT(*) AS count FROM application_pipeline_items').first<{ count: number }>()
      const packetRow = await db.prepare('SELECT COUNT(*) AS count FROM application_packets').first<{ count: number }>()
      const resumeIntelRow = await db.prepare('SELECT COUNT(*) AS count FROM resume_tailoring_analyses').first<{ count: number }>()
      const transparencyRow = await db.prepare('SELECT COUNT(*) AS count FROM transparency_reports').first<{ count: number }>()
      const workflowRow = await db.prepare('SELECT COUNT(*) AS count FROM workflow_definitions').first<{ count: number }>()
      databaseReady = typeof row?.count === 'number' && typeof packetRow?.count === 'number'
      antiGhostingPipelineReady = typeof pipelineRow?.count === 'number'
      interviewPrepReady = typeof interviewPrepRow?.count === 'number'
      packetReviewEngineReady = typeof packetRow?.count === 'number'
      resumeIntelligenceReady = typeof resumeIntelRow?.count === 'number'
      transparencyBlueprintReady = typeof transparencyRow?.count === 'number'
      workflowKernelReady = typeof workflowRow?.count === 'number'
    } catch {
      databaseReady = false
      antiGhostingPipelineReady = false
      interviewPrepReady = false
      packetReviewEngineReady = false
      resumeIntelligenceReady = false
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
      antiGhostingPipeline: antiGhostingPipelineReady,
      interviewPrep: interviewPrepReady,
      packetReviewEngine: packetReviewEngineReady,
      resumeIntelligence: resumeIntelligenceReady,
      ssoProvider: Boolean(env.CLERK_JWKS_URL && env.CLERK_ISSUER && env.CLERK_SECRET_KEY),
      transparencyBlueprint: transparencyBlueprintReady,
      workflowKernel: workflowKernelReady,
    },
    externalSubmissionsEnabled: false,
  })
}
