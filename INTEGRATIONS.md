# Integrations

This document states exactly which external operations CreditOS performs for real, which are simulated, and which are deliberately not implemented. Nothing in the product pretends an external call succeeded when it did not. Every provider implements a shared adapter interface and declares its supported operations in code (`implemented` / `capabilities`), and the Settings → Integrations page renders those declarations directly.

Legend used below:

- **Implemented** — real code path against a documented API, exercised against a sandbox or real endpoint.
- **Simulated** — a fully working local path (sandbox/simulator) that is labelled as such everywhere.
- **Blocked on provider approval** — adapter and configuration exist; the network operation is declared `implemented: false` until credentials/contract/documentation are confirmed.
- **Not implemented** — intentionally absent.

---

## 1. Operating modes: Demo / Test / Live

`APP_MODE` is read at boot (`demo` by default).

| | `demo` | `test` | `live` |
| --- | --- | --- | --- |
| Report import | Stored with `mode=sandbox`; synthetic seed loaded on first boot when `DEMO_SEED=true` | `mode=live` | `mode=live` |
| Council | Deterministic simulator only. Live AI is disabled by design even if a key is present | Live OpenRouter calls when a key is stored **and** "Live council runs" is enabled; otherwise simulator | Same as `test` |
| Outbound mail | Sandbox only | A provider whose adapter reports `mode=live` is **forced to sandbox** | Configured provider, subject to approval + consent |
| Inbound mail | Manual upload | Manual upload (+ connector if ever configured) | Same |
| Labels | Orchid **Demo** badges on snapshots, council runs, mail orders and scenarios | Live/Sandbox badges per record | Live/Sandbox badges per record |

To switch modes, change `APP_MODE` and restart the container. Mode is recorded on every snapshot, council run, mail order and inbound item at the time it was created, so historical demo records stay labelled Demo after switching to live.

Settings → AI shows the current reason live AI is unavailable (`APP_MODE is demo`, `No OpenRouter API key configured`, or `Live council runs are switched off`).

---

## 2. Consent and authorization

Consents are stored per user in the `consents` table with the consent text version and grant/revoke timestamps (Settings → Consents):

| Consent | Enforced where |
| --- | --- |
| `ai_processing` | Council hard gate (`consentPresent`). Outside demo mode a missing consent fails the gate, so the chair can never `proceed`. |
| `send_correspondence` | `requestMailApproval` refuses to create an approval bundle without it, so nothing can be queued or dispatched. |
| `pull_reports`, `analyze_documents`, `store_evidence` | **Recorded only.** They are stored with version and timestamps and shown in Settings, but no code path currently refuses an import, extraction or upload when they are missing. |

Approval bundles display and hash the exact mailing consent text the user accepts; the hash is stored with the approval (`consent_text_hash`). Revoking a consent stops future external actions; it does not recall mail already handed to a provider.

---

## 3. Credit report data (Equifax, Experian, TransUnion)

| Operation | Status | Notes |
| --- | --- | --- |
| Manual JSON import of a normalized report per bureau (`POST /api/reports/import`) | **Implemented** | Validated with zod (`importReportSchema`), preserves report date, source and original tradeline facts, then runs discrepancy detection. |
| Synthetic tri-bureau demo dataset | **Simulated** | Three distinct snapshots with deliberate conflicts (balance, payment history, ownership, status, duplicate collection). Labelled Demo. |
| Scheduled polling / last-check timestamps / dedupe | **Implemented** (against stored data) | A recurring `monitoring.poll` job re-runs detection, records `lastCheckedAt` / `nextEligibleCheckAt` and suppresses duplicate alerts by fingerprint. |
| Licensed bureau / aggregator pull (e.g. Array, Experian Connect, direct bureau contracts) | **Blocked on provider approval** | `provider_connections` rows (`kind=credit_data`) exist with honest `not_connected` status. No endpoint is called because no licensed agreement or credentials exist. |
| Provider push notifications ("real-time" alerts) | **Not implemented** | Only possible where a licensed provider offers webhooks; the UI never claims real-time monitoring. |
| Credit score | **Implemented (display only)** | Shown only when the imported report includes one (model and provider are shown). CreditOS never computes or invents a score. |

