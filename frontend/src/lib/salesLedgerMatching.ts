import type { SalesLedgerRow } from '../types/salesLedger'

export type LedgerMatchTone = 'matched' | 'review' | 'unmatched'

export type LedgerMatchDisplay = {
  label: string
  tone: LedgerMatchTone
  detail: string
}

export type LedgerMatchingSummary = {
  matched: number
  review: number
  unmatched: number
  withGrossProfit: number
}

const normalizeStatus = (status: string | null | undefined): 'MATCHED' | 'REVIEW' | 'UNMATCHED' => {
  if (status === 'MATCHED') return 'MATCHED'
  if (status === 'REVIEW' || status === 'MANUAL_REVIEW') return 'REVIEW'
  return 'UNMATCHED'
}

export function getLedgerMatchDisplay(row: SalesLedgerRow): LedgerMatchDisplay {
  const normalized = normalizeStatus(row.inventoryMatchStatus ?? row.matchStatus)
  const cert = row.packingCert ?? row.slabCert
  const method = row.packingMatchMethod ?? row.matchMethod

  if (normalized === 'MATCHED') {
    return {
      label: row.inventoryMatchLabel || (row.packingCert ? 'Matched by cert scan' : 'Matched'),
      tone: 'matched',
      detail: [cert ? `Cert ${cert}` : null, method].filter(Boolean).join(' · ') || 'Inventory linked',
    }
  }

  if (normalized === 'REVIEW') {
    return {
      label: row.inventoryMatchLabel || 'Needs review',
      tone: 'review',
      detail: row.reviewReason || row.packingReviewReason || (cert ? `Check cert ${cert}` : 'Manual matching required'),
    }
  }

  return {
    label: row.inventoryMatchLabel || 'Unmatched',
    tone: 'unmatched',
    detail: row.reviewReason || 'No cert scan or direct inventory link yet',
  }
}

export function summarizeLedgerMatching(rows: SalesLedgerRow[]): LedgerMatchingSummary {
  return rows.reduce<LedgerMatchingSummary>(
    (summary, row) => {
      const normalized = normalizeStatus(row.inventoryMatchStatus ?? row.matchStatus)
      if (normalized === 'MATCHED') summary.matched += 1
      else if (normalized === 'REVIEW') summary.review += 1
      else summary.unmatched += 1

      if (row.grossProfitAud != null) summary.withGrossProfit += 1
      return summary
    },
    { matched: 0, review: 0, unmatched: 0, withGrossProfit: 0 }
  )
}
