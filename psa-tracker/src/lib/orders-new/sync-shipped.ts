/**
 * Sync shipping data from Gmail: "Your PSA order has shipped" from no-reply@psacard.com.
 * For each invoice order number we search these emails, parse courier, tracking number, and
 * email date, then update the matching order (carrier, courier, tracking_number, sent_at).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchPsaEmails, SHIPPED_EMAIL_QUERY } from '../gmail/client';
import { parseShippedEmail } from './parsers';

export type SyncShippedResult = {
  emailsFetched: number;
  ordersUpdated: number;
  errors: string[];
};

function parseEmailDate(dateHeader: string): string | null {
  if (!dateHeader?.trim()) return null;
  const d = new Date(dateHeader);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function syncShippedFromGmail(supabase: SupabaseClient): Promise<SyncShippedResult> {
  const result: SyncShippedResult = {
    emailsFetched: 0,
    ordersUpdated: 0,
    errors: [],
  };

  const messages = await fetchPsaEmails({
    query: SHIPPED_EMAIL_QUERY,
    maxResults: 500,
  });
  result.emailsFetched = messages.length;

  // Parse each email; keep latest by sent_at per order number
  const byOrderNo = new Map<
    string,
    { carrier: string; courierFull: string | null; trackingNumber: string; sentAt: string }
  >();
  for (const msg of messages) {
    const body = msg.bodyPlain || (msg.bodyHtml ?? '').replace(/<[^>]+>/g, ' ');
    const parsed = parseShippedEmail(msg.subject, body);
    if (!parsed) continue;
    const orderNo = parsed.orderNumber.trim();
    const sentAt = parseEmailDate(msg.date);
    if (!sentAt) continue;
    const existing = byOrderNo.get(orderNo);
    if (!existing || existing.sentAt < sentAt) {
      byOrderNo.set(orderNo, {
        carrier: parsed.carrier,
        courierFull: parsed.courierFull ?? null,
        trackingNumber: parsed.trackingNumber,
        sentAt,
      });
    }
  }

  if (byOrderNo.size === 0) return result;

  // Orders with invoice lines: order_id, psa_order_number, and invoice_order_no from lines (exclude archived)
  const { data: orders } = await supabase
    .schema('psa_tracker')
    .from('psa_orders')
    .select('id, psa_order_number')
    .is('archived_at', null);
  if (!orders?.length) return result;

  const { data: lines } = await supabase
    .schema('psa_tracker')
    .from('psa_order_invoice_lines')
    .select('order_id, invoice_order_no');
  const orderIdsByOrderNo = new Map<string, string>();
  for (const o of orders) {
    orderIdsByOrderNo.set(o.psa_order_number.trim(), o.id);
  }
  for (const line of lines ?? []) {
    const no = (line.invoice_order_no as string)?.trim();
    if (no) orderIdsByOrderNo.set(no, line.order_id as string);
  }

  for (const [orderNo, data] of byOrderNo) {
    const orderId = orderIdsByOrderNo.get(orderNo);
    if (!orderId) continue;
    const updates = {
      carrier: data.carrier,
      courier: data.courierFull,
      tracking_number: data.trackingNumber,
      sent_at: data.sentAt,
      shipped_at: data.sentAt,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .schema('psa_tracker')
      .from('psa_orders')
      .update(updates)
      .eq('id', orderId);
    if (error) {
      result.errors.push(`${orderNo}: ${error.message}`);
      continue;
    }
    result.ordersUpdated++;
  }

  return result;
}