### Import format

`POST /api/reports/import` accepts `{ bureau, reportDate, source, score?, tradelines[], inquiries[], publicRecords[], personalInfo }` — see `server/domains/reports/normalize.ts` for the exact schema. Account matching across bureaus uses a normalized creditor brand plus the last four digits of the masked account number; unrelated accounts are never joined.

---

## 4. AI — OpenRouter

| Operation | Status | Notes |
| --- | --- | --- |
| API key storage | **Implemented** | Either `OPENROUTER_API_KEY` (env) or entered in Settings → AI and stored AES-256-GCM encrypted with `APP_ENCRYPTION_KEY`. Settings shows the key source (`environment` / `database` / `none`). |
| Key verification | **Implemented** | `GET https://openrouter.ai/api/v1/auth/key` on store/verify. |
| Model catalogue | **Implemented** | `GET https://openrouter.ai/api/v1/models`, cached 10 minutes, searchable by name/provider, filterable to models that support structured outputs; shows context length, pricing and modality flags. |
| Advanced model selection | **Implemented** | A default model plus an optional per-role override for each of the six council roles; temperature, max tokens, per-run cost cap (USD), provider routing (`provider.order`, `allow_fallbacks`, `require_parameters`). |
| Live council | **Implemented** (requires key, `APP_MODE≠demo`, consent, live toggle) | Six roles × three rounds with JSON-schema structured outputs, citation validation against the dossier (fabrication gate) and cost accounting per run. Exceeding the cost cap aborts the run: it is marked `failed` with the spend recorded, a case event and a notification are written, and no plan is produced. |
| Connection probe | **Implemented** | Settings → AI → "Run probe" issues a tiny structured completion and reports latency and cost. |
| Local/offline models | **Not implemented** | OpenRouter only. |

PII minimisation: the dossier sent to models contains masked account numbers, labelled evidence summaries and the contested facts; never SSNs, full account numbers or raw document bytes.

---

## 5. Outbound physical mail

Adapter interface: `server/domains/correspondence/outbound/types.ts` (`validateAddress`, `estimateCost`, `createOrder`, `getStatus`, `verifyWebhook`). Select with `MAIL_OUTBOUND_PROVIDER`.

### Sandbox (`sandbox`, default)

| Operation | Status |
| --- | --- |
| Address completeness check, local cost estimate, idempotent order creation (`sbx_<sha256(idempotencyKey)>`), status, HMAC-SHA256 signed webhooks (`X-CreditOS-Signature`) | **Simulated** — nothing is printed or mailed, ever |

Simulated provider events can be posted from Mailroom → Outbound → "Simulate event" or by calling `POST /api/webhooks/mail/sandbox` with a valid signature (`MAIL_WEBHOOK_SECRET`, falling back to a documented development secret).

### PostGrid Print & Mail (`postgrid`)

| Operation | Status | Notes |
| --- | --- | --- |
| Create letter order (`POST /print-mail/v1/letters`, multipart PDF, `x-api-key`) | **Implemented** | CreditOS's idempotency key is sent as the `Idempotency-Key` header; the external order id is stored. `test_sk_` keys keep the adapter in sandbox mode; `live_sk_` + `APP_MODE=live` is required for live. |
| Fetch letter status (`GET /print-mail/v1/letters/{id}`) | **Implemented** | Mapped to CreditOS outbound states; unknown statuses become `TRACKING_UNKNOWN`, never "delivered". |
| Webhooks (`POST /api/webhooks/mail/postgrid`) | **Implemented** | HS256 JWT signature verified with `MAIL_WEBHOOK_SECRET`; events applied idempotently by external event id; duplicates are counted and ignored. |
| Address verification | **Not implemented** | PostGrid Address Verification is a separate product; only a local completeness check runs. |
| Exact cost quote | **Not implemented** | PostGrid bills actuals; CreditOS shows a clearly labelled local estimate. |
| Certified mail / return receipt | **Declared capability, not exercised** | Offered only if the PostGrid account supports it; CreditOS does not promise tracking it has not received. |

