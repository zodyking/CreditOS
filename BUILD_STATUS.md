# Build status

Every requirement from the master prompt and the full feature specification, marked honestly as one of:

- **Implemented** — working end to end in this repository, against real persistence, exercised by tests and/or manually in the browser.
- **Simulated** — working end to end through a clearly labelled demo/sandbox path (no external calls).
- **Blocked on provider approval** — adapter/configuration present; the external operation is declared not implemented until credentials, contract or documentation are confirmed.
- **Not implemented** — absent in this build.

Where a line says "Implemented" and "Simulated" together, the local path is real and the external path is sandboxed.

Last updated for `v1.0.0`.

---

## Master prompt — product requirements

| # | Requirement | Status | Notes |
| --- | --- | --- | --- |
| 1 | Access and compare Equifax/Experian/TransUnion reports with licensed integrations | **Blocked on provider approval** | Adapter slots and `provider_connections` rows exist with honest `not_connected` status; no licensed data agreement exists, so no live pull is attempted. |
| 1 | Manual report import | **Implemented** (JSON) / **Not implemented** (PDF) | Normalized JSON import per bureau with zod validation and full provenance. Bureau PDF parsing is not implemented. |
| 1 | Synthetic demo data | **Simulated** | Three distinct synthetic snapshots with deliberate conflicts, seeded on first boot in demo mode. |
| 1 | Preserve source facts and report dates; show source/mode/recency | **Implemented** | Snapshot source, mode and report date shown on dashboard and reports; evidence items carry bureau, snapshot and report date. |
| 1 | Three-bureau discrepancy detection | **Implemented** | Balance, payment history/month conflicts, ownership, status, missing-at-bureau, duplicate collections; evidence links per bureau. |
| 1 | Never invent a score | **Implemented** | Score shown only when the imported snapshot supplies one, with model and provider. |
| 2 | Near-real-time monitoring only where providers offer notifications | **Not implemented** (no such provider) | The UI never claims real-time updates. |
| 2 | Scheduled polling with visible last-check timestamps | **Implemented** | Hourly `monitoring.poll` job; `lastCheckedAt` / `nextEligibleCheckAt` shown per bureau. Polling re-runs detection over stored snapshots. |
| 2 | Detect inaccurate/incomplete/obsolete/duplicate/unauthorized reporting | **Implemented** (partial) | Inaccurate, incomplete (missing at bureau), duplicate and status/ownership contradictions are detected. Obsolescence (7-year date-of-first-delinquency ageing) is evaluated by the rules engine when dates are present; unauthorized reporting relies on the user flagging identity theft. |
| 2 | Reviewable tickets and deduplicated alerts | **Implemented** | Fingerprinted monitoring events, suppressed duplicates counter, review/dismiss/reopen. |
| 2 | Never characterise every negative account as disputable | **Implemented** | Rules return `yes / no / uncertain` with evidence gaps; negative but consistent items are `no`/`monitor_only`. |
| 3 | Evidence-driven rules engine with distinct categories | **Implemented** | `core-consumer-reporting` pack: inaccuracy, identity theft, goodwill, furnisher direct dispute, collections/validation, needs-more-evidence; each verdict carries legal basis, gaps, review window and a not-legal-advice disclaimer. |
| 4 | Freeze management across nine agencies | **Implemented** (guided) | Equifax, Experian, TransUnion, Innovis, ChexSystems, LexisNexis/SageStream, NCTUE, The Work Number, DataX with request methods, evidence, history and honest states. |
| 4 | Automate only through authorized official interfaces | **Not implemented** (none exist) | All workflows are guided; confirmation requires a reference or uploaded evidence. |
| 4 | Never claim a freeze is active based on submission | **Implemented** | `assertFreezeTransition` refuses `CONFIRMED_*` states without evidence; tested. |
| 5 | Case workspace with evidence, status, plan, timeline, correspondence, deadlines, documents, blockers, next action | **Implemented** | Hero case page; blockers banner; next-action card; progress rail from real state. |
| 5 | Linked/merged cases, filters, search, history | **Implemented** | Link and merge-into (duplicate) flows; query-synced filters; timeline distinguishes factual events from agent interpretation. |
| 6 | Real multi-agent council with critiques, replies, revised proposals, recorded votes, minority opinions | **Implemented** (live) / **Simulated** (demo) | Six roles, three rounds, ballots with rationale, dissent recorded, durable transcript and machine-readable plan. Live path uses OpenRouter structured outputs; demo path is a deterministic simulator. |
| 6 | Chair bound by hard gates and user authorization | **Implemented** | `reconcileDecision`: compliance failure → reject; failed gate + proceed → collect evidence (summary marked "OVERRIDDEN BY HARD GATES"); split vote → escalate. Tested. |
| 7 | Individualized strategy and letter with branching response forecast | **Implemented** | Plan with ≥ 5 scenarios (deleted, corrected, verified/no change, partial update, more information requested, undeliverable, no response, rerouted), each with next step and needed proof, labelled illustrative. |
| 7 | Re-run analysis when a real response arrives | **Implemented** | Inbound analysis classifies the response, records the outcome on the case and enqueues a council re-run. |
| 8 | Outbound mail adapters (DocuPost / PostGrid) | **Implemented** (PostGrid create/status/webhook) · **Blocked on provider approval** (DocuPost) · **Simulated** (sandbox) | See `INTEGRATIONS.md` §5. PostGrid not exercised against a live account in this build. |
| 8 | PDF letters, preview/edit/history, recipient validation, cost estimates, explicit approval, idempotent sending, external ids, status tracking, webhooks | **Implemented** | Local address completeness check and local estimates only (provider quote/verification not implemented). |
| 8 | Never promise certified mail/tracking unsupported by provider | **Implemented** | Capabilities are declared per adapter and surfaced in the approval bundle. |
| 9 | Inbound mailroom connector architecture (PostScan / Earth Class) | **Blocked on provider approval** | Interface, envelope-vs-content scan states and settings cards exist; no provider call is made. |
| 9 | Manual upload fallback, extraction, matching, triage, reanalysis | **Implemented** | Text-layer extraction; images need a manual transcription (no OCR). |
| 10 | Eleven pages, responsive, meaningful controls, persistent state, Demo vs Live marking, loading/error/empty/disconnected states | **Implemented** | Dashboard, Reports, Monitoring, Cases, Case detail, Freeze center, Mailroom, Vault, Approvals, Activity, Settings. Live/Reconnecting indicator for SSE. |

