import { eq } from 'drizzle-orm'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { getDb, schema } from '../../db'
import { audit } from '../../utils/audit'
import { hashPasswordScrypt } from '../../utils/password'
import { createCaseFromDiscrepancy, createManualCase } from '../cases/service'
import { runCouncil } from '../council/orchestrator'
import { decideApproval, requestMailApproval, applyProviderEvents } from '../correspondence/mail'
import { latestLetter } from '../correspondence/letters'
import { storeDocument } from '../documents/storage'
import { ensureAgencies, startFreezeRequest, transitionFreeze } from '../freezes/service'
import { runOnce } from '../jobs/queue'
import { ingestManualUpload } from '../mailroom/service'
import { importReport, runDiscrepancyDetection } from '../reports/service'
import { DEMO_EQUIFAX, DEMO_EQUIFAX_PREVIOUS, DEMO_EXPERIAN, DEMO_TRANSUNION } from './demo-reports'

export const DEMO_EMAIL = 'demo@creditos.local'
export const DEMO_PASSWORD = 'creditos-demo'

async function drainJobs(max = 50) {
  for (let i = 0; i < max; i++) {
    const did = await runOnce()
    if (!did) break
  }
}

async function textPdf(lines: string[]): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  let page = pdf.addPage([612, 792])
  let y = 740
  for (const line of lines) {
    if (line === '---PAGE---') {
      page = pdf.addPage([612, 792])
      y = 740
      continue
    }
    page.drawText(line, { x: 72, y, size: 11, font })
    y -= 16
  }
  return Buffer.from(await pdf.save())
}

/**
 * Seeds a complete, explorable demo. Idempotent: skips when any user exists.
 * Everything created here is mode=demo and labelled as such in the UI.
 */
