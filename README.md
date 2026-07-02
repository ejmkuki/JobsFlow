# JobsFlow by Workflowfy AI

JobsFlow by Workflowfy AI is the candidate-trusted, employer-ready AI hiring workflow platform for `https://jobsflow.workflowfy.ai`.

JobsFlow is being shaped as a candidate-trusted, employer-ready AI hiring workflow OS. The current build includes the frontend workspace plus a Cloudflare-ready backend slice for signed sessions, tenants, resume storage, and audit logs. It does not submit applications, send email, charge cards, scrape job boards, or run AI calls.

Workflowfy AI is the public brand and operating layer for JobsFlow.

## Strategy Memo

- Current state: polished frontend SaaS scaffold with three local-state workspaces for candidates, employers, and platform trust.
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
- Candidate command center now includes application packet review, salary floor guardrails, company exclusions, duplicate prevention, and blocked-action visibility.
- Employer command center now includes scorecard weighting, interview coordination, collaboration placeholders, and decision-risk context.
- Trust & Platform now includes product states, data ownership controls, abuse prevention, and plan entitlements mapped to future Stripe billing.
- Empty, loading, error, and blocked-state copy remains frontend-only and does not call external services.

## Production Foundations Added

- `src/productModel.ts` defines the first production entity blueprint for tenants, users, candidate profiles, resumes, roles, application packets, consent receipts, audit events, and billing subscriptions.
- Trust & Platform now shows onboarding, a consent gate matrix with local toggles, provider readiness, a Stripe launch checklist, plan entitlements, and phased implementation roadmap.
- Billing remains frontend-only, but the scaffold is shaped for Stripe Checkout, Stripe Billing, customer portal, coupons, hardship pricing, and entitlement limits.
- Cloudflare Pages Functions, D1 schema, R2 resume storage hooks, signed sessions, and audit logs are now present; AI calls, payments, email, scraping, and external application submission are still intentionally absent.

## Cloudflare Backend Slice

The app now includes a real Cloudflare-ready backend surface:

- `functions/api/health.ts`: reports runtime, D1, R2, session secret, and bootstrap-token readiness.
- `functions/api/session.ts`: creates signed HTTP-only sessions through Cloudflare Access, a private bootstrap token, or localhost development mode.
- `functions/api/resumes.ts`: stores PDF/DOCX resumes in R2, writes metadata to D1, and records an audit event.
- `functions/api/audit.ts`: returns tenant-scoped audit events for the active session.
- `migrations/0001_initial.sql`: creates tenants, users, sessions, candidate profiles, resume artifacts, and audit events.

The backend fails closed when bindings or secrets are missing. It does not submit applications, send email, scrape jobs, charge cards, or expose resume files publicly.

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

## Deploy

Target domain: `https://jobsflow.workflowfy.ai`

Cloudflare Pages Direct Upload:

```bash
npm run build
npx wrangler pages deploy dist --project-name=workflowfy-jobsflow --branch=main
```

Or use the npm script:

```bash
npm run cf:deploy
```

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
