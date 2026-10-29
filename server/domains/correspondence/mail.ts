import { and, eq } from 'drizzle-orm'
import { OUTBOUND_TRANSITIONS, assertTransition, canTransition, type OutboundStatus } from '#shared/state-machines'
import { getDb, schema } from '../../db'
import type { ApprovalBundle, MailOrder } from '../../db/schema'
import { sha256Hex } from '../../utils/crypto'
import { liveBus } from '../../utils/events'
import { audit, notify } from '../../utils/audit'
import { addCaseEvent, transitionCase } from '../cases/service'
import { readDocument } from '../documents/storage'
import { enqueueJob } from '../jobs/queue'
import { renderLetterPdf } from './letters'
import { getOutboundProvider } from './outbound'
import type { WebhookEvent } from './outbound/types'
import { isAddressComplete } from './recipients'

export const MAIL_CONSENT_TEXT =
  'I authorise CreditOS to transmit the exact PDF shown (identified by its SHA-256 hash) to the selected mail provider for printing and delivery to the recipient shown. I understand the estimated cost, that outcomes are not guaranteed, that this letter asserts only facts supported by the listed evidence, and that this is a consequential external action I am approving once.'

/**
 * Step 1 of mailing: build an approval bundle. Creates a mail order in
 * APPROVAL_PENDING, moves the case to AWAITING_APPROVAL. Nothing is sent.
 */
