import type { RequestContext, SessionContext } from '../_shared'
import { getSession, json, missingConfig, safeString, writeAuditEvent } from '../_shared'

type AtsSyncBody = {
  action?: unknown
  provider?: unknown
}

type AtsConnectionRow = {
  accountLabel: string
  createdAt: string
  id: string
  lastSyncAt: string | null
  oauthStatus: 'connected' | 'disconnected' | 'needs_reauth'
  provider: 'greenhouse' | 'lever' | 'workday'
  scopesJson: string
  tokenReference: string | null
  updatedAt: string
}

type AtsSyncMappingRow = {
  active: number
  connectionId: string
  createdAt: string
  direction: 'bidirectional' | 'inbound' | 'outbound'
  fieldMapJson: string
  id: string
  localEntity: string
  remoteEntity: string
}

type AtsSyncRunRow = {
  completedAt: string | null
  connectionId: string
  createdAt: string
  direction: 'bidirectional' | 'inbound' | 'outbound'
  id: string
  startedAt: string | null
  status: 'blocked' | 'completed' | 'failed' | 'queued'
  summaryJson: string
}

type AtsSyncEventRow = {
  createdAt: string
  eventType: string
  id: string
  localRecordRef: string
  payloadJson: string
  remoteRecordRef: string
  status: 'blocked' | 'mapped' | 'skipped' | 'synced'
  syncRunId: string
}

const maxBodyBytes = 32 * 1024

const providerConfigs: Array<{
  accountLabel: string
  provider: 'greenhouse' | 'lever' | 'workday'
  scopes: string[]
}> = [
  {
    accountLabel: 'Greenhouse recruiting',
    provider: 'greenhouse',
    scopes: ['jobs:read', 'candidates:read', 'applications:write', 'webhooks:read'],
  },
  {
    accountLabel: 'Lever recruiting',
    provider: 'lever',
    scopes: ['postings:read', 'opportunities:read', 'opportunities:write', 'webhooks:read'],
  },
  {
    accountLabel: 'Workday recruiting',
    provider: 'workday',
    scopes: ['requisitions:read', 'candidates:read', 'applications:write'],
  },
]

const defaultMappings = [
  {
    direction: 'bidirectional',
    fieldMap: {
      applicationStage: 'stage',
      candidateAlias: 'candidate.name',
      fitEvidence: 'custom_fields.jobsflow_fit_evidence',
      roleTitle: 'job.title',
    },
    localEntity: 'candidate_shortlist',
    remoteEntity: 'candidate_application',
  },
  {
    direction: 'outbound',
    fieldMap: {
      riskFlags: 'custom_fields.jobsflow_risks',
      scorecardScore: 'custom_fields.jobsflow_score',
    },
    localEntity: 'semantic_match_run',
    remoteEntity: 'candidate_scorecard',
  },
] as const

async function readBody(request: Request): Promise<AtsSyncBody | null> {
  const contentLength = Number(request.headers.get('content-length') ?? '0')
  if (contentLength > maxBodyBytes) {
    return null
  }

  try {
    return (await request.json()) as AtsSyncBody
  } catch {
    return {}
  }
}

function parseJson(value: string, fallback: unknown) {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return fallback
  }
}

function cleanText(value: unknown, fallback = '') {
  if (typeof value !== 'string') {
    return fallback
  }

  return Array.from(value, (character) => {
    const code = character.charCodeAt(0)
    return code < 32 || code === 127 ? ' ' : character
  })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
}

function cleanAction(value: unknown, fallback: string) {
  return cleanText(value, fallback).toLowerCase().replace(/[^a-z0-9_:-]/g, '').slice(0, 80)
}

function cleanProvider(value: unknown) {
  const provider = cleanAction(value, 'greenhouse')
  if (provider === 'lever' || provider === 'workday') {
    return provider
  }

  return 'greenhouse'
}

