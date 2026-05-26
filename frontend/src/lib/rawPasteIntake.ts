import type { RawCardDraftRow } from '../types/rawCards'

export type RawIntakeDefaults = {
  seller: string
  purchase_date: string
  currency: string
  exchange_rate: string
  lang: string
  cond: string
}

export type ParsedPasteRawRow = {
  set_abbr: string
  num: string
  lang: string
  purchase_price: string
  cond: string
  quantity: string
  note: string
}

export type RawIntakeRow = RawCardDraftRow & {
  quantity: string
}

export type RawIntakeValidation = {
  errors: string[]
  warnings: string[]
}

export type RawIntakeSummary = {
  sourceRows: number
  commitRows: number
  readyRows: number
  warningRows: number
  errorRows: number
  estimatedAudCost: number | null
}

const DEFAULT_COLUMN_ORDER = ['set', 'num', 'lang', 'price', 'cond', 'qty', 'note'] as const

const HEADER_ALIASES: Record<string, keyof ParsedPasteRawRow> = {
  set: 'set_abbr',
  set_abbr: 'set_abbr',
  setabbr: 'set_abbr',
  num: 'num',
  number: 'num',
  cardnumber: 'num',
  card_number: 'num',
  lang: 'lang',
  language: 'lang',
  price: 'purchase_price',
  unitprice: 'purchase_price',
  unit_price: 'purchase_price',
  purchaseprice: 'purchase_price',
  purchase_price: 'purchase_price',
  cond: 'cond',
  condition: 'cond',
  qty: 'quantity',
  quantity: 'quantity',
  note: 'note',
  notes: 'note',
}

function blankParsedRow(): ParsedPasteRawRow {
  return {
    set_abbr: '',
    num: '',
    lang: '',
    purchase_price: '',
    cond: '',
    quantity: '1',
    note: '',
  }
}

function normaliseHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '')
}

function splitPasteLine(line: string): string[] {
  const delimiter = line.includes('\t') ? '\t' : ','
  if (delimiter === '\t') return line.split('\t').map((cell) => cell.trim())

  const out: string[] = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cell += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
    } else if (c === ',' && !inQuotes) {
      out.push(cell.trim())
      cell = ''
    } else {
      cell += c
    }
  }
  out.push(cell.trim())
  return out
}

function detectHeaders(cells: string[]): (keyof ParsedPasteRawRow)[] | null {
  const mapped = cells.map((cell) => HEADER_ALIASES[normaliseHeader(cell)] ?? null)
  const knownCount = mapped.filter(Boolean).length
  return knownCount >= 2 ? (mapped as (keyof ParsedPasteRawRow)[]) : null
}

export function parsePastedRawRows(text: string): ParsedPasteRawRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) return []

  const firstCells = splitPasteLine(lines[0])
  const detectedHeaders = detectHeaders(firstCells)
  const headers = detectedHeaders ?? DEFAULT_COLUMN_ORDER.map((header) => HEADER_ALIASES[header])
  const dataLines = detectedHeaders ? lines.slice(1) : lines

  return dataLines.map((line) => {
    const row = blankParsedRow()
    const cells = splitPasteLine(line)
    cells.forEach((cell, index) => {
      const key = headers[index]
      if (!key) return
      row[key] = cell.trim()
    })
    row.quantity = row.quantity || '1'
    return row
  })
}

export function applyIntakeDefaults(rows: ParsedPasteRawRow[], defaults: RawIntakeDefaults): RawIntakeRow[] {
  return rows.map((row) => ({
    set_abbr: row.set_abbr.trim(),
    num: row.num.trim(),
    lang: row.lang.trim() || defaults.lang.trim(),
    card_name: null,
    currency: defaults.currency.trim(),
    purchase_price: row.purchase_price.trim(),
    exchange_rate: defaults.exchange_rate.trim(),
    seller: defaults.seller.trim(),
    purchase_date: defaults.purchase_date,
    cond: row.cond.trim() || defaults.cond.trim(),
    note: row.note.trim(),
    is_1ed: false,
    is_rev: false,
    quantity: row.quantity.trim() || '1',
  }))
}

function numberOrNull(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function quantityValue(value: string): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0
}