export async function requestMailApproval(
  userId: string,
  caseId: string,
  letterId: string,
  opts: { mailClass?: 'first_class' | 'standard' | 'certified'; color?: boolean } = {},
): Promise<{ order: MailOrder; approvalId: string }> {
  const db = getDb()
  const c = await db.query.cases.findFirst({ where: and(eq(schema.cases.id, caseId), eq(schema.cases.userId, userId)) })
  if (!c) throw createError({ statusCode: 404, statusMessage: 'Case not found' })
  if (!['PLAN_READY', 'FOLLOW_UP_RECOMMENDED', 'DELIVERY_FAILED', 'UNDELIVERABLE'].includes(c.status)) {
    throw createError({ statusCode: 409, statusMessage: `Case must be in PLAN_READY to request approval (currently ${c.status})` })
  }
  const consents = await db.select().from(schema.consents).where(eq(schema.consents.userId, userId))
  if (!consents.some(x => x.kind === 'send_correspondence' && x.granted)) {
    throw createError({ statusCode: 412, statusMessage: 'Grant the "send correspondence" consent in Settings before requesting a mailing approval.' })
  }

  const rendered = await renderLetterPdf(caseId, letterId)
  const letter = rendered.letter
  if (!isAddressComplete(letter.recipient)) throw createError({ statusCode: 422, statusMessage: 'Recipient address is incomplete. Edit the letter recipient first.' })
  if (!isAddressComplete(letter.sender)) throw createError({ statusCode: 422, statusMessage: 'Your return address is incomplete. Set it in Settings → Profile or edit the letter.' })

  const provider = getOutboundProvider()
  const mailClass = opts.mailClass ?? 'first_class'
  if (mailClass === 'certified' && !provider.capabilities.certifiedMail) {
    throw createError({ statusCode: 422, statusMessage: `${provider.label} does not support certified mail.` })
  }
  const doc = await db.query.documents.findFirst({ where: eq(schema.documents.id, rendered.documentId) })
  const estimate = await provider.estimateCost({ to: letter.recipient, from: letter.sender, mailClass, options: { color: !!opts.color, doubleSided: true }, description: c.code, pageCount: doc?.pageCount ?? 2 })

  const idempotencyKey = `mail:${caseId}:${letter.id}:${rendered.sha256.slice(0, 16)}`
  const existing = await db.query.mailOrders.findFirst({ where: eq(schema.mailOrders.idempotencyKey, idempotencyKey) })
  let order: MailOrder
  if (existing && !['CANCELLED', 'FAILED', 'RETURNED', 'DRAFT'].includes(existing.status)) {
    order = existing
  } else {
    const [created] = await db
      .insert(schema.mailOrders)
      .values({
        userId,
        caseId,
        letterId: letter.id,
        provider: provider.slug,
        mode: provider.mode,
        status: 'DRAFT',
        idempotencyKey: existing ? `${idempotencyKey}:${Date.now()}` : idempotencyKey,
        mailClass,
        options: { color: !!opts.color, doubleSided: true },
        recipient: letter.recipient,
        costEstimateCents: estimate.cents,
        pdfSha256: rendered.sha256,
        trackingSupported: provider.capabilities.tracking,
      })
      .returning()
    order = created!
    await transitionOrder(order.id, 'APPROVAL_PENDING', 'system', 'Approval bundle created')
  }

  const bundle: ApprovalBundle = {
    title: `Mail ${letter.subject}`,
    target: `${letter.recipient.name}, ${letter.recipient.line1}, ${letter.recipient.city}, ${letter.recipient.state} ${letter.recipient.postalCode}`,
    letterId: letter.id,
    letterVersion: letter.version,
    exhibits: letter.enclosures,
    provider: provider.slug,
    providerMode: provider.mode,
    mailClass,
    costEstimateCents: estimate.cents,
    consentText: MAIL_CONSENT_TEXT,
    consequences: [
      `A physical letter will be ${provider.mode === 'sandbox' ? 'SIMULATED (sandbox: nothing is printed or mailed)' : 'printed and mailed'} to the recipient.`,
      `Estimated cost ${(estimate.cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })} (${estimate.isEstimate ? 'estimate' : 'quoted'}).`,
      'The recipient may verify the item as reported; outcomes are not guaranteed.',
      ...(provider.capabilities.deliveryConfirmation ? [] : ['This provider does not supply delivery confirmation; delivery will remain unverified.']),
    ],
    pdfSha256: rendered.sha256,
  }
  const [approval] = await db
    .insert(schema.approvals)
    .values({ userId, caseId, kind: 'mail_send', status: 'pending', targetType: 'mail_order', targetId: order.id, bundle, consentTextHash: sha256Hex(MAIL_CONSENT_TEXT) })
    .returning()
  await db.update(schema.mailOrders).set({ approvalId: approval!.id }).where(eq(schema.mailOrders.id, order.id))
  await transitionCase(caseId, 'AWAITING_APPROVAL', 'user', { title: 'Approval requested for mailing', nextAction: 'Approve or reject the mailing bundle' })
  await notify(userId, { kind: 'approval', title: `${c.code}: mailing awaits your approval`, body: bundle.target, href: '/approvals', severity: 'medium' })
  await audit({ userId, actor: 'user', action: 'approval.request', targetType: 'approval', targetId: approval!.id, meta: { caseId, provider: provider.slug, costCents: estimate.cents } })
  return { order: (await db.query.mailOrders.findFirst({ where: eq(schema.mailOrders.id, order.id) }))!, approvalId: approval!.id }
}

export async function transitionOrder(orderId: string, to: OutboundStatus, actor: string, note?: string, extra: Partial<MailOrder> = {}): Promise<MailOrder> {
  const db = getDb()
  const o = await db.query.mailOrders.findFirst({ where: eq(schema.mailOrders.id, orderId) })
  if (!o) throw createError({ statusCode: 404, statusMessage: 'Mail order not found' })
  assertTransition('outbound', OUTBOUND_TRANSITIONS, o.status, to)
  const [updated] = await db
    .update(schema.mailOrders)
    .set({ status: to, updatedAt: new Date(), ...extra })
    .where(eq(schema.mailOrders.id, orderId))
    .returning()
  await db.insert(schema.mailEvents).values({ mailOrderId: orderId, provider: o.provider, externalEventId: `internal:${orderId}:${o.status}->${to}:${Date.now()}`, fromStatus: o.status, toStatus: to, applied: true, signatureValid: true, payload: { actor, note: note ?? null } })
  await addCaseEvent(o.caseId, { kind: 'mail', title: `Mail order ${to.replace(/_/g, ' ').toLowerCase()}`, detail: note, actor, refType: 'mail_order', refId: orderId })
  liveBus.publish('mail.status', { orderId, caseId: o.caseId, from: o.status, to }, o.userId)
  return updated!
}

