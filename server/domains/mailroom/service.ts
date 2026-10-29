import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { BUREAUS, RESPONSE_CATEGORY_LABEL, type DataMode, type ResponseCategory } from '#shared/constants'
import { INBOUND_TRANSITIONS, assertTransition, type InboundStatus } from '#shared/state-machines'
import { getDb, schema } from '../../db'
import type { InboundExtraction, InboundMail } from '../../db/schema'
import { liveBus } from '../../utils/events'
import { audit, notify } from '../../utils/audit'
import { addCaseEvent, addEvidence, transitionCase } from '../cases/service'
import { storeDocument } from '../documents/storage'
import { enqueueJob } from '../jobs/queue'
import { buildExtraction, extractText } from './extract'

export async function transitionInbound(id: string, to: InboundStatus, patch: Partial<InboundMail> = {}): Promise<InboundMail> {
  const db = getDb()
  const row = await db.query.inboundMail.findFirst({ where: eq(schema.inboundMail.id, id) })
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Inbound mail not found' })
  assertTransition('inbound', INBOUND_TRANSITIONS, row.status, to)
  const [updated] = await db
    .update(schema.inboundMail)
    .set({ status: to, updatedAt: new Date(), ...patch })
    .where(eq(schema.inboundMail.id, id))
    .returning()
  liveBus.publish('inbound.status', { id, from: row.status, to }, row.userId)
  return updated!
}

/**
 * Manual upload path: the uploaded file IS the content scan. Runs the full
 * pipeline synchronously up to matching; analysis + council re-run happen in
 * a job so the request returns quickly.
 */
export async function ingestManualUpload(
  userId: string,
  input: { buffer: Buffer; filename: string; senderName?: string; caseId?: string; mode?: DataMode; receivedAt?: Date },
): Promise<InboundMail> {
  const db = getDb()
  const doc = await storeDocument({ userId, buffer: input.buffer, filename: input.filename, kind: 'inbound_scan', source: 'upload', mode: input.mode ?? 'live', caseId: input.caseId ?? null, title: `Inbound mail: ${input.filename}` })

  // Duplicate detection by content hash
  const dup = await db
    .select({ id: schema.inboundMail.id })
    .from(schema.inboundMail)
    .innerJoin(schema.documents, eq(schema.documents.id, schema.inboundMail.contentDocumentId))
    .where(and(eq(schema.inboundMail.userId, userId), eq(schema.documents.sha256, doc.sha256)))
    .limit(1)

  const [row] = await db
    .insert(schema.inboundMail)
    .values({
      userId,
      provider: 'manual',
      mode: input.mode ?? 'live',
      status: 'RECEIVED_ENVELOPE',
      senderName: input.senderName ?? null,
      receivedAt: input.receivedAt ?? new Date(),
      contentDocumentId: doc.id,
      pageCount: doc.pageCount,
      duplicateOfId: dup[0]?.id ?? null,
    })
    .returning()
  let mail = row!
  mail = await transitionInbound(mail.id, 'SCANNED')
  await audit({ userId, actor: 'user', action: 'inbound.upload', targetType: 'inbound_mail', targetId: mail.id, meta: { filename: input.filename, pages: doc.pageCount } })

  mail = await extractInbound(mail.id)
  if (mail.status === 'EXTRACTED') mail = await matchInbound(mail.id, input.caseId)
  if (mail.status === 'MATCHED') {
    await enqueueJob('inbound.match', { inboundId: mail.id }, { idempotencyKey: `inbound-analyze:${mail.id}` })
  }
  return (await db.query.inboundMail.findFirst({ where: eq(schema.inboundMail.id, mail.id) }))!
}