export async function seedDemo(opts: { force?: boolean } = {}): Promise<{ seeded: boolean; reason?: string }> {
  const db = getDb()
  const existing = await db.select({ id: schema.users.id }).from(schema.users).limit(1)
  if (existing.length && !opts.force) return { seeded: false, reason: 'users already exist' }

  await ensureAgencies()

  const passwordHash = await hashPasswordScrypt(DEMO_PASSWORD)
  const [user] = await db
    .insert(schema.users)
    .values({
      email: DEMO_EMAIL,
      passwordHash,
      displayName: 'Jordan Avery Demo',
      role: 'owner',
      automationMode: 'recommend_and_draft',
      mailingAddress: { name: 'Jordan Avery Demo', line1: '1420 Harbor View Ln', line2: 'Apt 3B', city: 'Portland', state: 'OR', postalCode: '97209', country: 'US' },
    })
    .returning()
  const userId = user!.id

  for (const kind of ['pull_reports', 'analyze_documents', 'store_evidence', 'ai_processing', 'send_correspondence']) {
    await db.insert(schema.consents).values({ userId, kind, granted: true, grantedAt: new Date(), textVersion: 'v1' })
  }
  for (const bureau of ['equifax', 'experian', 'transunion'] as const) {
    await db.insert(schema.providerConnections).values({ userId, kind: 'credit_data', provider: `demo:${bureau}`, mode: 'demo', status: 'healthy', config: { bureau }, lastSyncAt: new Date(), lastCheckedAt: new Date(), nextEligibleCheckAt: new Date(Date.now() + 86_400_000) })
  }
  await db.insert(schema.providerConnections).values({ userId, kind: 'mail_outbound', provider: 'sandbox', mode: 'sandbox', status: 'healthy', config: {} })
  await db.insert(schema.providerConnections).values({ userId, kind: 'mail_inbound', provider: 'manual', mode: 'live', status: 'healthy', config: {} })
  await db.insert(schema.providerConnections).values({ userId, kind: 'ai', provider: 'openrouter', mode: 'demo', status: 'not_connected', config: {} })

  // Reports: an older Equifax snapshot first so monitoring diffs exist.
  await importReport(userId, DEMO_EQUIFAX_PREVIOUS, 'demo')
  await importReport(userId, DEMO_EQUIFAX, 'demo')
  await importReport(userId, DEMO_EXPERIAN, 'demo')
  await importReport(userId, DEMO_TRANSUNION, 'demo')

  await runDiscrepancyDetection(userId)
  const discrepancies = await db.select().from(schema.discrepancies).where(eq(schema.discrepancies.userId, userId))
  const byFp = (prefix: string) => discrepancies.find(d => d.fingerprint.startsWith(prefix))

  // Case A — Capital One balance: council → plan → approval pending.
  const capOne = byFp('misreported_balance:')
  let caseA: typeof schema.cases.$inferSelect | undefined
  if (capOne) {
    caseA = await createCaseFromDiscrepancy(userId, capOne.id, 'system')
    await db.insert(schema.caseEvidence).values({ caseId: caseA.id, label: 'E4', kind: 'user_statement', description: 'I paid this card down to $0 in July 2026 and have the statement; TransUnion is stale, the other two are correct.', credibility: 'medium', addedBy: 'user' })
    const stmt = await textPdf(['Capital One — Monthly Statement', 'Account ending 4421', 'Statement date: 2026-08-02', 'Previous balance: $860.10', 'Payments: -$860.10', 'New balance: $0.00'])
    const doc = await storeDocument({ userId, buffer: stmt, filename: 'capital-one-statement-aug-2026.pdf', kind: 'evidence', caseId: caseA.id, source: 'upload', mode: 'demo', title: 'Capital One statement (Aug 2026)' })
    await db.insert(schema.caseEvidence).values({ caseId: caseA.id, label: 'E5', kind: 'document', description: 'Capital One statement dated 2026-08-02 showing $0.00 balance', documentId: doc.id, credibility: 'high', addedBy: 'user' })
    await runCouncil(caseA.id, 'initial', 'system')
    const letter = await latestLetter(caseA.id)
    if (letter) await requestMailApproval(userId, caseA.id, letter.id, { mailClass: 'first_class' })
  }

  // Case B — Chase payment history: full outbound cycle through sandbox + inbound response.
  const chase = byFp('misreported_payment:')
  if (chase) {
    const caseB = await createCaseFromDiscrepancy(userId, chase.id, 'system')
    const proof = await textPdf(['Chase Auto Finance — Payment confirmation', 'Account ending 7788', 'Payment of $512.00 received 2026-03-09', 'Due date: 2026-03-10', 'Status: Paid on time'])
    const doc = await storeDocument({ userId, buffer: proof, filename: 'chase-auto-payment-mar-2026.pdf', kind: 'evidence', caseId: caseB.id, source: 'upload', mode: 'demo', title: 'Chase payment confirmation (Mar 2026)' })
    await db.insert(schema.caseEvidence).values({ caseId: caseB.id, label: 'E4', kind: 'document', description: 'Chase payment confirmation dated 2026-03-09 (before the 2026-03-10 due date)', documentId: doc.id, credibility: 'high', addedBy: 'user' })
    await runCouncil(caseB.id, 'initial', 'system')
    const letter = await latestLetter(caseB.id)
    if (letter) {
      const { approvalId, order } = await requestMailApproval(userId, caseB.id, letter.id, { mailClass: 'first_class' })
      await decideApproval(userId, approvalId, 'approved', 'Reviewed the letter and the enclosed payment confirmation.')
      await drainJobs()
      const fresh = await db.query.mailOrders.findFirst({ where: eq(schema.mailOrders.id, order.id) })
      if (fresh?.providerOrderId) {
        // Simulated provider callback (and a duplicate replay that must be ignored).
        const evt = { externalEventId: `evt_demo_${fresh.id.slice(0, 8)}_mailed`, providerOrderId: fresh.providerOrderId, status: 'MAILED' as const, occurredAt: new Date(Date.now() - 20 * 86_400_000), raw: { sandbox: true, demo: true } }
        await applyProviderEvents('sandbox', [evt], true)
        await applyProviderEvents('sandbox', [evt], true)
      }
      const response = await textPdf([
        'Experian',
        'P.O. Box 4500, Allen, TX 75013',
        '',
        `Re: Dispute results — Reference ${caseB.code}`,
        'Date: ' + new Date().toLocaleDateString('en-US'),
        '',
        'Dear Jordan Avery Demo,',
        '',
        'We have completed the reinvestigation of the item you disputed.',
        'CHASE AUTO account ending in 7788: the information has been verified',
        'as accurate and remains as reported. The furnisher confirmed the item.',
        '',
        'If you still disagree, you may add a statement of dispute to your',
        'file or contact the furnisher directly.',
        '---PAGE---',
        'Page 2 — Summary of results',
        'Item: CHASE AUTO ****7788',
        'Result: Verified — remains as reported',
        'Synthetic demo document generated by CreditOS. Not a real bureau letter.',
      ])
      await ingestManualUpload(userId, { buffer: response, filename: 'experian-dispute-results.pdf', senderName: 'Experian', mode: 'demo', receivedAt: new Date(Date.now() - 2 * 86_400_000) })
      await drainJobs()
    }
  }

  // Case C — Midland obsolete item: council → plan ready.
  const obsolete = byFp('obsolete_reporting:')
  if (obsolete) {
    const caseC = await createCaseFromDiscrepancy(userId, obsolete.id, 'system')
    await runCouncil(caseC.id, 'initial', 'system')
  }

  // Case D — TU missing DOFD: left in AGENT_REVIEW so the user can convene the council live.
  const dofd = byFp('incomplete_reporting:midland') ?? byFp('incomplete_reporting:')
  if (dofd) await createCaseFromDiscrepancy(userId, dofd.id, 'system')

  // Case E — Navient ownership mismatch: weak → NEEDS_EVIDENCE.
  const own = byFp('ownership_mismatch:')
  if (own) await createCaseFromDiscrepancy(userId, own.id, 'system')

  // Duplicate tradeline on Equifax: review suggestion only (not auto-cased).
  const dup = byFp('duplicate_tradeline:')
  if (dup) await db.update(schema.discrepancies).set({ status: 'review_suggested' }).where(eq(schema.discrepancies.id, dup.id))

  // Case F — unrecognized inquiry, weak evidence (user statement only).
  await createManualCase(userId, {
    title: 'Quantum Lending Solutions: hard inquiry I do not recognise (TransUnion)',
    category: 'unrecognized_inquiry',
    summary: 'TransUnion shows a hard inquiry from Quantum Lending Solutions dated 2026-09-21. I did not apply for a personal loan.',
    bureaus: ['transunion'],
    creditorName: 'Quantum Lending Solutions',
    statement: 'I have never heard of Quantum Lending Solutions and did not authorise any credit application in September 2026.',
    mode: 'demo',
  })

  // Case G — identity theft claim without a report: compliance gate must block.
  const caseG = await createManualCase(userId, {
    title: 'Synchrony / Amazon ****5530: I believe this account was opened fraudulently',
    category: 'identity_theft',
    summary: 'Equifax reports a charged-off Synchrony/Amazon card ending 5530 opened 2017-06-03. I do not recognise this account.',
    bureaus: ['equifax'],
    creditorName: 'Synchrony Bank / Amazon',
    statement: 'I never opened an Amazon store card. I have not yet filed an identity theft report.',
    mode: 'demo',
  })
  // Force a council run to demonstrate the hard gate rejecting the unsupported claim.
  await db.update(schema.cases).set({ status: 'AGENT_REVIEW' }).where(eq(schema.cases.id, caseG.id))
  await runCouncil(caseG.id, 'initial', 'system')

  // Unassigned inbound letter (unknown sender, no case code).
  const unknown = await textPdf(['Harbor Collections Group', '77 Market St, Suite 400', 'Boston, MA 02109', '', 'Notice regarding an account', 'Please contact our office at your earliest convenience regarding', 'an outstanding matter. Reference: HCG-55120.', '', 'Synthetic demo document generated by CreditOS.'])
  await ingestManualUpload(userId, { buffer: unknown, filename: 'harbor-collections-notice.pdf', mode: 'demo', receivedAt: new Date(Date.now() - 1 * 86_400_000) })
  await drainJobs()

  // Freezes — honest mix of states.
  const eqReq = await startFreezeRequest(userId, 'equifax', 'freeze', 'online', { mode: 'demo' })
  await transitionFreeze(userId, eqReq.id, 'SUBMITTED', 'user', { note: 'Submitted via myEquifax', requestRef: 'EQ-DEMO-48213' })
  const confirmation = await textPdf(['Equifax', 'Security Freeze Confirmation', 'Confirmation number: EQ-DEMO-48213', 'Your security freeze has been placed on your Equifax credit file.', 'Synthetic demo document generated by CreditOS.'])
  const confDoc = await storeDocument({ userId, buffer: confirmation, filename: 'equifax-freeze-confirmation.pdf', kind: 'freeze_confirmation', source: 'upload', mode: 'demo', title: 'Equifax freeze confirmation' })
  await transitionFreeze(userId, eqReq.id, 'CONFIRMED_FROZEN', 'user', { note: 'Confirmation letter uploaded', evidenceDocumentId: confDoc.id, confirmationRef: 'EQ-DEMO-48213' })

  const ex = await startFreezeRequest(userId, 'experian', 'freeze', 'online', { mode: 'demo' })
  await transitionFreeze(userId, ex.id, 'SUBMITTED', 'user', { note: 'Submitted via Experian Freeze Center; confirmation not yet received', requestRef: 'EX-DEMO-91002' })

  await startFreezeRequest(userId, 'transunion', 'freeze', 'mail', { mode: 'demo' })

  const chex = await startFreezeRequest(userId, 'chexsystems', 'freeze', 'phone', { mode: 'demo' })
  await transitionFreeze(userId, chex.id, 'SUBMITTED', 'user', { note: 'Requested by phone' })
  await transitionFreeze(userId, chex.id, 'PENDING_VERIFICATION', 'user', { note: 'Agent said confirmation letter will arrive by mail in 7–10 days' })

  const lex = await startFreezeRequest(userId, 'lexisnexis', 'freeze', 'online', { mode: 'demo' })
  await transitionFreeze(userId, lex.id, 'SUBMITTED', 'user', { note: 'Online form submitted' })
  await transitionFreeze(userId, lex.id, 'UNKNOWN', 'user', { note: 'Portal shows an error; status cannot be determined' })

  await audit({ userId, actor: 'system', action: 'seed.demo', meta: { note: 'Synthetic demo dataset created' } })
  await drainJobs()
  return { seeded: true }
}
