/**
 * Sync PSA orders from Gmail: "We Received Your Package" emails from no-reply@psacard.com.
 * Reads Order # (8-digit) from each email body and creates/updates orders.
 * Sets received_package_at from email date when updating an existing order.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchPsaEmails, RECEIVED_PACKAGE_QUERY } from '../gmail/client';
import { parseReceivedPackageEmail } from './parsers';

function parseEmailDate(dateHeader: string): string | null {
  if (!dateHeader?.trim()) return null;
  const d = new Date(dateHeader);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export type SyncGmailResult = {
  emailsFetched: number;
  ordersCreated: number;
  ordersUpdated: number;
  billingUpdated: number;
  trackingUpdated: number;
  errors: string[];
};

export async function syncOrdersFromGmail(supabase: SupabaseClient): Promise<SyncGmailResult> {
  const result: SyncGmailResult = {
    emailsFetched: 0,
    ordersCreated: 0,
    ordersUpdated: 0,
    billingUpdated: 0,
    trackingUpdated: 0,
    errors: [],
  };

  const messages = await fetchPsaEmails({
    query: RECEIVED_PACKAGE_QUERY,
    maxResults: 80,
  });
  result.emailsFetched = messages.length;

  for (const msg of messages) {
    const body = msg.bodyPlain || (msg.bodyHtml ?? '').replace(/<[^>]+>/g, ' ');
    const parsed = parseReceivedPackageEmail(body);
    if (!parsed || parsed.orderNumbers.length === 0) continue;

    for (const psaOrderNumber of parsed.orderNumbers) {
      try {
        const { data: existing } = await supabase
          .schema('psa_tracker')
          .from('psa_orders')
          .select('id, archived_at')
          .eq('psa_order_number', psaOrderNumber)
          .maybeSingle();

        if (existing?.archived_at != null) continue; // do not sync archived orders
        if (existing) {
          const receivedAt = parseEmailDate(msg.date);
          await supabase
            .schema('psa_tracker')
            .from('psa_orders')
            .update({
              received_package_at: receivedAt ?? undefined,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);
          result.ordersUpdated++;
        } else {
          await supabase.schema('psa_tracker').from('psa_orders').insert({
            psa_order_number: psaOrderNumber,
            status: 'Received',
            updated_at: new Date().toISOString(),
          });
          result.ordersCreated++;
        }
      } catch (e) {
        result.errors.push(`${psaOrderNumber}: ${(e as Error).message}`);
      }
    }
  }

  return result;
}
