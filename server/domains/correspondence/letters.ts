import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { Bureau, RemedyChannel } from '#shared/constants'
import { BUREAU_LABEL, REMEDY_CHANNEL_LABEL } from '#shared/constants'
import { getDb, schema } from '../../db'
import type { Letter, MailingAddress } from '../../db/schema'
import { addCaseEvent } from '../cases/service'
import { storeDocument, readDocument } from '../documents/storage'
import { BUREAU_DISPUTE_ADDRESSES, placeholderFurnisherAddress } from './recipients'

const fmtDate = (d: Date) => d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
const fmtValue = (v: unknown) => (v === null || v === undefined ? '(not reported)' : typeof v === 'number' ? `$${v.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : typeof v === 'object' ? JSON.stringify(v) : String(v))

/** Draft the first letter version for a plan. Only facts present in the case/evidence are used. */
export async function draftLetterForPlan(caseId: string, planId: string): Promise<Letter> {
  const db = getDb()
  const c = (await db.query.cases.findFirst({ where: eq(schema.cases.id, caseId) }))!
  const plan = (await db.query.casePlans.findFirst({ where: eq(schema.casePlans.id, planId) }))!
  const user = (await db.query.users.findFirst({ where: eq(schema.users.id, c.userId) }))!
  const evidence = await db.select().from(schema.caseEvidence).where(eq(schema.caseEvidence.caseId, caseId))

  const channel = plan.strategy.channel
  const recipientBureau = (plan.strategy.recipientType === 'bureau' ? (c.bureaus[0] as Bureau | undefined) : undefined) ?? undefined
  const recipient: MailingAddress = recipientBureau
    ? stripVerify(BUREAU_DISPUTE_ADDRESSES[recipientBureau])
    : placeholderFurnisherAddress(c.creditorName ?? 'Furnisher')
  const sender: MailingAddress = user.mailingAddress ?? {
    name: user.displayName,
    line1: '[Your street address]',
    city: '[City]',
    state: '[ST]',
    postalCode: '[ZIP]',
    country: 'US',
  }
  const enclosures = evidence.filter(e => e.kind === 'document' || e.kind === 'report_fact').map(e => e.label)
  const body = composeBody({ channel, c, plan, evidence, recipient, sender, recipientBureau })
  const [maxRow] = await db.select({ max: sql<number>`coalesce(max(${schema.letters.version}), 0)::int` }).from(schema.letters).where(eq(schema.letters.caseId, caseId))
  const max = maxRow?.max
  await db.update(schema.letters).set({ status: 'superseded' }).where(and(eq(schema.letters.caseId, caseId), eq(schema.letters.status, 'draft')))
  const [letter] = await db
    .insert(schema.letters)
    .values({
      caseId,
      planId,
      version: (max ?? 0) + 1,
      status: 'draft',
      letterType: channel,
      recipientType: plan.strategy.recipientType,
      recipient,
      sender,
      subject: subjectFor(channel, c.code, c.creditorName),
      body,
      enclosures,
      createdBy: 'agent',
    })
    .returning()
  await addCaseEvent(caseId, { kind: 'letter', title: `Letter v${letter!.version} drafted (${REMEDY_CHANNEL_LABEL[channel]})`, actor: 'agent:bureau_specialist', factual: false, refType: 'letter', refId: letter!.id })
  return letter!
}

function stripVerify(a: MailingAddress & { verifyUrl: string }): MailingAddress {
  const { verifyUrl: _v, ...rest } = a
  return rest
}

function subjectFor(channel: RemedyChannel, code: string, creditor: string | null) {
  switch (channel) {
    case 'bureau_dispute':
      return `Request for reinvestigation of inaccurate information — Ref ${code}`
    case 'furnisher_direct_dispute':
      return `Direct dispute of information furnished to consumer reporting agencies — ${creditor ?? ''} — Ref ${code}`
    case 'identity_theft_report':
      return `Request to block information resulting from identity theft — Ref ${code}`
    case 'debt_validation_request':
      return `Request for validation of debt — Ref ${code}`
    case 'goodwill_request':
      return `Goodwill adjustment request — ${creditor ?? ''} — Ref ${code}`
    default:
      return `Correspondence — Ref ${code}`
  }
}

interface ComposeInput {
  channel: RemedyChannel
  c: typeof schema.cases.$inferSelect
  plan: typeof schema.casePlans.$inferSelect
  evidence: (typeof schema.caseEvidence.$inferSelect)[]
  recipient: MailingAddress
  sender: MailingAddress
  recipientBureau?: Bureau
}

function composeBody({ channel, c, plan, evidence, recipient, sender, recipientBureau }: ComposeInput): string {
  const today = fmtDate(new Date())
  const values = Object.entries(c.contestedValues as Record<string, unknown>)
    .map(([b, v]) => `  • ${BUREAU_LABEL[b as Bureau] ?? b}: ${fmtValue(v)}`)
    .join('\n')
  const docs = evidence.filter(e => e.kind === 'document')
  const facts = evidence.filter(e => e.kind === 'report_fact')
  const enclosureList = [
    ...facts.map(e => `  ${e.label}. Excerpt of ${e.fact?.bureau ? BUREAU_LABEL[e.fact.bureau as Bureau] : 'credit'} report dated ${e.fact?.reportDate?.slice(0, 10) ?? 'n/a'} (${e.fact?.field ?? 'item'})`),
    ...docs.map(e => `  ${e.label}. ${e.description}`),
  ].join('\n')

  const header = `${sender.name}\n${sender.line1}${sender.line2 ? `\n${sender.line2}` : ''}\n${sender.city}, ${sender.state} ${sender.postalCode}\n\n${today}\n\n${recipient.name}\n${recipient.line1}${recipient.line2 ? `\n${recipient.line2}` : ''}\n${recipient.city}, ${recipient.state} ${recipient.postalCode}\n\nRe: ${subjectFor(channel, c.code, c.creditorName)}\n`

  const item = `Account: ${c.creditorName ?? 'see below'} — ${c.accountKey ? `ending in ${c.accountKey.split('|')[1]}` : ''}\nContested field: ${c.contestedField ?? 'see description'}\nAs reported:\n${values || '  • see enclosed excerpts'}`

  let body: string
  switch (channel) {
    case 'bureau_dispute':
      body = `To whom it may concern,\n\nI am writing to dispute the accuracy and completeness of the following information in my ${recipientBureau ? BUREAU_LABEL[recipientBureau] : ''} consumer file and to request a reinvestigation under section 611 of the Fair Credit Reporting Act (15 U.S.C. § 1681i).\n\n${item}\n\n${c.summary}\n\nRequested action: ${plan.strategy.requestedOutcome}\n\nI am not asking for accurate information to be removed. I am asking that the item be reinvestigated and that the verified, current information be reported consistently. Please forward all relevant enclosed information to the furnisher as required, and provide me with written results of the reinvestigation, including the name, address, and telephone number of the furnisher contacted.\n\nEnclosures:\n${enclosureList || '  (none)'}\n\nSincerely,\n\n\n${sender.name}`
      break
    case 'furnisher_direct_dispute':
      body = `To whom it may concern,\n\nI am disputing, directly with you as the furnisher, the accuracy of information you have reported about my account to one or more consumer reporting agencies (15 U.S.C. § 1681s-2(a)(8)).\n\n${item}\n\n${c.summary}\n\nRequested action: ${plan.strategy.requestedOutcome}\n\nPlease investigate, correct any inaccurate information with every consumer reporting agency to which you furnished it, and notify me in writing of the results.\n\nEnclosures:\n${enclosureList || '  (none)'}\n\nSincerely,\n\n\n${sender.name}`
      break
    case 'identity_theft_report':
      body = `To whom it may concern,\n\nI am a victim of identity theft. Pursuant to section 605B of the Fair Credit Reporting Act (15 U.S.C. § 1681c-2), I request that you block the following information, which resulted from the identity theft, from my consumer file.\n\n${item}\n\nEnclosed are a copy of my identity theft report, proof of my identity, and identification of the information that resulted from the theft.\n\nEnclosures:\n${enclosureList || '  (none)'}\n\nSincerely,\n\n\n${sender.name}`
      break
    case 'debt_validation_request':
      body = `To whom it may concern,\n\nI am requesting validation of the debt you are attempting to collect, as permitted by section 809 of the Fair Debt Collection Practices Act (15 U.S.C. § 1692g).\n\n${item}\n\nPlease provide the name and address of the original creditor, the amount of the debt and how it was calculated, and documentation showing that you are authorised to collect it. This is not a refusal to pay; it is a request for verification. Please cease collection activity until verification is provided.\n\nSincerely,\n\n\n${sender.name}`
      break
    case 'goodwill_request':
      body = `To whom it may concern,\n\nI am writing to request a goodwill adjustment regarding the account below. I understand the information reported is accurate, and I am not disputing it.\n\n${item}\n\n${c.summary}\n\nI value my relationship with ${c.creditorName ?? 'your company'} and respectfully ask that you consider removing the late-payment notation as a courtesy. I understand this is entirely at your discretion.\n\nSincerely,\n\n\n${sender.name}`
      break
    default:
      body = `To whom it may concern,\n\n${c.summary}\n\nSincerely,\n\n\n${sender.name}`
  }
  return `${header}\n${body}`
}

export async function saveLetterRevision(caseId: string, letterId: string, patch: { body?: string; subject?: string; recipient?: MailingAddress; sender?: MailingAddress; enclosures?: string[] }, actor = 'user'): Promise<Letter> {
  const db = getDb()
  const prev = await db.query.letters.findFirst({ where: and(eq(schema.letters.id, letterId), eq(schema.letters.caseId, caseId)) })
  if (!prev) throw createError({ statusCode: 404, statusMessage: 'Letter not found' })
  const [maxRow] = await db.select({ max: sql<number>`coalesce(max(${schema.letters.version}), 0)::int` }).from(schema.letters).where(eq(schema.letters.caseId, caseId))
  const max = maxRow?.max
  await db.update(schema.letters).set({ status: 'superseded' }).where(and(eq(schema.letters.caseId, caseId), inArray(schema.letters.status, ['draft', 'final'])))
  const [next] = await db
    .insert(schema.letters)
    .values({
      caseId,
      planId: prev.planId,
      version: (max ?? 0) + 1,
      status: 'draft',
      letterType: prev.letterType,
      recipientType: prev.recipientType,
      recipient: patch.recipient ?? prev.recipient,
      sender: patch.sender ?? prev.sender,
      subject: patch.subject ?? prev.subject,
      body: patch.body ?? prev.body,
      enclosures: patch.enclosures ?? prev.enclosures,
      createdBy: actor,
    })
    .returning()
  await addCaseEvent(caseId, { kind: 'letter', title: `Letter revised → v${next!.version}`, actor, refType: 'letter', refId: next!.id })
  return next!
}

/** Render the letter (plus an exhibits index page) to PDF and store it as a document. */
export async function renderLetterPdf(caseId: string, letterId: string): Promise<{ letter: Letter; documentId: string; sha256: string; bytes: Uint8Array }> {
  const db = getDb()
  const letter = await db.query.letters.findFirst({ where: and(eq(schema.letters.id, letterId), eq(schema.letters.caseId, caseId)) })
  if (!letter) throw createError({ statusCode: 404, statusMessage: 'Letter not found' })
  const c = (await db.query.cases.findFirst({ where: eq(schema.cases.id, caseId) }))!
  const evidence = await db.select().from(schema.caseEvidence).where(eq(schema.caseEvidence.caseId, caseId))

  const pdf = await PDFDocument.create()
  pdf.setTitle(letter.subject)
  pdf.setAuthor(letter.sender.name)
  pdf.setProducer('CreditOS')
  pdf.setCreator('CreditOS letter renderer')
  const font = await pdf.embedFont(StandardFonts.TimesRoman)
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold)
  const mono = await pdf.embedFont(StandardFonts.Courier)

  const pageW = 612
  const pageH = 792
  const margin = 72
  const size = 11
  const leading = 15
  let page = pdf.addPage([pageW, pageH])
  let y = pageH - margin
  let pageNo = 1
  const footer = (p: typeof page, n: number) => {
    p.drawText(`${c.code} · page ${n}`, { x: margin, y: 40, size: 8, font: mono, color: rgb(0.45, 0.45, 0.45) })
  }
  const newPage = () => {
    footer(page, pageNo)
    page = pdf.addPage([pageW, pageH])
    pageNo++
    y = pageH - margin
  }
  const write = (text: string, f = font, s = size) => {
    for (const para of text.split('\n')) {
      const lines = wrap(para, f, s, pageW - margin * 2)
      for (const line of lines) {
        if (y < margin + 20) newPage()
        page.drawText(line, { x: margin, y, size: s, font: f })
        y -= leading
      }
    }
  }
  write(letter.body)

  // Exhibits index
  newPage()
  write('Exhibits index', bold, 14)
  y -= 6
  for (const label of letter.enclosures) {
    const e = evidence.find(x => x.label === label)
    if (!e) continue
    write(`${e.label}  ${e.description}`, font, 10)
    y -= 2
  }
  y -= 10
  write(`Prepared with CreditOS for ${letter.sender.name}. Reference ${c.code}. This letter requests reinvestigation or correction; it does not assert any guaranteed outcome.`, font, 8)
  footer(page, pageNo)

  // Append uploaded PDF exhibits
  for (const label of letter.enclosures) {
    const e = evidence.find(x => x.label === label)
    if (!e?.documentId) continue
    const doc = await db.query.documents.findFirst({ where: eq(schema.documents.id, e.documentId) })
    if (!doc || doc.mimeType !== 'application/pdf') continue
    try {
      const bytes = await readDocument(doc)
      const src = await PDFDocument.load(bytes, { ignoreEncryption: true })
      const pages = await pdf.copyPages(src, src.getPageIndices().slice(0, 20))
      for (const p of pages) {
        pdf.addPage(p)
        pageNo++
      }
    } catch {
      /* skip unreadable exhibit */
    }
  }

  const bytes = await pdf.save()
  const stored = await storeDocument({
    userId: c.userId,
    buffer: Buffer.from(bytes),
    filename: `${c.code}-letter-v${letter.version}.pdf`,
    kind: 'letter_pdf',
    caseId,
    source: 'generated',
    mode: c.mode,
    title: letter.subject,
    sensitivity: 'sensitive',
    skipValidation: true,
    mimeType: 'application/pdf',
    pageCount: pdf.getPageCount(),
  })
  const [updated] = await db.update(schema.letters).set({ pdfDocumentId: stored.id, pdfSha256: stored.sha256, status: 'final' }).where(eq(schema.letters.id, letterId)).returning()
  await addCaseEvent(caseId, { kind: 'letter', title: `Letter v${letter.version} rendered to PDF`, detail: `SHA-256 ${stored.sha256.slice(0, 16)}… · ${pdf.getPageCount()} page(s)`, actor: 'system', refType: 'document', refId: stored.id })
  return { letter: updated!, documentId: stored.id, sha256: stored.sha256, bytes }
}

function wrap(text: string, font: { widthOfTextAtSize: (t: string, s: number) => number }, size: number, maxWidth: number): string[] {
  if (text.trim() === '') return ['']
  const words = text.split(/\s+/)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w
    if (font.widthOfTextAtSize(next, size) > maxWidth && cur) {
      lines.push(cur)
      cur = w
    } else cur = next
  }
  if (cur) lines.push(cur)
  return lines
}

export async function latestLetter(caseId: string) {
  const db = getDb()
  return db.query.letters.findFirst({ where: eq(schema.letters.caseId, caseId), orderBy: [desc(schema.letters.version)] })
}