Not verified against a live PostGrid account in this build; verified against the documented request/response shapes and signature scheme only.

### DocuPost (`docupost`)

| Operation | Status |
| --- | --- |
| All network operations | **Blocked on provider approval** — the adapter exists with configuration help, declares every operation `implemented: false`, and cannot create orders. The Settings page says so. |

### Safeguards common to all providers

- Nothing is queued without an approval bundle, three explicit confirmations and the exact PDF SHA-256 echoed back.
- One mail order per approved letter version (`idempotencyKey` unique index); retried dispatch jobs cannot create duplicates.
- `test` mode forces sandbox regardless of the configured provider.
- Webhook endpoints are unauthenticated by design and therefore reject any payload without a valid signature (HTTP 401, audited).

---

## 6. Inbound mailroom

Adapter interface: `server/domains/mailroom/providers.ts` (`listNewItems`, `requestContentScan`, `fetchDocument`, `webhooks`). Select with `MAIL_INBOUND_PROVIDER`.

| Provider | Status | Notes |
| --- | --- | --- |
| Manual upload (`manual`, default) | **Implemented** | PDF/JPEG/PNG upload with magic-byte validation, PDF active-content rejection, SHA-256, text-layer extraction (`unpdf`), case-code / account / date extraction, response classification, candidate matching, unassigned triage, manual transcription for scans without a text layer, automatic council re-run after analysis. |
| PostScan Mail (`postscan`) | **Blocked on provider approval** | Scaffold only. Envelope-scan vs full-content-scan distinction is modelled in the inbound state machine (`RECEIVED_ENVELOPE → AWAITING_CONTENT_SCAN → SCANNED`), but no PostScan API call is made. |
| Earth Class Mail (`earthclass`) | **Blocked on provider approval** | Scaffold only, same as above. |
| OCR for image scans | **Not implemented** | Images are stored as evidence and flagged; a manual transcription unlocks analysis. |

---

## 7. Security freezes

All nine agencies (Equifax, Experian, TransUnion, Innovis, ChexSystems, LexisNexis/SageStream, NCTUE, The Work Number, DataX) are **guided workflows**: none offers a consumer-facing freeze API, so CreditOS prepares the request (portal URL, phone, mailing address, required evidence), the user submits it through the official channel, and records the outcome with a confirmation reference or uploaded confirmation.

| Operation | Status |
| --- | --- |
| Agency matrix, request methods, evidence requirements, history | **Implemented** |
| State machine with `SUBMITTED → PENDING_VERIFICATION → CONFIRMED_FROZEN` requiring evidence for confirmed states | **Implemented** |
| Automated freeze placement through an agency API | **Not implemented** (no authorized interface exists) |

Published contact details carry a `lastVerifiedAt` date in the UI and should be re-verified periodically.

---

## 8. Notifications

| Channel | Status |
| --- | --- |
| In-app notifications + server-sent events | **Implemented** |
| Email / SMS / push | **Not implemented** (P2) |

---

## 9. Webhook endpoints

| Route | Auth | Purpose |
| --- | --- | --- |
| `POST /api/webhooks/mail/sandbox` | HMAC-SHA256 `X-CreditOS-Signature` | Simulated provider events |
| `POST /api/webhooks/mail/postgrid` | HS256 JWT body signature | PostGrid letter events |

Requests for a provider that is not the active outbound provider return `409`; unknown providers `404`; payloads over 512 KB `413`; invalid signatures `401` with an audit entry.
