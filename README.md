# JobsFlow by Workflowfy AI

JobsFlow by Workflowfy AI is the candidate-trusted, employer-ready AI hiring workflow platform for `https://jobsflow.workflowfy.ai`.

JobsFlow is being shaped as a candidate-trusted, employer-ready AI hiring workflow platform. The current build includes the frontend workspace plus a Cloudflare-ready backend slice for signed sessions, tenants, resume storage, and audit logs. It does not submit applications, send email, charge cards, scrape job boards, or run AI calls.

Workflowfy AI is the public brand and product layer for JobsFlow.

## Strategy Memo

- Current state: polished frontend SaaS scaffold with three local-state workspaces, a real Cloudflare backend slice, and a signal operations layer for reviewed next decisions.
- Competitive gap: most job tools optimize volume, templates, or tracking; JobsFlow should optimize signal, consent, fit evidence, and measurable hiring workflow.
- Candidate opportunity: high-fidelity profile, resume intelligence, review-only AI drafts, follow-up control, interview prep, and reputation guardrails.
- Employer opportunity: structured role intake, ranked shortlists, evidence-first screening, outreach coordination, fairness checks, and pipeline health.
- Trust risk: external submissions, employer visibility, AI-generated claims, sensitive profile storage, and billing must all be gated by explicit controls.
- Recommended architecture: tenant-scoped auth, Postgres data model, encrypted resume storage, AI workflow service with evals, immutable audit logs, and Stripe Billing.

## Product Direction

- Candidate Workspace: profile health, resume intelligence, ATS fit, match queue, application tracker, saved responses, interview prep, and guarded automation modes.
- Employer Workspace: role intake, hiring priorities, AI-ranked shortlists, fit evidence, pipeline stages, outreach queue, analytics, and fairness checks.
- Trust & Platform: review gates, audit trail, consent/privacy controls, duplicate prevention, integrations roadmap, production gates, and Stripe-ready affordable plan placeholders.

## Phase 2 Product Surface

- Product onboarding now walks users through signal target, employer criteria, review gates, and affordable access before automation is considered.
- Activation Center now brings candidate signup, employer signup, and first useful action into one surface: candidates upload a resume immediately after starting a workspace, while employers clarify the first role before ranking anyone.
- Signal Operations now gives every workspace a reviewed decision spine: what changed, why it matters, what to do next, who owns it, and what evidence supports it.
- Candidate command center now includes application packet review, salary floor guardrails, company exclusions, duplicate prevention, and blocked-action visibility.
- Candidate fit evidence review now separates evidence, gaps, safeguards, and approval gates before a packet moves forward.
- Employer command center now includes scorecard weighting, interview coordination, collaboration placeholders, and decision-risk context.
- Employer shortlist decision review now maps each recommendation to scorecard criteria, evidence, risks, owner, and next action before outreach.
- Trust & Platform now includes product states, data ownership controls, abuse prevention, and plan entitlements mapped to future Stripe billing.
- Compliance readiness now tracks consent receipts, resume privacy, external-action blocks, affordable billing, fairness review, and export/delete controls.
- Empty, loading, error, and blocked-state copy remains frontend-only and does not call external services.

## Phase 2.1 Signal Operations Layer

JobsFlow now has a cross-workspace decision layer designed to reduce anxiety and increase decision quality:

- Candidate decision queue: shows the next packet review, proof gap, approval gate, and reputation safeguards.
- Employer decision queue: shows the scorecard lock, compensation/fairness blockers, and outreach readiness.
- Platform decision queue: shows which trust controls are production gates before any external automation.
- Evidence review surfaces: candidate and employer workflows both show proof, gaps, risks, and next action instead of hiding behind a score.
- Compliance ledger: trust work now has a visible readiness map for privacy, consent, billing, fairness, and deletion controls.

This layer keeps JobsFlow distinct from volume-first job tools: it turns broad recruiting functionality into reviewed, evidence-backed workflow.

## Market-Inspired JobsFlow Modules

JobsFlow studies the useful patterns in major recruiting platforms without copying their branding, copy, layouts, or volume-first behavior.

- Professional network pattern: relationship-aware targets and future profile imports, guarded by privacy controls.
- Job inventory pattern: curated match queues ranked by fit evidence, salary floor, exclusions, and proof strength.
- Invite-to-apply pattern: employer "invite to review" drafts that require human approval and audit logging before outreach.
- Employer-brand pattern: trust profiles with salary bands, interview plans, role clarity, and response expectations.
- Early-talent pattern: pathway mode for internships, apprenticeships, graduate hiring, events, and entry-level scorecards.