/** Step 2: user decision on the approval. */
export async function decideApproval(userId: string, approvalId: string, decision: 'approved' | 'rejected' | 'revoked', note?: string) {
  const db = getDb()
  const a = await db.query.approvals.findFirst({ where: and(eq(schema.approvals.id, approvalId), eq(schema.approvals.userId, userId)) })
  if (!a) throw createError({ statusCode: 404, statusMessage: 'Approval not found' })
  if (a.status !== 'pending' && !(decision === 'revoked' && a.status === 'approved')) {
    throw createError({ statusCode: 409, statusMessage: `Approval already ${a.status}` })
  }
  await db.update(schema.approvals).set({ status: decision, decidedAt: new Date(), decisionNote: note ?? null }).where(eq(schema.approvals.id, a.id))

  if (a.targetType === 'mail_order') {
    const order = (await db.query.mailOrders.findFirst({ where: eq(schema.mailOrders.id, a.targetId) }))!
    if (decision === 'approved') {
      // Re-verify the PDF hash so what was approved is exactly what gets sent.
      const letter = (await db.query.letters.findFirst({ where: eq(schema.letters.id, order.letterId) }))!
      if (letter.pdfSha256 !== a.bundle.pdfSha256 || order.pdfSha256 !== a.bundle.pdfSha256) {
        throw createError({ statusCode: 409, statusMessage: 'Letter PDF changed since the approval bundle was created. Request approval again.' })
      }
      await transitionOrder(order.id, 'APPROVED', 'user', 'Approved by user')
      await transitionOrder(order.id, 'QUEUED', 'system', 'Queued for dispatch')
      if (a.caseId) {
        await transitionCase(a.caseId, 'APPROVED', 'user', { title: 'Mailing approved', detail: note })
        await transitionCase(a.caseId, 'QUEUED_FOR_MAIL', 'system', { nextAction: 'Dispatching to mail provider' })
      }
      await enqueueJob('mail.dispatch', { orderId: order.id }, { idempotencyKey: `dispatch:${order.idempotencyKey}` })
    } else if (decision === 'rejected') {
      if (canTransition(OUTBOUND_TRANSITIONS, order.status, 'DRAFT')) await transitionOrder(order.id, 'DRAFT', 'user', `Rejected: ${note ?? ''}`)
      if (a.caseId) await transitionCase(a.caseId, 'REJECTED_BY_USER', 'user', { title: 'Mailing rejected', detail: note, nextAction: 'Revise the letter or re-run the council' })
    } else {
      if (['APPROVED', 'QUEUED'].includes(order.status)) {
        if (order.status === 'QUEUED') await transitionOrder(order.id, 'CANCELLED', 'user', 'Approval revoked before dispatch')
        else await transitionOrder(order.id, 'DRAFT', 'user', 'Approval revoked')
        if (a.caseId) await transitionCase(a.caseId, 'PLAN_READY', 'user', { title: 'Approval revoked before dispatch' })
      } else {
        throw createError({ statusCode: 409, statusMessage: `Cannot revoke: order already ${order.status}` })
      }
    }
  }
  await audit({ userId, actor: 'user', action: `approval.${decision}`, targetType: 'approval', targetId: a.id, meta: { note } })
  return (await db.query.approvals.findFirst({ where: eq(schema.approvals.id, a.id) }))!
}

