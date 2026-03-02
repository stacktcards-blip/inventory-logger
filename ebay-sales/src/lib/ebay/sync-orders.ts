/**
 * Sync eBay orders from Fulfillment API → ebay_sales
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getAccessToken } from './auth';
import { fetchItemImageUrl } from './fetch-item-image';
import { parseCarduploaderTitle } from './title-parser';

const EBAY_BASE = process.env.EBAY_ENVIRONMENT === 'sandbox'
  ? 'https://api.sandbox.ebay.com'
  : 'https://api.ebay.com';

type EbayOrder = {
  orderId?: string;
  creationDate?: string;
  orderFulfillmentStatus?: string;
  buyer?: { username?: string };
  lineItems?: EbayLineItem[];
};

type EbayLineItem = {
  lineItemId?: string;
  legacyItemId?: string;
  sku?: string;
  title?: string;
  quantity?: number;
  lineItemCost?: { value?: string; currency?: string };
  lineItemFulfillmentStatus?: string;
};

type EbayOrdersResponse = {
  orders?: EbayOrder[];
  total?: number;
  next?: string;
};

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 2
): Promise<Response> {
  let lastError: Error | null = null;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.status === 401 && i < retries) {
        // Token may have expired; clear cache and retry
        (global as unknown as { ebayTokenCache?: unknown }).ebayTokenCache = null;
        continue;
      }
      return res;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (i < retries) await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw lastError ?? new Error('Fetch failed');
}

export type SyncResult = {
  status: 'success' | 'error';
  orders_fetched: number;
  sales_created: number;
  sales_updated?: number;
  sales_matched: number;
  error_message?: string;
};

export async function syncEbayOrders(supabase: SupabaseClient): Promise<SyncResult> {
  const startedAt = new Date().toISOString();

  try {
    const token = await getAccessToken();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    // creationdate: new orders to pack. lastmodifieddate pulls in old shipped orders (FULFILLED).
    const creationFilter = `creationdate:[${sevenDaysAgo.toISOString()}..]`;

    const allOrders: EbayOrder[] = [];
    const limit = 200;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const params = new URLSearchParams({ filter: creationFilter, limit: String(limit), offset: String(offset) });
      const url = `${EBAY_BASE}/sell/fulfillment/v1/order?${params}`;
      const res = await fetchWithRetry(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`eBay API ${res.status}: ${text.slice(0, 500)}`);
      }

      const data = (await res.json()) as EbayOrdersResponse;
      const orders = data.orders ?? [];
      allOrders.push(...orders);
      hasMore = orders.length === limit;
      offset += limit;
    }

    let salesCreated = 0;
    let salesUpdated = 0;

    for (const order of allOrders) {
      const lineItems = order.lineItems ?? [];
      const buyerUsername = order.buyer?.username ?? null;
      const orderId = order.orderId ?? '';
      const creationDate = order.creationDate
        ? order.creationDate.slice(0, 10)
        : null;
      const orderFulfillmentStatus = order.orderFulfillmentStatus ?? 'NOT_STARTED';

      for (const li of lineItems) {
        const lineItemId = li.lineItemId;
        if (!lineItemId) continue;

        const fulfillmentStatus =
          li.lineItemFulfillmentStatus ?? orderFulfillmentStatus;

        const { data: existing } = await supabase
          .from('ebay_sales')
          .select('id')
          .eq('ebay_line_item_id', lineItemId)
          .single();

        if (existing) {
          const { error: updateErr } = await supabase
            .from('ebay_sales')
            .update({
              fulfillment_status: fulfillmentStatus,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);
          if (!updateErr) salesUpdated++;
          continue;
        }

        const title = li.title ?? '';
        const parsed = parseCarduploaderTitle(title);
        const salePrice = li.lineItemCost?.value
          ? parseFloat(li.lineItemCost.value)
          : null;
        const currency = li.lineItemCost?.currency ?? 'AUD';

        const matchStatus =
          parsed.parse_confidence < 0.5 ? 'MANUAL_REVIEW' : 'PENDING';

        const imageUrl = li.legacyItemId
          ? await fetchItemImageUrl(li.legacyItemId)
          : null;

        const row = {
          ebay_order_id: orderId,
          ebay_line_item_id: lineItemId,
          ebay_item_id: li.legacyItemId ?? null,
          ebay_sku: li.sku ?? null,
          title,
          quantity: li.quantity ?? 1,
          sale_price: salePrice,
          currency,
          sold_date: creationDate,
          buyer_username: buyerUsername,
          fulfillment_status: fulfillmentStatus,
          image_url: imageUrl,
          card_name: parsed.card_name,
          set_abbr: parsed.set_abbr,
          num: parsed.num,
          set_num: parsed.set_num,
          set_name: parsed.set_name,
          lang: parsed.lang,
          grade: parsed.grade,
          grading_company: parsed.grading_company,
          rarity: parsed.rarity,
          card_game: parsed.card_game,
          parse_confidence: parsed.parse_confidence,
          parse_flags: parsed.parse_flags,
          match_status: matchStatus,
        };

        const { error } = await supabase.from('ebay_sales').insert(row);
        if (!error) salesCreated++;
      }
    }

    await supabase.from('ebay_sync_log').insert({
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      status: 'success',
      orders_fetched: allOrders.length,
      sales_created: salesCreated,
      sales_matched: 0,
    });

    return {
      status: 'success',
      orders_fetched: allOrders.length,
      sales_created: salesCreated,
      sales_updated: salesUpdated,
      sales_matched: 0,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase.from('ebay_sync_log').insert({
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      status: 'error',
      orders_fetched: 0,
      sales_created: 0,
      sales_matched: 0,
      error_message: msg.slice(0, 1000),
    });
    return {
      status: 'error',
      orders_fetched: 0,
      sales_created: 0,
      sales_matched: 0,
      error_message: msg,
    };
  }
}