## Master prompt — platform and architecture

| Requirement | Status | Notes |
| --- | --- | --- |
| Modular domains | **Implemented** | `server/domains/{reports,monitoring,cases,rules,council,correspondence,mailroom,freezes,documents,jobs,settings,ai,seed}`. |
| Shared provider interfaces declaring supported operations | **Implemented** | `implemented` / `capabilities` on every adapter, rendered in Settings. |
| State machines for case / freeze / outbound / inbound with no skipped states | **Implemented** | `shared/state-machines.ts`, enforced server-side, tested. |
| Persist every event, source and timestamp | **Implemented** | `case_events`, `audit_log`, mail order events, inbound status history. |
| Estimated vs verified dates distinguished | **Implemented** | Expected windows labelled "estimated"; delivery only from provider evidence. |
| Durable job scheduling with retries | **Implemented** | Postgres queue (`SKIP LOCKED`), exponential backoff, dead-letter, idempotency keys, retry from Settings. |
| Authentication and secure foundations | **Implemented** | See `SECURITY.md`. Single owner; no MFA. |
| Database migrations, seed script, env example, Docker Compose, Windows start commands, automated tests | **Implemented** | `server/db/migrations`, `pnpm db:seed`, `.env.example`, `docker-compose.yml`, README Windows section, vitest (64 tests). |
| Dark/light themes | **Implemented** | Persisted theme toggle. |

## Master prompt — required test scenarios