/** Job handler: dispatch a QUEUED order exactly once. */
export async function dispatchMailOrder(orderId: string): Promise<void> {
  const db = getDb()
  const order = await db.query.mailOrders.findFirst({ where: eq(schema.mailOrders.id, orderId) })
  if (!order) return
  if (order.status !== 'QUEUED') return // already dispatched or cancelled — idempotent no-op
  const approval = order.approvalId ? await db.query.approvals.findFirst({ where: eq(schema.approvals.id, order.approvalId) }) : null
  if (!approval || approval.status !== 'approved') {
    await transitionOrder(orderId, 'FAILED', 'system', 'Dispatch refused: approval missing or not approved')
    return
  }
  const letter = (await db.query.letters.findFirst({ where: eq(schema.letters.id, order.letterId) }))!
  const doc = letter.pdfDocumentId ? await db.query.documents.findFirst({ where: eq(schema.documents.id, letter.pdfDocumentId) }) : null
  if (!doc) {
    await transitionOrder(orderId, 'FAILED', 'system', 'Rendered PDF missing')
    return
  }
  const pdf = await readDocument(doc)
  if (sha256Hex(pdf) !== order.pdfSha256) {
    await transitionOrder(orderId, 'FAILED', 'system', 'PDF hash mismatch at dispatch — refusing to send')
    return
  }
  const provider = getOutboundProvider(order.provider)
  if (provider.slug !== order.provider) {
    await transitionOrder(orderId, 'FAILED', 'system', `Provider ${order.provider} unavailable; refusing to substitute ${provider.slug}`)
    return
  }
  try {
    const result = await provider.createOrder({
      idempotencyKey: order.idempotencyKey,
      pdf,
      to: order.recipient,
      from: letter.sender,
      mailClass: order.mailClass as 'first_class',
      options: order.options as { color?: boolean },
      description: `CreditOS ${letter.subject}`.slice(0, 200),
    })
    await transitionOrder(orderId, 'PROVIDER_ACCEPTED', `provider:${provider.slug}`, `Order accepted (${result.providerOrderId})`, {
      providerOrderId: result.providerOrderId,
      submittedAt: new Date(),
      costActualCents: result.costCents ?? null,
      trackingNumber: result.trackingNumber ?? null,
      expectedDeliveryDate: result.expectedDeliveryDate ?? null,
    })
    await transitionCase(order.caseId, 'SENT', 'system', {
      title: provider.mode === 'sandbox' ? 'Submitted to SANDBOX provider (no physical mail)' : 'Submitted to mail provider',
      detail: `Provider order ${result.providerOrderId}.${provider.capabilities.deliveryConfirmation ? '' : ' Delivery confirmation is not available from this provider.'}`,
      nextAction: 'Await provider status / bureau response',
      nextActionDueAt: new Date(Date.now() + 35 * 86_400_000),
    })
    const c = (await db.query.cases.findFirst({ where: eq(schema.cases.id, order.caseId) }))!
    await db.update(schema.cases).set({ estimatedDates: { ...c.estimatedDates, responseReviewPoint: new Date(Date.now() + 35 * 86_400_000).toISOString() } }).where(eq(schema.cases.id, c.id))
    await enqueueJob('mail.poll_status', { orderId }, { runAt: new Date(Date.now() + 6 * 60 * 60_000), idempotencyKey: `poll:${orderId}:1` })
    await enqueueJob('deadline.check', { caseId: order.caseId }, { runAt: new Date(Date.now() + 35 * 86_400_000), idempotencyKey: `deadline:${order.caseId}:${orderId}` })
    await notify(order.userId, { kind: 'mail', title: `${c.code}: letter submitted to ${provider.label}`, href: `/cases/${c.id}`, severity: 'low' })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await transitionOrder(orderId, 'FAILED', 'system', message)
    await transitionCase(order.caseId, 'DELIVERY_FAILED', 'system', { title: 'Mail dispatch failed', detail: message, nextAction: 'Retry dispatch or revise the letter' })
    throw e
  }
}

