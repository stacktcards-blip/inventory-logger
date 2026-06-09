import { supabase } from '../repositories/supabaseClient.js';

export type AutoMatchResult = {
  salesReviewed: number;
  salesMatched: number;
};

const MAX_BATCH = 200;

const cleanSku = (sku: string | null) => sku?.trim() ?? '';

export async function autoMatchSalesBySku(params: { soldSince?: string } = {}): Promise<AutoMatchResult> {
  let query = supabase
    .from('ebay_sales')
    .select('id, sold_date, sale_price, currency, ebay_sku')
    .is('slab_id', null)
    .eq('match_status', 'PENDING')
    .not('ebay_sku', 'is', null)
    .neq('ebay_sku', '')
    .order('sold_date', { ascending: false, nullsLast: true })
    .limit(MAX_BATCH);

  if (params.soldSince) {
    query = query.gte('sold_date', params.soldSince);
  }

  const { data: pending, error } = await query;
  if (error) {
    throw new Error(`Failed to load pending eBay sales for matching: ${error.message}`);
  }

  let matched = 0;

  for (const sale of pending ?? []) {
    const sku = cleanSku(sale.ebay_sku);
    if (!sku) continue;

    const { data: slabs, error: slabError } = await supabase
      .from('slabs')
      .select('id, sold_date, sale_price, sale_currency')
      .eq('sku', sku)
      .is('sold_date', null)
      .limit(2);

    if (slabError) {
      throw new Error(`Failed to look up slab for SKU ${sku}: ${slabError.message}`);
    }

    if (!slabs || slabs.length !== 1) {
      continue;
    }

    const slab = slabs[0];

    const { error: updateSaleError } = await supabase
      .from('ebay_sales')
      .update({
        slab_id: slab.id,
        match_status: 'MATCHED',
        match_method: 'SKU',
        matched_at: new Date().toISOString(),
      })
      .eq('id', sale.id);

    if (updateSaleError) {
      throw new Error(`Failed to update sale ${sale.id}: ${updateSaleError.message}`);
    }

    const { error: updateSlabError } = await supabase
      .from('slabs')
      .update({
        sold_date: sale.sold_date ?? new Date().toISOString(),
        sale_price: sale.sale_price ?? slab.sale_price ?? null,
        sale_currency: sale.currency ?? slab.sale_currency ?? 'AUD',
        ebay_sale_id: sale.id,
      })
      .eq('id', slab.id);

    if (updateSlabError) {
      throw new Error(`Failed to update slab ${slab.id}: ${updateSlabError.message}`);
    }

    matched += 1;
  }

  return { salesReviewed: pending?.length ?? 0, salesMatched: matched };
}
