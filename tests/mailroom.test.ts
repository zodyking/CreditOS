import { describe, expect, it } from 'vitest'
import { buildExtraction, classifyResponse, detectSender } from '../server/domains/mailroom/extract'

const BUREAU_LETTER = `Equifax Information Services LLC
P.O. Box 740256
Atlanta, GA 30374

March 14, 2026

Re: Dispute reference CR-2026-0002
Account ending in 4421

Dear Consumer,

We have completed our investigation of the item you disputed. The information you
disputed has been verified as accurate and remains as reported. If you would like
to add a statement of dispute to your file, you may do so at any time.`

describe('classifyResponse', () => {
  it('returns null for empty text', () => {
    expect(classifyResponse('   ')).toBeNull()
  })

  it('detects verified / no change outcomes', () => {
    expect(classifyResponse(BUREAU_LETTER)).toBe('verified_no_change')
  })

  it('detects deletions', () => {
    expect(classifyResponse('The disputed account has been removed from your credit file.')).toBe('deleted')
  })

  it('detects corrections and partial updates', () => {
    expect(classifyResponse('The item has been updated to reflect the information you provided.')).toBe('corrected')
    expect(classifyResponse('Some information was updated; the remaining items were verified as accurate.')).toBe('partially_updated')
  })

  it('detects requests for more information and rerouting', () => {
    expect(classifyResponse('Please provide a copy of your proof of identity before we can process your request.')).toBe('more_information_requested')
    expect(classifyResponse('You must contact the furnisher directly regarding this item.')).toBe('rerouted_other_channel')
  })

  it('detects undeliverable mail and falls back to unclear', () => {
    expect(classifyResponse('Returned to sender - no such address.')).toBe('undeliverable')
    expect(classifyResponse('Thank you for writing to us.')).toBe('unclear')
  })
})

describe('detectSender', () => {
  it('recognises bureaus by name', () => {
    expect(detectSender(BUREAU_LETTER)).toEqual({ bureau: 'equifax', name: 'Equifax' })
    expect(detectSender('From TransUnion Consumer Solutions').bureau).toBe('transunion')
  })

  it('falls back to a capitalised heading line for non-bureau senders', () => {
    const res = detectSender('Chase Card Services\n\nDear customer, your request was received.')
    expect(res.bureau).toBeNull()
    expect(res.name).toBe('Chase Card Services')
  })
})

describe('buildExtraction', () => {
  it('extracts case codes, account refs, dates and a confident classification', () => {
    const ex = buildExtraction({ engine: 'pdf-text', pages: [BUREAU_LETTER], warnings: [] })
    expect(ex.caseCodes).toEqual(['CR-2026-0002'])
    expect(ex.accountRefs).toEqual(['4421'])
    expect(ex.datesMentioned).toContain('March 14, 2026')
    expect(ex.responseCategory).toBe('verified_no_change')
    expect(ex.senderGuess).toBe('Equifax')
    expect(ex.confidence).toBeGreaterThanOrEqual(0.9)
    expect(ex.pageTexts).toEqual([{ page: 1, chars: BUREAU_LETTER.length }])
  })

  it('reports low confidence and keeps warnings for scanned images', () => {
    const ex = buildExtraction({ engine: 'none', pages: [], warnings: ['no OCR'] })
    expect(ex.confidence).toBe(0)
    expect(ex.caseCodes).toEqual([])
    expect(ex.responseCategory).toBeNull()
    expect(ex.warnings).toEqual(['no OCR'])
  })

  it('deduplicates repeated case codes across pages', () => {
    const ex = buildExtraction({ engine: 'pdf-text', pages: ['Re: CR-2026-0002', 'Ref CR-2026-0002 and CR-2026-0005'], warnings: [] })
    expect(ex.caseCodes).toEqual(['CR-2026-0002', 'CR-2026-0005'])
  })
})
