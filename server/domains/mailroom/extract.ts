import { BUREAUS, type Bureau, type ResponseCategory } from '#shared/constants'
import type { InboundExtraction } from '../../db/schema'

export interface ExtractedText {
  engine: InboundExtraction['engine']
  pages: string[]
  warnings: string[]
}

/** Extract text from an uploaded PDF (text layer) or image (no OCR engine bundled). */
export async function extractText(buffer: Buffer, mimeType: string): Promise<ExtractedText> {
  if (mimeType === 'application/pdf') {
    try {
      const { extractText: unpdfExtract, getDocumentProxy } = await import('unpdf')
      const pdf = await getDocumentProxy(new Uint8Array(buffer))
      const { text } = await unpdfExtract(pdf, { mergePages: false })
      const pages = (Array.isArray(text) ? text : [text]).map(p => p.replace(/\s+\n/g, '\n').trim())
      const chars = pages.reduce((s, p) => s + p.length, 0)
      const warnings: string[] = []
      if (chars < 40) warnings.push('PDF has little or no text layer — it is likely a scanned image. Add a manual transcription or enable an OCR provider.')
      return { engine: 'pdf-text', pages, warnings }
    } catch (e) {
      return { engine: 'none', pages: [], warnings: [`PDF text extraction failed: ${e instanceof Error ? e.message : String(e)}`] }
    }
  }
  return { engine: 'none', pages: [], warnings: ['Image uploads are stored as evidence but OCR is not bundled; add a manual transcription so the response can be analysed.'] }
}

const CASE_CODE_RE = /\bCR-\d{4}-\d{4}\b/g
const ACCT_RE = /(?:ending in|acct(?:ount)?\s*(?:#|no\.?|number)?\s*[:-]?\s*)[x*•]*(\d{4})\b/gi
const DATE_RE = /\b(?:\d{1,2}\/\d{1,2}\/\d{2,4}|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4})\b/g

export function classifyResponse(text: string): ResponseCategory | null {
  const t = text.toLowerCase()
  if (!t.trim()) return null
  if (/\b(undeliverable|return(ed)? to sender|no such address|unable to forward)\b/.test(t)) return 'undeliverable'
  const deleted = /\b(deleted|removed from your (credit )?(file|report)|has been removed|no longer appears)\b/.test(t)
  const updated = /\b(updated|corrected|modified|revised|changed to reflect)\b/.test(t)
  const verified = /\b(verified|remains? (as )?(reported|unchanged)|accurate as reported|confirmed the (information|item)|no change)\b/.test(t)
  // Outcome statements take precedence over boilerplate "you may contact the furnisher" advice.
  if (deleted && !updated && !verified) return 'deleted'
  if (updated && verified) return 'partially_updated'
  if (updated) return 'corrected'
  if (verified) return 'verified_no_change'
  if (deleted) return 'deleted'
  if (/\b(additional (information|documentation)|proof of (identity|address)|verify your identity|unable to (process|locate)|provide (a )?copy of)\b/.test(t)) return 'more_information_requested'
  if (/\b(contact (the )?(furnisher|creditor|data furnisher) directly|dispute directly with|must be submitted to)\b/.test(t)) return 'rerouted_other_channel'
  return 'unclear'
}

export function detectSender(text: string): { bureau: Bureau | null; name: string | null } {
  const t = text.toLowerCase()
  for (const b of BUREAUS) {
    if (t.includes(b)) return { bureau: b, name: b.charAt(0).toUpperCase() + b.slice(1) }
  }
  const m = text.match(/^([A-Z][A-Za-z&.,' ]{3,60})\s*$/m)
  return { bureau: null, name: m?.[1]?.trim() ?? null }
}

export function buildExtraction(extracted: ExtractedText): InboundExtraction {
  const full = extracted.pages.join('\n\n')
  const caseCodes = [...new Set(full.match(CASE_CODE_RE) ?? [])]
  const accountRefs = [...new Set([...full.matchAll(ACCT_RE)].map(m => m[1]!))]
  const dates = [...new Set(full.match(DATE_RE) ?? [])].slice(0, 10)
  const category = classifyResponse(full)
  const sender = detectSender(full)
  const chars = full.length
  let confidence = 0
  if (chars > 200) confidence += 0.35
  if (caseCodes.length) confidence += 0.35
  if (category && category !== 'unclear') confidence += 0.2
  if (sender.bureau) confidence += 0.1
  return {
    engine: extracted.engine,
    confidence: Math.min(1, Number(confidence.toFixed(2))),
    caseCodes,
    accountRefs,
    responseCategory: category,
    senderGuess: sender.name,
    datesMentioned: dates,
    pageTexts: extracted.pages.map((p, i) => ({ page: i + 1, chars: p.length })),
    warnings: extracted.warnings,
  }
}
