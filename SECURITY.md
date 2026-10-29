# Security

CreditOS handles some of the most sensitive personal data a person owns: credit reports, dispute correspondence, identity documents. This document describes the controls that exist in this build, the limitations you must understand before exposing it to the internet, and a launch checklist for production.

## Reporting a vulnerability

Open a private security advisory on the GitHub repository (Security → Advisories → "Report a vulnerability") or contact the repository owner directly. Please do not file public issues for security problems.

---

## 1. Threat model and scope

- **Deployment shape:** single-tenant, self-hosted, one owner account (optional additional users are not implemented). One Node process serves the UI, API, SSE stream and job worker; PostgreSQL and the document directory hold all state.
- **Assets:** report snapshots, uploaded documents and rendered letters (`DATA_DIR`), provider secrets (OpenRouter and mail keys), session cookies, audit log.
- **Out of scope for this build:** multi-tenant isolation, SOC2-style controls, HSM/KMS integration, anti-abuse at scale.

## 2. Controls implemented

### Authentication and sessions
- Owner account created on first run (`/api/auth/setup`), refused once any user exists.
- Passwords hashed with `scrypt` (random salt, constant-time comparison). Minimum 12 characters.
- Sessions via `nuxt-auth-utils`: sealed, `HttpOnly`, `SameSite=Lax`, `Secure` in production, 12-hour lifetime, signed with `NUXT_SESSION_PASSWORD`.
- Login throttle: 10 attempts per 10 minutes per IP + email (in-memory; resets on restart).
- Every API route except `/api/health`, `/api/auth/*` and provider webhooks requires an authenticated session, and every query is scoped to the session user's id.

### Secrets
- Provider secrets stored in the database are encrypted with AES-256-GCM under `APP_ENCRYPTION_KEY` (32 bytes). Secrets entered in Settings are never returned to the browser; only a masked suffix and the key source (`environment` / `database`) are shown.
- Secrets are never written to the audit log; audit metadata passes through a PII redactor (SSN-like, long digit runs, email-like strings) and is truncated.

### Uploads and documents
- Content type determined by **magic bytes** (`file-type`), never by the declared extension or `Content-Type`. Only PDF, JPEG and PNG are accepted; 25 MB limit; dangerous declared extensions rejected.
- PDFs are parsed with `pdf-lib`; files containing `/JavaScript`, `/JS`, `/Launch`, `/OpenAction`, `/AA`, `/EmbeddedFile`, `/RichMedia` or `/XFA` are rejected outright; encrypted PDFs and PDFs over 200 pages are rejected.
- Stored under a random UUID filename inside `DATA_DIR/documents`; original filenames are sanitised (path separators, control characters and `..` removed) before being used in `Content-Disposition`.
- SHA-256 recorded for every document and every rendered letter PDF; the approval flow requires the exact hash to be echoed back.
- Downloads are owner-scoped and soft-deleted documents are not served.

### Mail, approvals and money
- No outbound order can be created without an approval record, three explicit confirmations, the mailing consent text hash and the PDF hash.
- Idempotency keys with a partial unique index guarantee one provider order per approved letter version even under job retries.
- `test` mode forces sandbox; `demo` mode cannot perform live AI or live mail at all.
- Per-run OpenRouter cost cap; exceeding it fails the run.

### Webhooks
- Unauthenticated by necessity; therefore every payload must carry a valid provider signature (sandbox: HMAC-SHA256; PostGrid: HS256 JWT), compared in constant time. Invalid signatures return 401 and are audited. Payloads are capped at 512 KB. Events are deduplicated by external event id.

### AI boundary
- Models receive a PII-minimised dossier (masked account numbers, labelled evidence summaries). They never receive SSNs, raw documents or secrets.
- All model output is validated against JSON schemas; any citation that does not resolve to dossier evidence fails the fabrication gate and the chair cannot proceed.
- The chair cannot override compliance or evidence gates; this is enforced in code (`reconcileDecision`), not by prompt.