export function validateIntakeRows(rows: RawIntakeRow[]): RawIntakeValidation[] {
  const counts = new Map<string, number>()
  rows.forEach((row) => {
    const key = `${row.set_abbr.trim().toLowerCase()}|${row.num.trim().toLowerCase()}|${row.lang.trim().toLowerCase()}|${row.cond.trim().toLowerCase()}`
    if (row.set_abbr.trim() && row.num.trim() && row.lang.trim()) {
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  })

  return rows.map((row) => {
    const errors: string[] = []
    const warnings: string[] = []
    const price = numberOrNull(row.purchase_price)
    const exchangeRate = numberOrNull(row.exchange_rate)
    const quantity = quantityValue(row.quantity)

    if (!row.set_abbr.trim()) errors.push('Set is required')
    if (!row.num.trim()) errors.push('Num is required')
    if (!row.lang.trim()) errors.push('Lang is required')
    if (row.purchase_price.trim() && price === null) errors.push('Price must be a number')
    if (row.exchange_rate.trim() && exchangeRate === null) errors.push('Exchange rate must be a number')
    if (quantity < 1) errors.push('Quantity must be at least 1')

    if (!row.purchase_price.trim()) warnings.push('Price is blank')
    if (!row.seller.trim()) warnings.push('Seller is blank')
    if (!row.purchase_date) warnings.push('Purchase date is blank')
    if (!row.cond.trim()) warnings.push('Condition is blank')
    if (row.currency.trim().toUpperCase() === 'JPY' && !row.exchange_rate.trim()) {
      warnings.push('JPY row is missing exchange rate')
    }
    if (row.set_abbr.trim() && row.num.trim() && row.lang.trim() && row.card_name === null) {
      warnings.push('Card name has not matched yet')
    }

    const key = `${row.set_abbr.trim().toLowerCase()}|${row.num.trim().toLowerCase()}|${row.lang.trim().toLowerCase()}|${row.cond.trim().toLowerCase()}`
    if ((counts.get(key) ?? 0) > 1) warnings.push('Duplicate-looking row in this batch')

    return { errors, warnings }
  })
}

export function expandQuantityRows(rows: RawIntakeRow[]): RawCardDraftRow[] {
  return rows.flatMap((row) => {
    const quantity = quantityValue(row.quantity) || 1
    const draft: RawCardDraftRow = {
      set_abbr: row.set_abbr,
      num: row.num,
      lang: row.lang,
      card_name: row.card_name,
      currency: row.currency,
      purchase_price: row.purchase_price,
      exchange_rate: row.exchange_rate,
      seller: row.seller,
      purchase_date: row.purchase_date,
      cond: row.cond,
      note: row.note,
      is_1ed: row.is_1ed,
      is_rev: row.is_rev,
    }
    return Array.from({ length: quantity }, () => ({ ...draft }))
  })
}

export function getIntakeSummary(rows: RawIntakeRow[], validations: RawIntakeValidation[]): RawIntakeSummary {
  let commitRows = 0
  let estimatedAudCost = 0
  let hasCost = false
  let readyRows = 0
  let warningRows = 0
  let errorRows = 0

  rows.forEach((row, index) => {
    const validation = validations[index] ?? { errors: [], warnings: [] }
    if (validation.errors.length > 0) {
      errorRows += 1
      return
    }
    if (validation.warnings.length > 0) warningRows += 1
    if (validation.warnings.length === 0) readyRows += 1

    const quantity = quantityValue(row.quantity) || 1
    commitRows += quantity
    const price = numberOrNull(row.purchase_price)
    if (price !== null) {
      const currency = row.currency.trim().toUpperCase()
      const exchangeRate = numberOrNull(row.exchange_rate)
      if (currency === 'JPY' && exchangeRate !== null) {
        estimatedAudCost += price * exchangeRate * quantity
        hasCost = true
      } else if (currency === 'AUD' || currency === '') {
        estimatedAudCost += price * quantity
        hasCost = true
      }
    }
  })

  return {
    sourceRows: rows.length,
    commitRows,
    readyRows,
    warningRows,
    errorRows,
    estimatedAudCost: hasCost ? Math.round(estimatedAudCost * 100) / 100 : null,
  }
}
