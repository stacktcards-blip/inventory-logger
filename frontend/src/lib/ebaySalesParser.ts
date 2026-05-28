export type EbaySalesItemRow = {
  saleDate: string
  buyerUsername: string
  orderNumber: string
  salesRecordNumber: string
  itemNumber: string
  listingTitle: string
  customLabel: string
  quantity: number
  soldFor: number | null
  postageAndHandling: number | null
  totalPrice: number | null
  trackingNumber: string
  combinedOrder: boolean
  warnings: string[]
}

export type SalesPackingRow = EbaySalesItemRow & {
  quantityUnit: string
  certScanned: string
  scanStatus: 'pending' | 'scanned'
}

export type EbaySalesParseSummary = {
  orderCount: number
  itemRowCount: number
  expandedRowCount: number
  totalSoldExPostage: number
  missingSkuCount: number
  highValueMissingSkuCount: number
  combinedOrderItemCount: number
  multiQuantityExpandedCount: number
}

export type EbaySalesParseResult = {
  itemRows: EbaySalesItemRow[]
  expandedRows: SalesPackingRow[]
  summary: EbaySalesParseSummary
}

type CsvRecord = Record<string, string>

type OrderContext = {
  saleDate: string
  buyerUsername: string
  orderNumber: string
  salesRecordNumber: string
  trackingNumber: string
  combinedOrder: boolean
}

const HIGH_VALUE_MISSING_SKU_THRESHOLD = 400

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  const normalized = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i]
    const next = normalized[i + 1]

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      row.push(cell.trim())
      cell = ''
      continue
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1
      row.push(cell.trim())
      if (row.some((value) => value.trim() !== '')) rows.push(row)
      row = []
      cell = ''
      continue
    }

    cell += char
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim())
    if (row.some((value) => value.trim() !== '')) rows.push(row)
  }

  return rows
}

function toRecords(text: string): CsvRecord[] {
  const rows = parseCsv(text)
  const headerIndex = rows.findIndex((row) => row.includes('Sales Record Number') && row.includes('Order Number'))
  if (headerIndex === -1) return []

  const headers = rows[headerIndex]
  return rows.slice(headerIndex + 1).map((row) => {
    const record: CsvRecord = {}
    headers.forEach((header, index) => {
      record[header] = row[index] ?? ''
    })
    return record
  })
}

function value(record: CsvRecord, key: string): string {
  return (record[key] ?? '').trim()
}

