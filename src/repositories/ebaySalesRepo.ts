import { supabase } from './supabaseClient.js';
import type { EbayFulfillmentOrder } from '../services/ebayFulfillmentClient.js';

export type EbaySalesSyncResult = {
  ordersFetched: number;
  lineItemsUpserted: number;
};

const toNumber = (value: string | number | undefined | null): number | null => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const soldDate = (order: EbayFulfillmentOrder): string | null => {
  const value = order.creationDate ?? order.lastModifiedDate;
  return value ? value.slice(0, 10) : null;
};

const fulfillmentStatus = (value: string | undefined): string | null => {
  if (value === 'NOT_STARTED' || value === 'IN_PROGRESS' || value === 'FULFILLED') return value;
  return null;
};

export async function logEbaySyncStart() {
  const { data, error } = await supabase
    .from('ebay_sync_log')
    .insert({ status: 'running' })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to create eBay sync log: ${error.message}`);
  }

  return data.id as string;
}

export async function completeEbaySyncLog(
  id: string,
  status: 'success' | 'failed',
  result: Partial<EbaySalesSyncResult> & { errorMessage?: string }
) {
  const { error } = await supabase
    .from('ebay_sync_log')
    .update({
      completed_at: new Date().toISOString(),
      status,
      orders_fetched: result.ordersFetched ?? 0,
      sales_created: result.lineItemsUpserted ?? 0,
      sales_matched: 0,
      error_message: result.errorMessage ?? null,
    })
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to update eBay sync log: ${error.message}`);
  }
}

export async function upsertEbaySalesOrders(orders: EbayFulfillmentOrder[]): Promise<EbaySalesSyncResult> {
  const rows = orders.flatMap((order) => {
    const lineItems = order.lineItems ?? [];
    return lineItems.map((lineItem, index) => {
      const lineItemId = lineItem.lineItemId ?? `${order.orderId}:${lineItem.legacyItemId ?? lineItem.itemId ?? index}`;
      const lineCost = lineItem.lineItemCost ?? lineItem.total;
      const shippingCost = lineItem.deliveryCost?.shippingCost;
      return {
        ebay_order_id: order.orderId,
        ebay_line_item_id: lineItemId,
        ebay_item_id: lineItem.legacyItemId ?? lineItem.itemId ?? null,
        ebay_sku: lineItem.sku ?? null,
        title: lineItem.title ?? null,
        quantity: lineItem.quantity ?? 1,
        sale_price: toNumber(lineCost?.value),
        currency: lineCost?.currency ?? order.pricingSummary?.total?.currency ?? 'AUD',
        sold_date: soldDate(order),
        buyer_username: order.buyer?.username ?? null,
        fulfillment_status: fulfillmentStatus(order.orderFulfillmentStatus),
        image_url: lineItem.image?.imageUrl ?? null,
        match_status: 'PENDING',
        raw_response: {
          order,
          lineItem,
          legacyOrderId: order.legacyOrderId ?? null,
          orderPaymentStatus: order.orderPaymentStatus ?? null,
          orderTotal: order.pricingSummary?.total ?? null,
          shippingCost: shippingCost ?? null,
        },
        updated_at: new Date().toISOString(),
      };
    });
  });

  if (rows.length === 0) {
    return { ordersFetched: orders.length, lineItemsUpserted: 0 };
  }

  const { error } = await supabase
    .from('ebay_sales')
    .upsert(rows, { onConflict: 'ebay_line_item_id' });

  if (error) {
    throw new Error(`Failed to upsert eBay sales: ${error.message}`);
  }

  return { ordersFetched: orders.length, lineItemsUpserted: rows.length };
}