export async function extractInbound(id: string): Promise<InboundMail> {
  const db = getDb()
  const mail = (await db.query.inboundMail.findFirst({ where: eq(schema.inboundMail.id, id) }))!
  const doc = mail.contentDocumentId ? await db.query.documents.findFirst({ where: eq(schema.documents.id, mail.contentDocumentId) }) : null
  if (!doc) return transitionInbound(id, 'EXTRACTION_FAILED')
  const { readDocument } = await import('../documents/storage')
  const buffer = await readDocument(doc)
  const extracted = await extractText(buffer, doc.mimeType)
  const extraction = buildExtraction(extracted)
  const fullText = extracted.pages.join('\n\n')
  await db.update(schema.documents).set({ textExtracted: fullText.slice(0, 200_000), extraction: { engine: extracted.engine, pages: extracted.pages.length } }).where(eq(schema.documents.id, doc.id))
  if (extracted.engine === 'none' && !fullText) {
    const updated = await transitionInbound(id, 'EXTRACTION_FAILED', { extraction })
    // Image or scanned PDF without OCR: route to unassigned triage for manual transcription.
    return transitionInbound(updated.id, 'UNASSIGNED')
  }
  return transitionInbound(id, 'EXTRACTED', { extraction, senderName: mail.senderName ?? extraction.senderGuess })
}

/** Provide a manual transcription for an image / scanned PDF and continue the pipeline. */
export async function transcribeInbound(userId: string, id: string, text: string, caseId?: string): Promise<InboundMail> {
  const db = getDb()
  const mail = await db.query.inboundMail.findFirst({ where: and(eq(schema.inboundMail.id, id), eq(schema.inboundMail.userId, userId)) })
  if (!mail) throw createError({ statusCode: 404, statusMessage: 'Inbound mail not found' })
  if (mail.contentDocumentId) await db.update(schema.documents).set({ textExtracted: text.slice(0, 200_000), extraction: { engine: 'manual' } }).where(eq(schema.documents.id, mail.contentDocumentId))
  const extraction: InboundExtraction = { ...buildExtraction({ engine: 'manual', pages: [text], warnings: [] }), engine: 'manual' }
  await db.update(schema.inboundMail).set({ extraction, updatedAt: new Date() }).where(eq(schema.inboundMail.id, id))
  if (mail.status === 'UNASSIGNED' || mail.status === 'EXTRACTION_FAILED') {
    const matched = await matchInbound(id, caseId)
    if (matched.status === 'MATCHED') await enqueueJob('inbound.match', { inboundId: id }, { idempotencyKey: `inbound-analyze:${id}:${Date.now()}` })
    return matched
  }
  return (await db.query.inboundMail.findFirst({ where: eq(schema.inboundMail.id, id) }))!
}

export interface MatchCandidate {
  caseId: string
  code: string
  title: string
  confidence: number
  method: string
}

export async function matchCandidates(userId: string, extraction: InboundExtraction | null, senderName: string | null): Promise<MatchCandidate[]> {
  const db = getDb()
  const open = await db
    .select()
    .from(schema.cases)
    .where(and(eq(schema.cases.userId, userId), sql`${schema.cases.status} not in ('CLOSED','CANCELLED','DUPLICATE')`))
  const out: MatchCandidate[] = []
  const sender = (senderName ?? extraction?.senderGuess ?? '').toLowerCase()
  const senderBureau = BUREAUS.find(b => sender.includes(b)) ?? null
  for (const c of open) {
    if (extraction?.caseCodes.includes(c.code)) {
      out.push({ caseId: c.id, code: c.code, title: c.title, confidence: 0.95, method: 'case_code' })
      continue
    }
    let score = 0
    const reasons: string[] = []
    if (senderBureau && c.bureaus.includes(senderBureau)) {
      score += 0.3
      reasons.push('sender_bureau')
    }
    if (['SENT', 'DELIVERY_CONFIRMED', 'AWAITING_RESPONSE', 'DISPUTED_STATUS_UNKNOWN'].includes(c.status)) {
      score += 0.25
      reasons.push('awaiting_response')
    }
    const last4 = c.accountKey?.split('|')[1]
    if (last4 && extraction?.accountRefs.includes(last4)) {
      score += 0.3
      reasons.push('account_last4')
    }
    if (score >= 0.3) out.push({ caseId: c.id, code: c.code, title: c.title, confidence: Number(score.toFixed(2)), method: reasons.join('+') })
  }
  return out.sort((a, b) => b.confidence - a.confidence)
}