function parseMoney(raw: string): number | null {
  const cleaned = raw.replace(/[A-Z]{2}\s*\$/i, '').replace(/[^0-9.-]+/g, '')
  if (!cleaned) return null
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

function parseQuantity(raw: string): number {
  const parsed = Number(raw.replace(/[^0-9]+/g, ''))
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1
}

function isFooter(record: CsvRecord): boolean {
  const salesRecord = value(record, 'Sales Record Number').toLowerCase()
  const orderNumber = value(record, 'Order Number').toLowerCase()
  return salesRecord.startsWith('seller id') || orderNumber.includes('record(s) downloaded')
}

function isBlankRecord(record: CsvRecord): boolean {
  return Object.values(record).every((entry) => !entry?.trim())
}

function mergeWithContext(record: CsvRecord, context: OrderContext | null): OrderContext {
  const explicitOrderNumber = value(record, 'Order Number')
  const explicitSalesRecordNumber = value(record, 'Sales Record Number')
  const sameOrder = Boolean(
    context &&
    ((explicitOrderNumber && explicitOrderNumber === context.orderNumber) ||
      (!explicitOrderNumber && explicitSalesRecordNumber && explicitSalesRecordNumber === context.salesRecordNumber) ||
      (!explicitOrderNumber && !explicitSalesRecordNumber))
  )

  return {
    saleDate: value(record, 'Sale Date') || (sameOrder ? context?.saleDate : '') || '',
    buyerUsername: value(record, 'Buyer Username') || (sameOrder ? context?.buyerUsername : '') || '',
    orderNumber: explicitOrderNumber || (sameOrder ? context?.orderNumber : '') || '',
    salesRecordNumber: explicitSalesRecordNumber || (sameOrder ? context?.salesRecordNumber : '') || '',
    trackingNumber: value(record, 'Tracking Number') || (sameOrder ? context?.trackingNumber : '') || '',
    combinedOrder: sameOrder ? context?.combinedOrder ?? false : false,
  }
}

function buildWarnings(row: Omit<EbaySalesItemRow, 'warnings'>): string[] {
  const warnings: string[] = []
  if (!row.customLabel) warnings.push('Missing SKU/custom label')
  if (!row.customLabel && (row.soldFor ?? 0) >= HIGH_VALUE_MISSING_SKU_THRESHOLD) {
    warnings.push('High-value sale missing SKU/custom label')
  }
  if (row.combinedOrder) warnings.push('Combined order item')
  if (row.quantity > 1) warnings.push(`Quantity ${row.quantity} expanded into cert scan rows`)
  if (!row.itemNumber || !row.listingTitle) warnings.push('Blank item number/title')
  return warnings
}

export function parseEbaySalesCsv(text: string): EbaySalesParseResult {
  const records = toRecords(text)
  const itemRows: EbaySalesItemRow[] = []
  const combinedOrders = new Set<string>()
  let context: OrderContext | null = null

  for (const record of records) {
    if (isBlankRecord(record) || isFooter(record)) continue

    const itemNumber = value(record, 'Item Number')
    const listingTitle = value(record, 'Item Title')
    const mergedContext = mergeWithContext(record, context)
    const quantity = parseQuantity(value(record, 'Quantity'))

    if (!itemNumber && !listingTitle) {
      if (mergedContext.orderNumber) combinedOrders.add(mergedContext.orderNumber)
      context = { ...mergedContext, combinedOrder: true }
      continue
    }

    const combinedOrder = Boolean(
      mergedContext.combinedOrder ||
      (mergedContext.orderNumber && combinedOrders.has(mergedContext.orderNumber))
    )

    const baseRow: Omit<EbaySalesItemRow, 'warnings'> = {
      saleDate: mergedContext.saleDate,
      buyerUsername: mergedContext.buyerUsername,
      orderNumber: mergedContext.orderNumber,
      salesRecordNumber: mergedContext.salesRecordNumber,
      itemNumber,
      listingTitle,
      customLabel: value(record, 'Custom Label'),
      quantity,
      soldFor: parseMoney(value(record, 'Sold For')),
      postageAndHandling: parseMoney(value(record, 'Postage And Handling')),
      totalPrice: parseMoney(value(record, 'Total Price')),
      trackingNumber: value(record, 'Tracking Number') || mergedContext.trackingNumber,
      combinedOrder,
    }
    itemRows.push({ ...baseRow, warnings: buildWarnings(baseRow) })
    context = { ...mergedContext, combinedOrder }
  }

  const expandedRows = itemRows.flatMap((row) => {
    return Array.from({ length: row.quantity }, (_, index): SalesPackingRow => ({
      ...row,
      quantityUnit: `${index + 1} of ${row.quantity}`,
      certScanned: '',
      scanStatus: 'pending',
    }))
  })

  const orderNumbers = new Set(itemRows.map((row) => row.orderNumber).filter(Boolean))
  const totalSoldExPostage = itemRows.reduce(
    (sum, row) => sum + (row.soldFor ?? 0) * row.quantity,
    0
  )

  return {
    itemRows,
    expandedRows,
    summary: {
      orderCount: orderNumbers.size,
      itemRowCount: itemRows.length,
      expandedRowCount: expandedRows.length,
      totalSoldExPostage,
      missingSkuCount: expandedRows.filter((row) => row.warnings.includes('Missing SKU/custom label')).length,
      highValueMissingSkuCount: expandedRows.filter((row) => row.warnings.includes('High-value sale missing SKU/custom label')).length,
      combinedOrderItemCount: expandedRows.filter((row) => row.combinedOrder).length,
      multiQuantityExpandedCount: expandedRows.filter((row) => row.quantity > 1).length,
    },
  }
}

function escapeCsv(value: string | number | null): string {
  const text = value == null ? '' : String(value)
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function exportSalesPackingRowsCsv(rows: SalesPackingRow[]): string {
  const headers = [
    'sale date',
    'buyer username',
    'order number',
    'sales record number',
    'item number',
    'listing title',
    'sku/custom label',
    'quantity unit',
    'sold price ex postage',
    'tracking number',
    'cert scanned/manual',
    'scan status',
    'warnings',
  ]

  const lines = rows.map((row) => [
    row.saleDate,
    row.buyerUsername,
    row.orderNumber,
    row.salesRecordNumber,
    row.itemNumber,
    row.listingTitle,
    row.customLabel,
    row.quantityUnit,
    row.soldFor ?? '',
    row.trackingNumber,
    row.certScanned,
    row.scanStatus,
    row.warnings.join('; '),
  ])

  return [headers, ...lines].map((line) => line.map(escapeCsv).join(',')).join('\n')
}

export function formatAud(value: number | null): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(value)
}
