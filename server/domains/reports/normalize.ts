import { z } from 'zod'
import { BUREAUS, type Bureau } from '#shared/constants'
import type { PaymentHistoryEntry } from '../../db/schema'

/**
 * CreditOS normalized import format. Any provider adapter or manual import
 * produces this shape; the raw source document is kept alongside it.
 */
export const importTradelineSchema = z.object({
  creditorName: z.string().min(1),
  accountNumberMasked: z.string().min(2),
  accountType: z.string().default('revolving'),
  ownership: z.string().default('individual'),
  status: z.string().default('open'),
  paymentStatus: z.string().default('current'),
  openedDate: z.string().nullable().optional(),
  reportedDate: z.string().nullable().optional(),
  closedDate: z.string().nullable().optional(),
  dateFirstDelinquency: z.string().nullable().optional(),
  balance: z.number().nullable().optional(),
  creditLimit: z.number().nullable().optional(),
  highBalance: z.number().nullable().optional(),
  pastDue: z.number().nullable().optional(),
  monthlyPayment: z.number().nullable().optional(),
  originalCreditor: z.string().nullable().optional(),
  paymentHistory: z
    .array(z.object({ month: z.string(), status: z.enum(['OK', '30', '60', '90', '120', 'CO', 'ND']) }))
    .default([]),
  remarks: z.array(z.string()).default([]),
  raw: z.record(z.string(), z.unknown()).default({}),
})

export const importInquirySchema = z.object({
  subscriberName: z.string().min(1),
  inquiryDate: z.string(),
  type: z.enum(['hard', 'soft']).default('hard'),
  purpose: z.string().nullable().optional(),
  raw: z.record(z.string(), z.unknown()).default({}),
})

export const importReportSchema = z.object({
  bureau: z.enum(BUREAUS),
  reportDate: z.string(),
  source: z.string().default('manual_import'),
  personalInfo: z.object({
    nameOnFile: z.string(),
    addresses: z.array(z.string()).default([]),
    dateOfBirthMasked: z.string().optional(),
    ssnMasked: z.string().optional(),
    employers: z.array(z.string()).optional(),
  }),
  score: z
    .object({ value: z.number(), model: z.string(), provider: z.string(), asOf: z.string() })
    .nullable()
    .optional(),
  tradelines: z.array(importTradelineSchema).default([]),
  inquiries: z.array(importInquirySchema).default([]),
  raw: z.record(z.string(), z.unknown()).default({}),
})

export type ImportReport = z.infer<typeof importReportSchema>
export type ImportTradeline = z.infer<typeof importTradelineSchema>

const CREDITOR_NOISE = /\b(bank|na|n\.a\.|inc|llc|corp|corporation|co|company|card|services|svcs|fin|financial|usa|the|of|credit|cards|bk)\b/g

export function normalizeCreditor(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(CREDITOR_NOISE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function last4(masked: string): string {
  const digits = masked.replace(/\D/g, '')
  return digits.slice(-4).padStart(4, '0')
}

/**
 * Brand token used for matching: bureaus abbreviate furnisher names
 * differently ("Chase Auto Finance" / "CHASE AUTO", "Navient Solutions LLC" /
 * "NAVIENT"), so only the leading brand word is treated as identifying.
 * Combined with the last 4 digits this is still a conservative key — two
 * different accounts from the same brand sharing the same last four digits
 * on the same report are rare and are surfaced as a duplicate-tradeline review.
 */
export function creditorBrand(name: string): string {
  const normalized = normalizeCreditor(name)
  return normalized.split(' ')[0] || normalized || 'unknown'
}

/**
 * Defensible cross-bureau match key: creditor brand + last 4 of the masked
 * account number. Same key => same account with high confidence.
 */
export function accountKey(t: Pick<ImportTradeline, 'creditorName' | 'accountNumberMasked'>): string {
  return `${creditorBrand(t.creditorName)}|${last4(t.accountNumberMasked)}`
}

export function parseDate(v: string | null | undefined): Date | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

export function numStr(v: number | null | undefined): string | null {
  return v === null || v === undefined ? null : v.toFixed(2)
}

export function summarize(report: ImportReport) {
  const open = report.tradelines.filter(t => t.status === 'open')
  const derog = report.tradelines.filter(t => t.paymentStatus !== 'current' || t.accountType === 'collection')
  const totalBalance = report.tradelines.reduce((s, t) => s + (t.balance ?? 0), 0)
  const totalLimit = report.tradelines.filter(t => t.accountType === 'revolving').reduce((s, t) => s + (t.creditLimit ?? 0), 0)
  return {
    tradelineCount: report.tradelines.length,
    openCount: open.length,
    derogatoryCount: derog.length,
    inquiryCount: report.inquiries.length,
    hardInquiryCount: report.inquiries.filter(i => i.type === 'hard').length,
    totalBalance,
    totalRevolvingLimit: totalLimit,
    utilization: totalLimit > 0 ? Math.round((report.tradelines.filter(t => t.accountType === 'revolving').reduce((s, t) => s + (t.balance ?? 0), 0) / totalLimit) * 100) : null,
  }
}

export function bureauLabel(b: Bureau): string {
  return b.charAt(0).toUpperCase() + b.slice(1)
}

export type { PaymentHistoryEntry }
