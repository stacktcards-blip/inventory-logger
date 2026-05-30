import type { EbaySalesItemRow, SalesPackingRow } from './ebaySalesParser'

export type SalesPackingVisibleRow = SalesPackingRow & {
  rowKey: string
}

export type SalesPackingImportInsert = {
  source_filename: string | null
  row_count: number
  expanded_row_count: number
  order_count: number
  total_sold_ex_postage: number
  status: 'imported' | 'partially_scanned' | 'scanned'
  raw_csv_text: string | null
}

export type SalesPackingItemInsert = {
  line_item_key: string
  sale_date: string
  buyer_username: string
  order_number: string
  sales_record_number: string
  item_number: string
  listing_title: string
  custom_label: string
  quantity: number
  sold_for: number | null
  postage_and_handling: number | null
  total_price: number | null
  tracking_number: string
  combined_order: boolean
  warnings: string[]
  raw_item_json: EbaySalesItemRow
}

export type SalesPackingRowInsert = SalesPackingItemInsert & {
  quantity_unit: string
  cert_scanned: string
  scan_status: 'pending' | 'scanned'
  removed: boolean
  removed_reason: string | null
}

export type SalesPackingImportPayload = {
  importRow: SalesPackingImportInsert
  itemRows: SalesPackingItemInsert[]
  packingRows: SalesPackingRowInsert[]
}

export type SavedSalesPackingRow = {
  id: string
  line_item_key: string
  sale_date: string
  buyer_username: string
  order_number: string
  sales_record_number: string
  item_number: string
  listing_title: string
  custom_label: string
  quantity: number
  sold_for: number | null
  postage_and_handling: number | null
  total_price: number | null
  tracking_number: string
  combined_order: boolean
  warnings: string[] | null
  quantity_unit: string
  cert_scanned: string | null
  scan_status: 'pending' | 'scanned'
  removed: boolean | null
  removed_reason: string | null
}

function lineItemKey(row: Pick<EbaySalesItemRow, 'orderNumber' | 'salesRecordNumber' | 'itemNumber'>): string {
  return [row.orderNumber, row.salesRecordNumber, row.itemNumber].join('|')
}

function itemInsert(row: EbaySalesItemRow): SalesPackingItemInsert {
  return {
    line_item_key: lineItemKey(row),
    sale_date: row.saleDate,
    buyer_username: row.buyerUsername,
    order_number: row.orderNumber,
    sales_record_number: row.salesRecordNumber,
    item_number: row.itemNumber,
    listing_title: row.listingTitle,
    custom_label: row.customLabel,
    quantity: row.quantity,
    sold_for: row.soldFor,
    postage_and_handling: row.postageAndHandling,
    total_price: row.totalPrice,
    tracking_number: row.trackingNumber,
    combined_order: row.combinedOrder,
    warnings: row.warnings,
    raw_item_json: row,
  }
}

export function buildSalesPackingImportPayload(
  itemRows: EbaySalesItemRow[],
  packingRows: SalesPackingVisibleRow[],
  options: { filename?: string | null; csvText?: string | null } = {}
): SalesPackingImportPayload {
  const orderCount = new Set(packingRows.map((row) => row.orderNumber).filter(Boolean)).size
  const totalSoldExPostage = packingRows.reduce((sum, row) => sum + (row.soldFor ?? 0), 0)

  return {
    importRow: {
      source_filename: options.filename ?? null,
      row_count: itemRows.length,
      expanded_row_count: packingRows.length,
      order_count: orderCount,
      total_sold_ex_postage: totalSoldExPostage,
      status: packingRows.some((row) => row.certScanned.trim()) ? 'partially_scanned' : 'imported',
      raw_csv_text: options.csvText ?? null,
    },
    itemRows: itemRows.map(itemInsert),
    packingRows: packingRows.map((row) => ({
      ...itemInsert(row),
      quantity_unit: row.quantityUnit,
      cert_scanned: row.certScanned,
      scan_status: row.certScanned.trim() ? 'scanned' : 'pending',
      removed: false,
      removed_reason: null,
    })),
  }
}

export function buildSalesPackingRowsFromSaved(rows: SavedSalesPackingRow[]): SalesPackingVisibleRow[] {
  return rows.map((row) => ({
    rowKey: row.id,
    saleDate: row.sale_date,
    buyerUsername: row.buyer_username,
    orderNumber: row.order_number,
    salesRecordNumber: row.sales_record_number,
    itemNumber: row.item_number,
    listingTitle: row.listing_title,
    customLabel: row.custom_label,
    quantity: row.quantity,
    soldFor: row.sold_for,
    postageAndHandling: row.postage_and_handling,
    totalPrice: row.total_price,
    trackingNumber: row.tracking_number,
    combinedOrder: row.combined_order,
    warnings: row.warnings ?? [],
    quantityUnit: row.quantity_unit,
    certScanned: row.cert_scanned ?? '',
    scanStatus: row.scan_status,
  }))
}
