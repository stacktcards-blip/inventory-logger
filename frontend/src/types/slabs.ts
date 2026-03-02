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
  grading_order_id: number | null
  raw_card_id: number | null
  raw_purchase_date: string | null
  raw_seller: string | null
  raw_cost_aud: number | null
  sales_status: 'NOT LISTED' | 'LISTED' | 'SOLD'
  slab_origin: 'GRADED_BY_US' | 'PURCHASED_SLAB' | 'UNKNOWN'
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