| Scenario | Status | Where |
| --- | --- | --- |
| Three conflicting bureau snapshots | **Implemented** | `tests/detect.test.ts`; seed data |
| Incorrect tradeline | **Implemented** | `tests/detect.test.ts`, `tests/rules.test.ts` |
| Disputed item with weak evidence | **Implemented** | `tests/rules.test.ts`, `tests/council.test.ts` (collect_evidence) |
| Multi-agent disagreement | **Implemented** | `tests/council.test.ts` (dissent, escalate on split) |
| Rejection of an unsupported claim | **Implemented** | `tests/council.test.ts` (identity theft without report → reject; fabrication gate) |
| Revised letter approved then sent once after duplicate callback/retry | **Implemented** (unit) | `tests/webhook.test.ts` (idempotent order id, duplicate event id); DB-level unique index on idempotency key. A full DB-backed integration test is **Not implemented**. |
| Inbound multi-page scan processed into correct ticket | **Implemented** (unit) | `tests/mailroom.test.ts` (case-code extraction across pages, classification); manual flow exercised in the browser. |
| Unknown sender routed to unassigned | **Implemented** | Mailroom "Unassigned" tab; extraction with no case code yields no match. |
| Bureau response changes plan | **Implemented** | Inbound analysis → council re-run; scenarios include response categories. |
| Freeze submitted but not confirmed | **Implemented** | `tests/state-machines.test.ts` (confirmation without evidence rejected). |
| All providers disconnected | **Implemented** | Settings and dashboard render honest `not_connected` states; app boots without any provider key. |
| Malicious/invalid PDF rejected | **Implemented** | `tests/upload.test.ts` (empty, wrong magic bytes, JavaScript-bearing PDF, forbidden extension). |
| Front-end workflow (E2E) tests | **Not implemented** | Flows were exercised manually in a browser; no Playwright suite is committed. |

## Feature specification — acceptance tests (§16)

| # | Test | Status |
| --- | --- | --- |
| 1 | Import/simulate three snapshots and compare without false joins | **Implemented** |
| 2 | Detect a real discrepancy, dedupe, create a case linked to source facts | **Implemented** |
| 3 | Case dossier + multi-round debate with evidence references, critiques, ballots, dissent | **Implemented** / **Simulated** (demo) |
| 4 | Conditional plan with ≥ 4 hypothetical branches | **Implemented** |
| 5 | Render and download the exact PDF with attachments; edit and approve | **Implemented** (exhibit list included in the letter; attached documents are listed, not merged into one PDF) |
| 6 | Block sending until approved; idempotency under retried callbacks | **Implemented** |
| 7 | Inbound multi-page PDF matched, analysed, council re-run | **Implemented** (manual upload) |
| 8 | Unknown mail to unassigned triage | **Implemented** |
| 9 | All freeze agencies tracked; no confirmation without evidence | **Implemented** |
| 10 | LIVE/DEMO labels on snapshots, mail, AI outcomes, events | **Implemented** |
| 11 | Stop external requests when credentials absent, consent revoked, cost cap exceeded, or unsupported assertion generated | **Implemented** (AI consent, mail consent, cost cap, fabrication gate) — three informational consents are recorded only, see `INTEGRATIONS.md` §2 |
| 12 | Automated API, job, state machine, frontend, webhook signature and UI E2E tests | **Implemented** (state machine, rules, detection, council, mailroom, upload, webhook signature) · **Not implemented** (API/job integration tests against a database, UI E2E) |
| 13 | Works on clean Windows 11 and Docker; no dependency on `System32` | **Implemented** (documented; Windows run not performed in this build environment) |

## Feature specification — other notable items

| Item | Status |
| --- | --- |
| Bureau PDF report parsing | **Not implemented** |
| User confirmation for ambiguous account matches | **Not implemented** (matching is deterministic by brand + last four; unmatched accounts stay separate) |
| Email / SMS / push notifications | **Not implemented** (in-app + SSE only) |
| Multi-user accounts | **Not implemented** (single owner) |
| OCR for image scans | **Not implemented** (manual transcription path provided) |
| Scheduled temporary freeze lifts | **Implemented** (lift windows recorded; execution is guided, not automated) |
| Configurable rule packs | **Implemented** (JSON pack loaded at boot; UI is read-only) |
| Agent performance evaluation / analytics | **Not implemented** |
| Data retention / purge tooling | **Not implemented** |