export async function matchInbound(id: string, forcedCaseId?: string): Promise<InboundMail> {
  const db = getDb()
  const mail = (await db.query.inboundMail.findFirst({ where: eq(schema.inboundMail.id, id) }))!
  if (forcedCaseId) {
    const c = await db.query.cases.findFirst({ where: and(eq(schema.cases.id, forcedCaseId), eq(schema.cases.userId, mail.userId)) })
    if (c) return transitionInbound(id, 'MATCHED', { matchedCaseId: c.id, matchConfidence: '1.000', matchMethod: 'user_assigned' })
  }
  const candidates = await matchCandidates(mail.userId, mail.extraction, mail.senderName)
  const best = candidates[0]
  const runnerUp = candidates[1]
  const unambiguous = best && best.confidence >= 0.6 && (!runnerUp || best.confidence - runnerUp.confidence >= 0.2)
  if (unambiguous) {
    return transitionInbound(id, 'MATCHED', { matchedCaseId: best.caseId, matchConfidence: best.confidence.toFixed(3), matchMethod: best.method })
  }
  const updated = await transitionInbound(id, 'UNASSIGNED', { extraction: mail.extraction ? { ...mail.extraction, warnings: [...mail.extraction.warnings, candidates.length ? `Ambiguous match: ${candidates.slice(0, 3).map(c => `${c.code} (${Math.round(c.confidence * 100)}%)`).join(', ')}` : 'No matching case found.'] } : mail.extraction })
  await notify(mail.userId, { kind: 'mailroom', title: 'Inbound mail needs triage', body: candidates.length ? `Possible matches: ${candidates.slice(0, 2).map(c => c.code).join(', ')}` : 'No case matched this letter.', href: '/mailroom', severity: 'medium' })
  return updated
}

export async function assignInbound(userId: string, id: string, caseId: string): Promise<InboundMail> {
  const db = getDb()
  const mail = await db.query.inboundMail.findFirst({ where: and(eq(schema.inboundMail.id, id), eq(schema.inboundMail.userId, userId)) })
  if (!mail) throw createError({ statusCode: 404, statusMessage: 'Inbound mail not found' })
  if (mail.status === 'MATCHED') await transitionInbound(id, 'UNASSIGNED')
  const matched = await matchInbound(id, caseId)
  await enqueueJob('inbound.match', { inboundId: id }, { idempotencyKey: `inbound-analyze:${id}:${caseId}` })
  await audit({ userId, actor: 'user', action: 'inbound.assign', targetType: 'inbound_mail', targetId: id, meta: { caseId } })
  return matched
}