These modules remain consent-first. The prototype does not scrape external platforms, submit applications, send outreach, or syndicate jobs.

## Production Foundations Added

- `src/productModel.ts` defines the first production entity blueprint for tenants, users, candidate profiles, resumes, roles, application packets, consent receipts, audit events, and billing subscriptions.
- Trust & Platform now shows onboarding, a consent gate matrix with local toggles, provider readiness, a Stripe launch checklist, plan entitlements, and phased implementation roadmap.
- Billing remains frontend-only, but the scaffold is shaped for Stripe Checkout, Stripe Billing, customer portal, coupons, hardship pricing, and entitlement limits.
- Cloudflare Pages Functions, D1 schema, R2 resume storage hooks, signed sessions, and audit logs are now present; AI calls, payments, email, scraping, and external application submission are still intentionally absent.
- JobsFlow is now formalized as a Cloudflare-native production stack. D1 stores workflow state, R2 stores private artifacts, and future Vectorize, Queues, Workflows, Durable Objects, and AI Gateway bindings should plug into the workflow kernel rather than separate feature silos.
- `migrations/0003_workflow_kernel.sql` adds the production workflow kernel: workflow definitions, workflow runs, workflow events, consent receipts, automation policies, integration accounts, and webhook delivery records.
- `functions/api/workflows.ts` seeds the ten JobsFlow pillar workflows plus the platform kernel, creates tenant-scoped guarded runs, persists consent receipts, keeps integrations disconnected by default, and records audit events for every kernel action.
- Trust & Platform now includes a live Cloudflare workflow kernel panel for activating the kernel, starting a guarded resume optimization workflow run, viewing pillar definitions, reading pending receipts, and inspecting integration boundaries.
- `migrations/0004_resume_intelligence.sql` adds Resume Tailwind Optimization tables for parsed resume facts, target job facts, vector-ready documents, and tailoring analyses.
- `functions/api/resume-intelligence.ts` parses candidate-provided resume evidence, extracts skills/achievements/metrics, parses target job requirements, computes semantic gap scores, writes Vectorize-ready document records, and records the analysis in the audit trail.
- Candidate Workspace now includes a live Resume Tailwind Optimization panel that persists readiness, skill coverage, semantic overlap, proof strength, missing skills, recommendations, and pending embedding records.
- `migrations/0005_anti_ghosting_pipeline.sql` adds the anti-ghosting pipeline data model for tracked applications, stage events, response policies, and follow-up tasks.
- `functions/api/pipeline.ts` creates candidate application pipeline items, advances stages, calculates employer response SLAs, drafts follow-up tasks, and records audit events without sending anything externally.
- Candidate Workspace now includes a live Anti-Ghosting Pipeline Tracker with stage cards, stale checks, response status, and consent-gated follow-up drafts.
- `migrations/0006_interview_prep_sandbox.sql` adds interview prep sessions, generated question sets, practice answers, scoring rubric output, and tenant-scoped answer evaluation history.
- `functions/api/interview-prep.ts` creates role- and stage-specific interview prep sessions, generates deterministic prompt sets, evaluates practice answers against evidence/structure/risk rubrics, and records audit events.
- Candidate Workspace now includes a live Native AI Interview Prep Sandbox with question selection, answer scoring, strengths, risks, and rehearsal recommendations.
- `migrations/0007_transparency_blueprint.sql` adds anonymized salary blueprints, culture-condition signals, and transparency reports.
- `functions/api/transparency.ts` creates tenant-scoped salary/culture reports, enforces anonymity floors for culture evidence, and audit logs each transparency blueprint.
- Candidate Workspace now includes a live Transparency Blueprint Portal with salary bands, confidence, culture evidence, and risk flags.
- `migrations/0008_passive_sourcing_cards.sql` adds anonymous passive sourcing cards, recruiter broadcast records, and contact-release request gates.
- `functions/api/passive-sourcing.ts` creates masked candidate cards, queues redacted recruiter broadcasts, hashes requester emails, and keeps contact release candidate-approved.
- Candidate Workspace now includes live Passive Sourcing Cards with anonymous handles, redaction payloads, and contact-release request status.
- `migrations/0009_semantic_skill_matching.sql` adds tenant-scoped skill taxonomy nodes, employer role requirements, candidate skill profiles, and semantic match runs.
- `functions/api/skill-matching.ts` creates taxonomy-adjacent match runs that separate direct skill proof, adjacent bridges, and review gaps.
- Employer Workspace now includes live Semantic Vector Skill-Matching for role requirements, vector-ready candidate profiles, and evidence-first fit scoring.
- `migrations/0010_job_syndication.sql` adds validated job syndication posts plus Google-for-Jobs, partner network, and Workflowfy digest delivery records.
- `functions/api/job-syndication.ts` validates job payloads, builds Google JobPosting JSON-LD and partner payloads, queues delivery records, and keeps external publication review-gated.
- Employer Workspace now includes a live One-Click Job Syndication Engine with validation status, salary payloads, and delivery records.
- `migrations/0011_prescreening_agents.sql` adds conversational pre-screening agents, sessions, transcript messages, and decision records.
- `functions/api/prescreening.ts` runs criteria-bound pre-screening for visa/timeline/baseline skills, records the transcript, and stores a scheduling recommendation.
- Employer Workspace now includes live Conversational Pre-Screening Agents with scores, risks, criteria, and transcript review.
- `migrations/0012_dynamic_achievement_profiles.sql` adds dynamic achievement profiles, structured profile cards, and credential verification records.
- `functions/api/achievement-profiles.ts` transforms resume evidence into metric, leadership, project, and credential cards with verification status.
- Candidate Workspace now includes live Dynamic Achievement Profiles that turn resume walls into structured, review-ready cards.
- `migrations/0013_ats_synchronizers.sql` adds ATS OAuth connection boundaries, field mappings, sync runs, and sync events.
- `functions/api/ats-sync.ts` seeds Greenhouse/Lever/Workday connection records, stores no raw tokens, creates field maps, and records blocked dry-run sync events until OAuth is connected.
- Employer Workspace now includes live Two-Way Native ATS Synchronizers with provider boundaries, field maps, and dry-run event visibility.