/** Idempotent webhook application with replay protection via (provider, externalEventId). */
export async function applyProviderEvents(providerSlug: string, events: WebhookEvent[], signatureValid: boolean): Promise<{ applied: number; duplicates: number; ignored: number }> {
  const db = getDb()
  let applied = 0
  let duplicates = 0
  let ignored = 0
  for (const evt of events) {
    const order = await db.query.mailOrders.findFirst({ where: and(eq(schema.mailOrders.provider, providerSlug), eq(schema.mailOrders.providerOrderId, evt.providerOrderId)) })
    if (!order) {
      ignored++
      continue
    }
    const inserted = await db
      .insert(schema.mailEvents)
      .values({ mailOrderId: order.id, provider: providerSlug, externalEventId: evt.externalEventId, fromStatus: order.status, toStatus: evt.status, applied: false, signatureValid, payload: evt.raw, receivedAt: evt.occurredAt })
      .onConflictDoNothing({ target: [schema.mailEvents.provider, schema.mailEvents.externalEventId] })
      .returning()
    if (!inserted.length) {
      duplicates++
      continue
    }
    if (order.status === evt.status || !canTransition(OUTBOUND_TRANSITIONS, order.status, evt.status)) {
      ignored++
      continue
    }
    const extra: Partial<MailOrder> = { trackingNumber: evt.trackingNumber ?? order.trackingNumber }
    if (evt.status === 'MAILED') extra.mailedAt = evt.occurredAt
    if (evt.status === 'DELIVERY_CONFIRMED') extra.deliveredAt = evt.occurredAt
    await db
      .update(schema.mailOrders)
      .set({ status: evt.status, updatedAt: new Date(), ...extra })
      .where(eq(schema.mailOrders.id, order.id))
    await db.update(schema.mailEvents).set({ applied: true }).where(eq(schema.mailEvents.id, inserted[0]!.id))
    await addCaseEvent(order.caseId, { kind: 'mail', title: `Provider update: ${evt.status.replace(/_/g, ' ').toLowerCase()}`, detail: evt.trackingNumber ? `Tracking ${evt.trackingNumber}` : undefined, actor: `provider:${providerSlug}`, refType: 'mail_order', refId: order.id, occurredAt: evt.occurredAt })
    liveBus.publish('mail.status', { orderId: order.id, caseId: order.caseId, from: order.status, to: evt.status }, order.userId)
    applied++

    const c = (await db.query.cases.findFirst({ where: eq(schema.cases.id, order.caseId) }))!
    if (evt.status === 'DELIVERY_CONFIRMED' && c.status === 'SENT') {
      await transitionCase(c.id, 'DELIVERY_CONFIRMED', `provider:${providerSlug}`, { title: 'Delivery confirmed by provider', nextAction: 'Await bureau response' })
      await transitionCase(c.id, 'AWAITING_RESPONSE', 'system')
    } else if (evt.status === 'MAILED' && c.status === 'SENT') {
      await addCaseEvent(c.id, { kind: 'mail', title: 'Provider reports letter mailed', actor: `provider:${providerSlug}`, occurredAt: evt.occurredAt })
      await transitionCase(c.id, 'AWAITING_RESPONSE', 'system', { title: 'Awaiting response (delivery unverified)' })
    } else if (evt.status === 'RETURNED' && ['SENT', 'AWAITING_RESPONSE'].includes(c.status)) {
      if (c.status === 'SENT') await transitionCase(c.id, 'UNDELIVERABLE', `provider:${providerSlug}`, { title: 'Letter returned / undeliverable', nextAction: 'Validate the address and re-request approval' })
    } else if (evt.status === 'FAILED' && ['QUEUED_FOR_MAIL', 'SENT'].includes(c.status)) {
      await transitionCase(c.id, 'DELIVERY_FAILED', `provider:${providerSlug}`, { nextAction: 'Retry or revise' })
    }
  }
  return { applied, duplicates, ignored }
}

export async function pollOrderStatus(orderId: string) {
  const db = getDb()
  const order = await db.query.mailOrders.findFirst({ where: eq(schema.mailOrders.id, orderId) })
  if (!order?.providerOrderId) return
  if (['DELIVERY_CONFIRMED', 'CANCELLED', 'RETURNED', 'FAILED'].includes(order.status)) return
  const provider = getOutboundProvider(order.provider)
  if (!provider.implemented.getStatus) return
  const s = await provider.getStatus(order.providerOrderId)
  await applyProviderEvents(order.provider, [{ externalEventId: `poll:${orderId}:${s.status}:${new Date().toISOString().slice(0, 13)}`, providerOrderId: order.providerOrderId, status: s.status, occurredAt: new Date(), trackingNumber: s.trackingNumber, raw: s.raw }], true)
  if (!['DELIVERY_CONFIRMED', 'CANCELLED', 'RETURNED', 'FAILED'].includes(s.status)) {
    await enqueueJob('mail.poll_status', { orderId }, { runAt: new Date(Date.now() + 12 * 60 * 60_000), idempotencyKey: `poll:${orderId}:${Date.now()}` })
  }
}
