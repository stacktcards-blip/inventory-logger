export type RawCardRow = {
  id: number
  created_at: string
  SKU: string | null
  set_abbr: string | null
  num: string | null
  lang: string | null
  is_1ed: boolean | null
  is_rev: boolean | null
  cond: string | null
  purchase_price: number | null
  exchange_rate: number | null
  currency: string | null
  seller: string | null
  purchase_date: string | null
  note: string | null
  card_name: string | null
  rrty: string | null
  rarity: string | null
}

/** Draft row for the Add Raw Cards page (no id, card_name looked up from master_cards) */
export type RawCardDraftRow = {
  set_abbr: string
  num: string
  lang: string
  card_name: string | null
  currency: string
  purchase_price: string
  exchange_rate: string
  seller: string
  purchase_date: string
  cond: string
  note: string
  is_1ed: boolean
  is_rev: boolean
}

export type RawCardsSortField =
  | 'purchase_date'
  | 'created_at'
  | 'purchase_price'
  | 'set_abbr'
  | 'num'
  | 'seller'
export type RawCardsSortDir = 'asc' | 'desc'

export type RawCardsFilters = {
  setAbbr: string
  num: string
  lang: string
  seller: string
  dateFrom: string
  dateTo: string
  searchText: string
  sortBy: RawCardsSortField
  sortDir: RawCardsSortDir
}

export type RawCardsTallyResult = {
  total_qty: number
  total_qty_jpy: number
  avg_price_jpy: number | null
  total_cost_jpy: number | null
  total_qty_aud: number
  avg_price_aud: number | null
  total_cost_aud: number | null
}