## Cloudflare Backend Slice

The app now includes a real Cloudflare-ready backend surface:

- `functions/api/health.ts`: reports runtime, D1, R2, session secret, and bootstrap-token readiness.
- `functions/api/session.ts`: creates signed HTTP-only sessions through Clerk SSO, Cloudflare Access, a private bootstrap token, or localhost development mode.
- `functions/api/resumes.ts`: stores PDF/DOCX resumes in R2, writes metadata to D1, and records an audit event.
- `functions/api/packet-review.ts`: reviews candidate application packet evidence, computes readiness, creates review gates, records state transitions, and keeps external action blocked.
- `functions/api/audit.ts`: returns tenant-scoped audit events for the active session.
- `functions/api/workflows.ts`: manages the Cloudflare-native workflow kernel for definitions, runs, events, consent receipts, automation policies, integration boundaries, and delivery records.
- `functions/api/resume-intelligence.ts`: runs the first production candidate engine for resume facts, job target parsing, semantic gap scoring, vector-ready document creation, and tailored-resume recommendations.
- `functions/api/pipeline.ts`: runs the anti-ghosting application tracker with stage state, employer response SLAs, candidate follow-up drafts, fallback reminders, and audit history.
- `functions/api/interview-prep.ts`: runs the interview prep sandbox with target-role sessions, generated questions, structured rubric scoring, and practice answer history.
- `functions/api/transparency.ts`: runs the transparency blueprint portal for verified salary bands, anonymized culture conditions, and risk flags.
- `functions/api/passive-sourcing.ts`: runs anonymous passive sourcing cards with redacted broadcasts and contact-release gates.
- `functions/api/skill-matching.ts`: runs employer-side semantic skill matching with taxonomy nodes, vector-ready profile documents, direct evidence, adjacent matches, and gaps.
- `functions/api/job-syndication.ts`: runs one-click job syndication validation, Google JobPosting payload generation, partner payload generation, and queued delivery records.
- `functions/api/prescreening.ts`: runs conversational pre-screening agents for minimum criteria, transcript capture, risk flags, and scheduling recommendations.
- `functions/api/achievement-profiles.ts`: runs dynamic achievement profile generation from resume evidence into structured cards and credential verification records.
- `functions/api/ats-sync.ts`: runs ATS synchronizer setup for OAuth boundaries, Greenhouse/Lever/Workday mappings, dry-run sync runs, and event logs.
- `migrations/0001_initial.sql`: creates tenants, users, sessions, candidate profiles, resume artifacts, and audit events.
- `migrations/0002_application_packet_review.sql`: creates application packets, review gates, and state transitions.
- `migrations/0003_workflow_kernel.sql`: creates the workflow kernel tables that every production JobsFlow pillar should use.
- `migrations/0004_resume_intelligence.sql`: creates resume fact sets, job targets, vector document queue records, and resume tailoring analyses.
- `migrations/0005_anti_ghosting_pipeline.sql`: creates tracked applications, stage events, response policies, and follow-up tasks.
- `migrations/0006_interview_prep_sandbox.sql`: creates interview prep sessions, question sets, and practice answer evaluations.
- `migrations/0007_transparency_blueprint.sql`: creates salary blueprints, culture blueprints, and transparency reports.
- `migrations/0008_passive_sourcing_cards.sql`: creates passive sourcing cards, recruiter card broadcasts, and contact release requests.
- `migrations/0009_semantic_skill_matching.sql`: creates skill taxonomy nodes, employer role requirements, candidate skill profiles, and semantic match runs.
- `migrations/0010_job_syndication.sql`: creates job syndication posts and delivery records.
- `migrations/0011_prescreening_agents.sql`: creates pre-screening agents, sessions, messages, and decisions.
- `migrations/0012_dynamic_achievement_profiles.sql`: creates achievement profiles, profile cards, and credential verifications.
- `migrations/0013_ats_synchronizers.sql`: creates ATS connections, sync mappings, sync runs, and sync events.

