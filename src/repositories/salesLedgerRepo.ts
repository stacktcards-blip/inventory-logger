import { supabase } from './supabaseClient.js';

export type SalesLedgerFilters = {
  startDate?: string;
  endDate?: string;
  matchStatus?: string;
  fulfillmentStatus?: string;
  search?: string;
};

export type SalesLedgerRow = {
  saleId: string;
  salesChannel: string;
  soldDate: string | null;
  title: string | null;
  buyerUsername: string | null;
  quantity: number;
  salePrice: number | null;
  currency: string | null;
  shippingCost: number | null;
  fulfillmentStatus: string | null;
  matchStatus: string;
  matchMethod: string | null;
  slabId: string | null;
  slabCert: string | null;
  slabGrade: string | null;
  slabGradingCompany: string | null;
  slabSetAbbr: string | null;
  slabNum: string | null;
  slabLang: string | null;
  rawCardId: number | null;
  rawCostAud: number | null;
  grossProfitAud: number | null;
  daysHeld: number | null;
  imageUrl: string | null;
  packingRowId: string | null;
  packingImportId: string | null;
  packingCert: string | null;
  packingScanStatus: string | null;
  packingMatchMethod: string | null;
  packingReviewReason: string | null;
  packingImportedAt: string | null;
  inventoryMatchStatus: string;
  inventoryMatchLabel: string;
  reviewReason: string | null;
};

export type SalesLedgerQuery = {
  filters?: SalesLedgerFilters;
  limit?: number;
  offset?: number;
};

type SalesLedgerDbRow = {
  sale_id: string;
  sales_channel: string;
  sold_date: string | null;
  title: string | null;
  buyer_username: string | null;
  quantity: number;
  sale_price: number | null;
  currency: string | null;
  shipping_cost: number | null;
  fulfillment_status: string | null;
  match_status: string;
  match_method: string | null;
  slab_id: string | null;
  slab_cert: string | null;
  slab_grade: string | null;
  slab_grading_company: string | null;
  slab_set_abbr: string | null;
  slab_num: string | null;
  slab_lang: string | null;
  raw_card_id: number | null;
  raw_cost_aud: number | null;
  gross_profit_aud: number | null;
  days_held: number | null;
  image_url: string | null;
  packing_row_id?: string | null;
  packing_import_id?: string | null;
  packing_cert?: string | null;
  packing_scan_status?: string | null;
  packing_match_method?: string | null;
  packing_review_reason?: string | null;
  packing_imported_at?: string | null;
  inventory_match_status?: string | null;
  inventory_match_label?: string | null;
  review_reason?: string | null;
};

const applyFilters = <T extends { gte: Function; lte: Function; eq: Function; or: Function }>(
  query: T,
  filters?: SalesLedgerFilters
) => {
  if (!filters) return query;
  if (filters.startDate) query = query.gte('sold_date', filters.startDate);
  if (filters.endDate) query = query.lte('sold_date', filters.endDate);
  if (filters.matchStatus) query = query.eq('match_status', filters.matchStatus);
  if (filters.fulfillmentStatus) query = query.eq('fulfillment_status', filters.fulfillmentStatus);
  if (filters.search) {
    const term = filters.search.trim();
    if (term) {
      query = query.or(
        `title.ilike.%${term}%,slab_cert.ilike.%${term}%,slab_set_abbr.ilike.%${term}%,slab_num.ilike.%${term}%`
      );
    }
  }
  return query;
};

const mapRow = (row: SalesLedgerDbRow): SalesLedgerRow => ({
  saleId: row.sale_id,
  salesChannel: row.sales_channel,
  soldDate: row.sold_date,
  title: row.title,
  buyerUsername: row.buyer_username,
  quantity: Number(row.quantity ?? 0),
  salePrice: row.sale_price != null ? Number(row.sale_price) : null,
  currency: row.currency,
  shippingCost: row.shipping_cost != null ? Number(row.shipping_cost) : null,
  fulfillmentStatus: row.fulfillment_status,
  matchStatus: row.match_status,
  matchMethod: row.match_method,
  slabId: row.slab_id,
  slabCert: row.slab_cert,
  slabGrade: row.slab_grade,
  slabGradingCompany: row.slab_grading_company,
  slabSetAbbr: row.slab_set_abbr,
  slabNum: row.slab_num,
  slabLang: row.slab_lang,
  rawCardId: row.raw_card_id,
  rawCostAud: row.raw_cost_aud != null ? Number(row.raw_cost_aud) : null,
  grossProfitAud: row.gross_profit_aud != null ? Number(row.gross_profit_aud) : null,
  daysHeld: row.days_held != null ? Number(row.days_held) : null,
  imageUrl: row.image_url,
  packingRowId: row.packing_row_id ?? null,
  packingImportId: row.packing_import_id ?? null,
  packingCert: row.packing_cert ?? null,
  packingScanStatus: row.packing_scan_status ?? null,
  packingMatchMethod: row.packing_match_method ?? null,
  packingReviewReason: row.packing_review_reason ?? null,
  packingImportedAt: row.packing_imported_at ?? null,
  inventoryMatchStatus: row.inventory_match_status ?? row.match_status ?? 'PENDING',
  inventoryMatchLabel: row.inventory_match_label ?? row.match_status ?? 'PENDING',
  reviewReason: row.review_reason ?? null,
});

export async function fetchSalesLedger({ filters, limit = 50, offset = 0 }: SalesLedgerQuery) {
  const clampedLimit = Math.min(Math.max(limit, 1), 200);
  const safeOffset = Math.max(offset, 0);

  const baseQuery = applyFilters(
    supabase.from('sales_ledger').select('*', { count: 'exact', head: false }),
    filters
  );

  const { data, error, count } = await baseQuery
    .order('sold_date', { ascending: false, nullsLast: true })
    .order('updated_at', { ascending: false, nullsLast: true })
    .range(safeOffset, safeOffset + clampedLimit - 1);

  if (error) {
    throw new Error(`Failed to load sales ledger rows: ${error.message}`);
  }

  const { data: totalsData, error: totalsError } = await supabase
    .rpc('sales_ledger_totals', {
      p_start_date: filters?.startDate ?? null,
      p_end_date: filters?.endDate ?? null,
      p_match_status: filters?.matchStatus ?? null,
      p_fulfillment_status: filters?.fulfillmentStatus ?? null,
      p_search: filters?.search ?? null,
    })
    .single();

  if (totalsError && totalsError.code !== 'PGRST116') {
    throw new Error(`Failed to summarize sales ledger: ${totalsError.message}`);
  }

  const totalsRecord = (totalsData ?? {}) as { gross?: number; cost?: number; profit?: number };

  const rows = (data ?? []) as SalesLedgerDbRow[];

  return {
    rows: rows.map(mapRow),
    total: count ?? 0,
    limit: clampedLimit,
    offset: safeOffset,
    totals: {
      gross: Number(totalsRecord.gross ?? 0),
      cost: Number(totalsRecord.cost ?? 0),
      profit: Number(totalsRecord.profit ?? 0),
    },
  };
}
