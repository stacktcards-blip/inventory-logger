export type SlabsDashboardRow = {
  id: string
  sku: string
  cert: string | null
  grading_company: string | null
  grade: string | null
  set_abbr: string
  num: string
  lang: string
  is_1ed: boolean | null
  is_rev: boolean | null
  card_name: string | null
  rrty: string | null
  rarity: string | null
  set_num: string | null
  order_number: string | null
  submission_date: string | null
  acquired_date: string | null
  listed_date: string | null
  sold_date: string | null
  listing_state: 'NOT_LISTED' | 'LISTED' | 'AWAITING_AUCTION' | null
  acquisition_type: 'GRADED_BY_US' | 'PURCHASED_GRADED' | 'CONSIGNMENT' | 'UNKNOWN' | null
  metadata_status: 'PARSED_CONFIRMED' | 'NEEDS_ENRICHMENT' | 'NEEDS_REVIEW' | 'PSA_METADATA_ONLY' | null
  stock_source: 'PHYSICAL_STOCKTAKE' | 'PSA_STAGING' | 'MANUAL' | 'UNKNOWN' | null
  source_psa_row_id: string | null
  source_stocktake_scan_id: string | null
  restocked_at: string | null
  restock_reason: string | null
  grading_order_id: number | null
  raw_card_id: number | null
  raw_purchase_date: string | null
  raw_seller: string | null
  raw_cost_aud: number | null
  sales_status: 'NOT LISTED' | 'LISTED' | 'AWAITING AUCTION' | 'SOLD'
  slab_origin: 'GRADED_BY_US' | 'PURCHASED_GRADED' | 'PURCHASED_SLAB' | 'CONSIGNMENT' | 'UNKNOWN'
  is_linked_to_raw: boolean
}

export type SlabsSortField = 'sku' | 'raw_purchase_date' | 'submission_date'
export type SlabsSortDir = 'asc' | 'desc'

export type SlabsFilters = {
  salesStatus: string
  slabOrigin: string
  searchText: string
  gradingOrderId: string
  gradingCompany: string
  grade: string
  sortBy: SlabsSortField
  sortDir: SlabsSortDir
}

export type SlabsEnrichedRow = SlabsDashboardRow & {
  note: string | null
  grading_order_id: number | null
  purchase_price: number | null
  exchange_rate: number | null
  raw_cost_aud: number | null
}