### Transport and headers
- Responses carry `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, a restrictive `Permissions-Policy` and `Cross-Origin-Opener-Policy: same-origin`.
- `robots: noindex` on every page.
- TLS termination is expected from the reverse proxy (Dokploy/Traefik, Caddy, nginx).

### Auditability
- Every consequential transition (case, freeze, outbound, inbound, approval, settings change, webhook) writes an `audit_log` row with actor, target, redacted metadata, IP and user agent.
- State machines refuse illegal transitions server-side (`assertTransition`), so a client cannot skip states.

## 3. Known limitations (read before going live)

1. **No Content-Security-Policy header yet.** Vue/Nuxt inline hydration scripts make a strict CSP non-trivial; add a nonce-based CSP at the reverse proxy or via Nitro once you have verified the app under it.
2. **Login throttling is in-memory** and per process. Behind a load balancer or after restarts it resets. Put rate limiting at the proxy for internet-facing deployments.
3. **Single owner, no MFA.** There is no second factor and no account recovery flow. Protect the deployment with network-level controls (VPN, Tailscale, proxy auth) if it is reachable from the internet.
4. **Documents are stored unencrypted on disk** (`DATA_DIR`). Rely on volume/disk encryption and strict file permissions; the container runs as a non-root user.
5. **Three of five consents are recorded but not enforced** (`pull_reports`, `analyze_documents`, `store_evidence`). See `INTEGRATIONS.md` §2.
6. **No data retention/purge policy.** Soft-deleted documents remain on disk until removed manually.
7. **No CSRF token.** Protection relies on `SameSite=Lax` session cookies and JSON bodies; do not relax the cookie policy.
8. **Provider contact details for freeze agencies are static data** with a last-verified date; verify them before mailing anything.
9. **The sandbox webhook secret falls back to a documented development value** when `MAIL_WEBHOOK_SECRET` is unset. Always set it in production.
10. **Live PostGrid flow has not been exercised against a real account in this build.**
11. **No automated dependency scanning or SBOM** is configured in the repository.

## 4. Production launch checklist

- [ ] `APP_MODE` set deliberately (`test` first, then `live`); `DEMO_SEED=false`.
- [ ] Strong, unique `NUXT_SESSION_PASSWORD` (≥ 48 random bytes) and `APP_ENCRYPTION_KEY` (32 random bytes) stored in Dokploy secrets, never in the repository. Rotating `APP_ENCRYPTION_KEY` requires re-entering stored provider keys.
- [ ] `MAIL_WEBHOOK_SECRET` set to the provider's signing secret; webhook URL configured at the provider.
- [ ] PostgreSQL reachable only from the app network, with its own credentials, TLS (`sslmode=require`) where the host supports it, and automated backups tested by a restore.
- [ ] Persistent volume mounted at `/data` with backups; disk encryption enabled on the host.
- [ ] HTTPS enforced at the reverse proxy; HSTS enabled; HTTP → HTTPS redirect.
- [ ] Reverse-proxy rate limiting on `/api/auth/login` and `/api/webhooks/*`.
- [ ] Network-level access control (VPN/zero-trust/proxy auth) in front of the app, since there is no MFA.
- [ ] Content-Security-Policy configured at the proxy and verified in the browser console.
- [ ] Consents granted deliberately in Settings → Consents before enabling live AI or live mail.
- [ ] OpenRouter cost cap set to a value you are comfortable losing per council run; key verified from Settings → AI.
- [ ] PostGrid tested with a `test_sk_` key end-to-end (order → webhook → status) before switching to `live_sk_`.
- [ ] `GET /api/health` wired to uptime monitoring; container logs shipped somewhere durable.
- [ ] Node base image and dependencies updated (`pnpm audit`, rebuild the image) on a schedule.
- [ ] A retention plan for documents, letters and audit logs agreed and documented.