/** Job: analyse a MATCHED letter against the case's scenario tree and re-open deliberation. */
export async function analyzeInbound(id: string): Promise<void> {
  const db = getDb()
  const mail = (await db.query.inboundMail.findFirst({ where: eq(schema.inboundMail.id, id) }))!
  if (mail.status !== 'MATCHED' || !mail.matchedCaseId) return
  const c = (await db.query.cases.findFirst({ where: eq(schema.cases.id, mail.matchedCaseId) }))!
  const doc = mail.contentDocumentId ? await db.query.documents.findFirst({ where: eq(schema.documents.id, mail.contentDocumentId) }) : null
  const category: ResponseCategory = mail.extraction?.responseCategory ?? 'unclear'
  const plan = await db.query.casePlans.findFirst({ where: and(eq(schema.casePlans.caseId, c.id), inArray(schema.casePlans.status, ['active', 'superseded'])), orderBy: [desc(schema.casePlans.version)] })
  const scenario = plan?.scenarios.find(s => s.key === category) ?? null
  const text = doc?.textExtracted ?? ''
  const summary = `${RESPONSE_CATEGORY_LABEL[category]}${scenario ? ` — matches anticipated scenario "${scenario.title}"` : ' — no anticipated scenario matched; human review recommended'}. ${text ? `Excerpt: "${text.replace(/\s+/g, ' ').slice(0, 240)}…"` : 'No text available.'}`

  // Evidence + case events (factual: the letter exists and says X; interpretation is flagged non-factual)
  const ev = await addEvidence(c.id, { kind: 'inbound_response', description: `Response letter received ${mail.receivedAt.toISOString().slice(0, 10)}${mail.senderName ? ` from ${mail.senderName}` : ''} (${mail.pageCount ?? '?'} page(s))`, documentId: mail.contentDocumentId ?? undefined, credibility: 'high', addedBy: 'mailroom' })
  if (['SENT', 'DELIVERY_CONFIRMED', 'AWAITING_RESPONSE', 'DISPUTED_STATUS_UNKNOWN'].includes(c.status)) {
    await transitionCase(c.id, 'RESPONSE_RECEIVED', 'mailroom', { title: 'Response received', detail: `Linked inbound mail ${mail.id.slice(0, 8)} as ${ev.label}.` })
    await transitionCase(c.id, 'RESPONSE_ANALYSIS', 'system', { title: 'Analysing response against scenario tree' })
  } else {
    await addCaseEvent(c.id, { kind: 'inbound', title: 'Correspondence received outside the expected window', detail: `Case was ${c.status}; letter attached as ${ev.label}.`, actor: 'mailroom', refType: 'inbound_mail', refId: mail.id })
  }
  const [analysis] = await db
    .insert(schema.responseAnalyses)
    .values({
      caseId: c.id,
      inboundMailId: mail.id,
      category,
      matchedScenarioKey: scenario?.key ?? null,
      summary,
      extracted: (mail.extraction ?? {}) as unknown as Record<string, unknown>,
      recommendedNextAction: scenario?.recommendedNextStep ?? 'Council to review the unmatched response and propose next steps.',
      requiresApproval: scenario?.requiresApproval ?? true,
    })
    .returning()
  await addCaseEvent(c.id, { kind: 'analysis', title: `Response classified: ${RESPONSE_CATEGORY_LABEL[category]}`, detail: summary, actor: 'system', factual: false, refType: 'response_analysis', refId: analysis!.id, meta: { confidence: mail.extraction?.confidence ?? 0 } })
  await transitionInbound(id, 'ANALYZED')

  // Re-open deliberation with the new evidence. The council decides the next step; nothing is auto-resolved.
  if (['RESPONSE_ANALYSIS'].includes((await db.query.cases.findFirst({ where: eq(schema.cases.id, c.id) }))!.status)) {
    const { runCouncil } = await import('../council/orchestrator')
    try {
      await runCouncil(c.id, 'inbound_response', 'mailroom')
    } catch (e) {
      await addCaseEvent(c.id, { kind: 'council', title: 'Automatic council re-run failed; manual re-run required', detail: e instanceof Error ? e.message : String(e), actor: 'system' })
    }
  }
  await transitionInbound(id, 'ACTION_PENDING', { unread: true })
  await notify(mail.userId, { kind: 'mailroom', title: `${c.code}: response analysed (${RESPONSE_CATEGORY_LABEL[category]})`, body: analysis!.recommendedNextAction, href: `/cases/${c.id}`, severity: 'medium' })
}

export async function listInbound(userId: string, status?: InboundStatus) {
  const db = getDb()
  const where = [eq(schema.inboundMail.userId, userId)]
  if (status) where.push(eq(schema.inboundMail.status, status))
  return db
    .select()
    .from(schema.inboundMail)
    .where(and(...where))
    .orderBy(desc(schema.inboundMail.receivedAt))
}

export async function markInboundRead(userId: string, id: string) {
  const db = getDb()
  await db.update(schema.inboundMail).set({ unread: false }).where(and(eq(schema.inboundMail.id, id), eq(schema.inboundMail.userId, userId)))
}