The backend fails closed when bindings or secrets are missing. It does not submit applications, send email, scrape jobs, charge cards, or expose resume files publicly.

## SSO Direction

JobsFlow should not own password auth. The production path is a hosted SSO provider, with Clerk selected as the first candidate/employer login layer because it supports Vite React, prebuilt sign-in UI, social connections such as Google and Apple, phone/email flows, and backend JWT verification.

Current auth posture:

- Primary target: Clerk SSO for public candidate and employer sign-in.
- Temporary fallback: private beta bootstrap code for controlled testing.
- Existing backend boundary: JobsFlow still mints its own signed HTTP-only workspace session after SSO is verified.
- Enterprise future: WorkOS/AuthKit can be added later for employer SAML, SCIM, directory sync, and enterprise RBAC.

Clerk environment required before SSO becomes active:

```bash
VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_ISSUER=https://your-clerk-issuer
CLERK_JWKS_URL=https://your-clerk-issuer/.well-known/jwks.json
CLERK_SECRET_KEY=sk_live_...
CLERK_AUTHORIZED_PARTIES=https://jobsflow.workflowfy.ai
```

The frontend shows SSO as the recommended sign-in path when the publishable key is present. The backend only accepts Clerk sessions after verifying the JWT signature, issuer, expiration, optional authorized party, and Clerk user email through the Clerk Backend API. If SSO keys are not configured, JobsFlow keeps the private beta gate active and reports SSO as not connected.

Production activation:

```powershell
. .\.cloudflare.local.ps1
$env:NODE_OPTIONS="--use-system-ca"
npm run cf:activate-clerk -- `
  -PublishableKey "pk_live_..." `
  -Issuer "https://your-clerk-frontend-api-url"
```

The script prompts for `CLERK_SECRET_KEY` securely so it does not appear in terminal history. The activation script derives `CLERK_JWKS_URL` from the issuer unless it is passed explicitly, validates the JWKS endpoint, validates the Clerk backend key without printing it, installs backend values as Cloudflare Pages secrets, rebuilds the Vite bundle with `VITE_CLERK_PUBLISHABLE_KEY`, deploys, and verifies that `/api/health` reports `features.ssoProvider=true`. If JobsFlow later moves from direct upload deploys to Cloudflare-hosted builds, add `VITE_CLERK_PUBLISHABLE_KEY` as a Pages build environment variable too.

## Application Packet Review Engine

The first workflow-native candidate engine is now present behind `/api/packet-review`.

- Inputs: target role, company, salary range, required skills, evidence bullets, sensitive answers, exclusions, and duplicate-risk signal.
- Evaluation: deterministic evidence coverage, proof strength, salary floor guardrail, exclusion checks, duplicate prevention, and sensitive-answer approval.
- Outputs: packet readiness score, skill coverage score, proof strength, safeguards, gaps, required review gates, and external-action block reason.
- Persistence: tenant-scoped `application_packets`, `review_gates`, `state_transitions`, and `audit_events` rows.

This engine intentionally does not submit applications or send outreach. It creates the reviewed decision record that must exist before any future external integration can act.

## Run Locally

```bash
npm install
npm run dev
```

Vite serves the frontend only. To test Pages Functions locally, copy `.dev.vars.example` to `.dev.vars`, set real local values, then run:

```bash
npm run dev:pages
```

## Build

```bash
npm run build
```

## Cloudflare Resources

Create the production database and bucket:

```bash
npm run cf:setup
```

The setup script creates or reuses the D1 database and R2 bucket, writes the bindings to `wrangler.jsonc`, sets generated Pages secrets without printing them, applies migrations, deploys, and validates `/api/health`.