function connectionFromRow(row: AtsConnectionRow) {
  return {
    id: row.id,
    provider: row.provider,
    accountLabel: row.accountLabel,
    oauthStatus: row.oauthStatus,
    scopes: parseJson(row.scopesJson, []),
    tokenReference: row.tokenReference,
    lastSyncAt: row.lastSyncAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function mappingFromRow(row: AtsSyncMappingRow) {
  return {
    id: row.id,
    connectionId: row.connectionId,
    localEntity: row.localEntity,
    remoteEntity: row.remoteEntity,
    direction: row.direction,
    fieldMap: parseJson(row.fieldMapJson, {}),
    active: Boolean(row.active),
    createdAt: row.createdAt,
  }
}

function runFromRow(row: AtsSyncRunRow) {
  return {
    id: row.id,
    connectionId: row.connectionId,
    direction: row.direction,
    status: row.status,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    summary: parseJson(row.summaryJson, {}),
    createdAt: row.createdAt,
  }
}

function eventFromRow(row: AtsSyncEventRow) {
  return {
    id: row.id,
    syncRunId: row.syncRunId,
    eventType: row.eventType,
    localRecordRef: row.localRecordRef,
    remoteRecordRef: row.remoteRecordRef,
    payload: parseJson(row.payloadJson, {}),
    status: row.status,
    createdAt: row.createdAt,
  }
}

async function fetchAtsSyncState(env: RequestContext['env'], session: SessionContext) {
  if (!env.DB) {
    throw new Error('missing_db')
  }

  const [connectionRows, mappingRows, runRows, eventRows] = await Promise.all([
    env.DB
      .prepare(
        `
        SELECT
          id,
          provider,
          account_label AS accountLabel,
          oauth_status AS oauthStatus,
          scopes_json AS scopesJson,
          token_reference AS tokenReference,
          last_sync_at AS lastSyncAt,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM ats_connections
        WHERE tenant_id = ?
        ORDER BY created_at DESC
        LIMIT 12
        `,
      )
      .bind(session.tenantId)
      .all<AtsConnectionRow>(),
    env.DB
      .prepare(
        `
        SELECT
          id,
          connection_id AS connectionId,
          local_entity AS localEntity,
          remote_entity AS remoteEntity,
          direction,
          field_map_json AS fieldMapJson,
          active,
          created_at AS createdAt
        FROM ats_sync_mappings
        WHERE tenant_id = ?
        ORDER BY created_at DESC
        LIMIT 24
        `,
      )
      .bind(session.tenantId)
      .all<AtsSyncMappingRow>(),
    env.DB
      .prepare(
        `
        SELECT
          id,
          connection_id AS connectionId,
          direction,
          status,
          started_at AS startedAt,
          completed_at AS completedAt,
          summary_json AS summaryJson,
          created_at AS createdAt
        FROM ats_sync_runs
        WHERE tenant_id = ?
        ORDER BY created_at DESC
        LIMIT 12
        `,
      )
      .bind(session.tenantId)
      .all<AtsSyncRunRow>(),
    env.DB
      .prepare(
        `
        SELECT
          id,
          sync_run_id AS syncRunId,
          event_type AS eventType,
          local_record_ref AS localRecordRef,
          remote_record_ref AS remoteRecordRef,
          payload_json AS payloadJson,
          status,
          created_at AS createdAt
        FROM ats_sync_events
        WHERE tenant_id = ?
        ORDER BY created_at DESC
        LIMIT 30
        `,
      )
      .bind(session.tenantId)
      .all<AtsSyncEventRow>(),
  ])

  const connections = (connectionRows.results ?? []).map(connectionFromRow)
  const runs = (runRows.results ?? []).map(runFromRow)
  return {
    connections,
    events: (eventRows.results ?? []).map(eventFromRow),
    mappings: (mappingRows.results ?? []).map(mappingFromRow),
    runs,
    summary: {
      blockedRuns: runs.filter((run) => run.status === 'blocked').length,
      connectedProviders: connections.filter((connection) => connection.oauthStatus === 'connected').length,
      mappings: mappingRows.results?.length ?? 0,
      providers: connections.length,
      syncRuns: runs.length,
    },
  }
}

async function ensureMappings(env: RequestContext['env'], session: SessionContext, connectionId: string) {
  if (!env.DB) {
    throw new Error('missing_db')
  }

  for (const mapping of defaultMappings) {
    const existing = await env.DB
      .prepare(
        `
        SELECT id
        FROM ats_sync_mappings
        WHERE tenant_id = ?
          AND connection_id = ?
          AND local_entity = ?
          AND remote_entity = ?
          AND direction = ?
        LIMIT 1
        `,
      )
      .bind(session.tenantId, connectionId, mapping.localEntity, mapping.remoteEntity, mapping.direction)
      .first<{ id: string }>()

    if (existing) {
      continue
    }

    await env.DB
      .prepare(
        `
        INSERT INTO ats_sync_mappings (
          id,
          tenant_id,
          connection_id,
          local_entity,
          remote_entity,
          direction,
          field_map_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .bind(
        crypto.randomUUID(),
        session.tenantId,
        connectionId,
        mapping.localEntity,
        mapping.remoteEntity,
        mapping.direction,
        JSON.stringify(mapping.fieldMap),
      )
      .run()
  }
}

async function seedConnections(env: RequestContext['env'], session: SessionContext) {
  if (!env.DB) {
    throw new Error('missing_db')
  }

  for (const config of providerConfigs) {
    const connectionId = crypto.randomUUID()
    await env.DB
      .prepare(
        `
        INSERT INTO ats_connections (
          id,
          tenant_id,
          user_id,
          provider,
          account_label,
          oauth_status,
          scopes_json,
          token_reference
        )
        VALUES (?, ?, ?, ?, ?, 'disconnected', ?, NULL)
        ON CONFLICT (tenant_id, provider) DO UPDATE SET
          account_label = excluded.account_label,
          scopes_json = excluded.scopes_json,
          updated_at = datetime('now')
        `,
      )
      .bind(connectionId, session.tenantId, session.userId, config.provider, config.accountLabel, JSON.stringify(config.scopes))
      .run()

    const row = await env.DB
      .prepare(
        `
        SELECT id
        FROM ats_connections
        WHERE tenant_id = ?
          AND provider = ?
        LIMIT 1
        `,
      )
      .bind(session.tenantId, config.provider)
      .first<{ id: string }>()

    if (row?.id) {
      await ensureMappings(env, session, row.id)
    }
  }

  await writeAuditEvent(env, {
    tenantId: session.tenantId,
    userId: session.userId,
    eventType: 'ats_sync.connections.seeded',
    actorType: 'system',
    action: 'Seeded ATS OAuth connection boundaries and field mappings',
    riskLevel: 'low',
    metadata: {
      providers: providerConfigs.map((config) => config.provider),
    },
  })

  return json({ ok: true, state: await fetchAtsSyncState(env, session) }, 201)
}

async function runDrySync(env: RequestContext['env'], session: SessionContext, body: AtsSyncBody) {
  if (!env.DB) {
    throw new Error('missing_db')
  }

  const provider = cleanProvider(body.provider)
  let connection = await env.DB
    .prepare(
      `
      SELECT id, oauth_status AS oauthStatus
      FROM ats_connections
      WHERE tenant_id = ?
        AND provider = ?
      LIMIT 1
      `,
    )
    .bind(session.tenantId, provider)
    .first<{ id: string; oauthStatus: string }>()

  if (!connection) {
    await seedConnections(env, session)
    connection = await env.DB
      .prepare(
        `
        SELECT id, oauth_status AS oauthStatus
        FROM ats_connections
        WHERE tenant_id = ?
          AND provider = ?
        LIMIT 1
        `,
      )
      .bind(session.tenantId, provider)
      .first<{ id: string; oauthStatus: string }>()
  }

  if (!connection) {
    return json({ ok: false, error: 'ats_connection_not_found', message: 'JobsFlow could not create the ATS connection boundary.' }, 404)
  }

  const blocked = connection.oauthStatus !== 'connected'
  const runId = crypto.randomUUID()
  const summary = {
    externalMutation: false,
    provider,
    reason: blocked ? 'OAuth is not connected. Sync is blocked before external API calls.' : 'Dry run only.',
    recordsPlanned: 3,
  }

  await env.DB
    .prepare(
      `
      INSERT INTO ats_sync_runs (
        id,
        tenant_id,
        connection_id,
        direction,
        status,
        started_at,
        completed_at,
        summary_json
      )
      VALUES (?, ?, ?, 'bidirectional', ?, datetime('now'), datetime('now'), ?)
      `,
    )
    .bind(runId, session.tenantId, connection.id, blocked ? 'blocked' : 'completed', JSON.stringify(summary))
    .run()

  const events = [
    {
      eventType: 'candidate_profile_upsert',
      localRecordRef: 'jobsflow:candidate_profile:JFC-1428',
      remoteRecordRef: `${provider}:candidate:pending`,
      payload: { fields: ['candidateAlias', 'fitEvidence', 'riskFlags'] },
    },
    {
      eventType: 'application_stage_update',
      localRecordRef: 'jobsflow:pipeline:latest',
      remoteRecordRef: `${provider}:application:pending`,
      payload: { fields: ['stage', 'updatedAt', 'owner'] },
    },
    {
      eventType: 'scorecard_sync',
      localRecordRef: 'jobsflow:semantic_match:latest',
      remoteRecordRef: `${provider}:scorecard:pending`,
      payload: { fields: ['score', 'matchedSkills', 'gaps'] },
    },
  ]

  for (const event of events) {
    await env.DB
      .prepare(
        `
        INSERT INTO ats_sync_events (
          id,
          tenant_id,
          sync_run_id,
          event_type,
          local_record_ref,
          remote_record_ref,
          payload_json,
          status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .bind(
        crypto.randomUUID(),
        session.tenantId,
        runId,
        event.eventType,
        event.localRecordRef,
        event.remoteRecordRef,
        JSON.stringify(event.payload),
        blocked ? 'blocked' : 'mapped',
      )
      .run()
  }

  await writeAuditEvent(env, {
    tenantId: session.tenantId,
    userId: session.userId,
    eventType: 'ats_sync.dry_run.completed',
    actorType: 'system',
    action: blocked ? 'Blocked ATS dry-run because OAuth is disconnected' : 'Completed ATS dry-run mapping plan',
    riskLevel: blocked ? 'medium' : 'low',
    metadata: {
      provider,
      runId,
      status: blocked ? 'blocked' : 'completed',
    },
  })

  return json({ ok: true, runId, state: await fetchAtsSyncState(env, session) }, 201)
}

export async function onRequestGet({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }

  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in before reading ATS sync state.' }, 401)
  }

  try {
    return json({
      ok: true,
      state: await fetchAtsSyncState(env, session),
    })
  } catch (error) {
    return json(
      {
        ok: false,
        error: 'ats_sync_unavailable',
        message: 'ATS sync tables are not ready yet. Apply the latest D1 migration.',
        detail: error instanceof Error ? safeString(error.message, 'unknown_error') : 'unknown_error',
      },
      503,
    )
  }
}

export async function onRequestPost({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }

  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in before changing ATS sync state.' }, 401)
  }

  if (session.tenantType !== 'employer') {
    return json(
      {
        ok: false,
        error: 'wrong_workspace_type',
        message: 'ATS synchronizers are scoped to employer workspaces.',
      },
      403,
    )
  }

  const body = await readBody(request)
  if (!body) {
    return json({ ok: false, error: 'payload_too_large', message: 'ATS sync payload is limited to 32 KB.' }, 413)
  }

  const action = cleanAction(body.action, 'seed_connections')
  try {
    if (action === 'seed_connections') {
      return seedConnections(env, session)
    }

    if (action === 'run_dry_sync') {
      return runDrySync(env, session, body)
    }

    return json(
      {
        ok: false,
        error: 'unsupported_ats_sync_action',
        message: 'ATS sync action must be seed_connections or run_dry_sync.',
      },
      400,
    )
  } catch (error) {
    return json(
      {
        ok: false,
        error: 'ats_sync_error',
        message: 'JobsFlow could not complete the ATS sync action.',
        detail: error instanceof Error ? safeString(error.message, 'unknown_error') : 'unknown_error',
      },
      500,
    )
  }
}