Manual equivalent:

```bash
npx wrangler d1 create jobsflow-prod
npx wrangler r2 bucket create jobsflow-resumes
```

Add the returned D1 database ID to `wrangler.jsonc` by uncommenting the `d1_databases` block. Then apply the schema:

```bash
npm run cf:d1:migrate:remote
```

Set production secrets in Cloudflare Pages:

```bash
npx wrangler pages secret put AUTH_SESSION_SECRET --project-name=workflowfy-jobsflow
npx wrangler pages secret put AUTH_BOOTSTRAP_TOKEN --project-name=workflowfy-jobsflow
```

Recommended auth path for the first protected beta is Cloudflare Access in front of the Pages app. JobsFlow also supports a private bootstrap-token path for the first founder/admin session. Public candidate signup should wait for a proper auth provider and email verification.

## Production Smoke Test

Use the smoke tests after setting a private bootstrap token in the current terminal. The scripts create real signed smoke tenants in production and do not print the token.

```powershell
$env:JOBSFLOW_BOOTSTRAP_TOKEN="your-private-token"
npm run cf:smoke
```

`npm run cf:smoke` checks the original production path: session creation, R2 resume upload, D1 resume metadata, packet review, and tenant-scoped audit events.

The full core production QA harness exercises every JobsFlow pillar endpoint:

```powershell
$env:JOBSFLOW_BOOTSTRAP_TOKEN="your-private-token"
$env:NODE_OPTIONS="--use-system-ca"
npm run cf:smoke:core
```

On Windows networks where Node cannot verify the Cloudflare certificate chain, keep `NODE_OPTIONS=--use-system-ca` set for smoke commands.

If the original generated bootstrap token was not stored, rotate `AUTH_BOOTSTRAP_TOKEN` in Cloudflare Pages first, then use the same value only in the terminal running the smoke test.

Smoke cleanup is guarded and only targets tenants with synthetic JobsFlow smoke email prefixes by default. It deletes matching R2 resume objects first, then deletes matching tenants from D1 with foreign-key cascade enabled. Tenants that only have smoke-like names but non-synthetic email addresses are reported and left untouched unless `--include-smoke-named-tenants` is explicitly provided.

Dry run:

```powershell
. .\.cloudflare.local.ps1
$env:NODE_OPTIONS="--use-system-ca"
npm run cf:smoke:cleanup
```

Confirmed cleanup:

```powershell
. .\.cloudflare.local.ps1
$env:NODE_OPTIONS="--use-system-ca"
npm run cf:smoke:cleanup -- --confirm
```

## Deploy

Target domain: `https://jobsflow.workflowfy.ai`

Cloudflare Pages Direct Upload:

```powershell
. .\.cloudflare.local.ps1
$env:NODE_OPTIONS="--use-system-ca"
$env:VITE_CLERK_PUBLISHABLE_KEY="pk_live_..."
npm run cf:deploy
```

`npm run cf:deploy` runs a production guard before deployment. If the live backend reports Clerk SSO as configured, the deploy refuses to continue unless `VITE_CLERK_PUBLISHABLE_KEY` is present in the local build environment. This prevents direct-upload deploys from accidentally shipping a locked Secure Access panel. For an intentional private-beta-only deploy, set `JOBSFLOW_ALLOW_SSO_DISABLED_DEPLOY=1`.

After the Pages project exists, add `jobsflow.workflowfy.ai` as a custom domain in Cloudflare Pages. If Cloudflare does not create DNS automatically, add this DNS record in the `workflowfy.ai` zone:

- Type: `CNAME`
- Name: `jobsflow`
- Target: `workflowfy-jobsflow.pages.dev`
- Proxy status: `Proxied`
- TTL: `Auto`

The app includes `public/_redirects` so workspace routes can fall back to `index.html`.

## Next Product Work

- Replace bootstrap auth with production candidate/employer signup, email verification, organization membership, and role-based access.
- Add encrypted profile fields, export/delete flows, retention jobs, and private resume download controls.
- Add resume parsing for PDF/DOCX and structured profile extraction.
- Add AI tailoring, fit evidence generation, saved response workflows, quality evals, and audit logging.
- Add job data ingestion and ATS/job-board adapters behind explicit consent.
- Add exclusion lists, duplicate detection, abuse monitoring, retention jobs, and support review tooling.
- Add Stripe Checkout or Stripe Billing with affordable candidate tiers, employer seats, customer portal, coupons, hardship pricing, transparent cancellation, and entitlement limits.
- Add employer collaboration, scorecards, pipeline analytics, fairness review flows, and candidate communication controls.
