import type { SupabaseClient } from '@supabase/supabase-js';
import { getPsaProvider } from './psa.provider';
import { extractTrackingFromText } from '../tracking/email-parser';

type PsaOrderRow = {
  id: string;
  psa_order_number: string;
  submission_number: string | null;
  status: string;
  status_detail: string | null;
  service_level: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  tracking_number: string | null;
  carrier: string | null;
  last_psa_sync_at: string | null;
};

export async function syncOrder(
  supabase: SupabaseClient,
  order: PsaOrderRow
): Promise<{ updated: boolean; message?: string; status?: string; tracking?: string }> {
  const provider = getPsaProvider();
  const psaStatus = await provider.getOrderStatus(order.psa_order_number);

  if (!psaStatus) {
    return {
      updated: false,
      message:
        'Order not found in PSA. Try the submission number instead of order number, or check the number format.',
    };
  }

  const updates: Partial<PsaOrderRow> = {
    status: psaStatus.status,
    status_detail: psaStatus.statusDetail ?? null,
    service_level: psaStatus.serviceLevel ?? null,
    submission_number: psaStatus.submissionNumber ?? null,
    last_psa_sync_at: new Date().toISOString(),
  };

  if (psaStatus.shippedAt) {
    updates.shipped_at = psaStatus.shippedAt;
  } else if (psaStatus.status === 'Shipped' && !order.shipped_at) {
    updates.shipped_at = new Date().toISOString();
  }
  if (psaStatus.deliveredAt) {
    updates.delivered_at = psaStatus.deliveredAt;
  }

  // Prefer PSA-provided tracking; otherwise keep existing manual override
  if (psaStatus.trackingNumber) {
    updates.tracking_number = psaStatus.trackingNumber;
    updates.carrier = psaStatus.carrier ?? null;
  }

  const statusChanged = order.status !== psaStatus.status;
  const trackingAdded = !order.tracking_number && psaStatus.trackingNumber;

  const { error } = await supabase
    .schema('psa_tracker').from('psa_orders')
    .update(updates)
    .eq('id', order.id);

  if (error) {
    throw new Error(error.message);
  }

  if (statusChanged) {
    await supabase.schema('psa_tracker').from('psa_order_events').insert({
      order_id: order.id,
      source: 'psa',
      event_type: 'status_change',
      payload_json: { from: order.status, to: psaStatus.status },
      occurred_at: new Date().toISOString(),
    });
  }

  if (trackingAdded && psaStatus.trackingNumber) {
    await supabase.schema('psa_tracker').from('psa_order_events').insert({
      order_id: order.id,
      source: 'psa',
      event_type: 'tracking_added',
      payload_json: { tracking_number: psaStatus.trackingNumber, carrier: psaStatus.carrier },
      occurred_at: new Date().toISOString(),
    });
  }

  return {
    updated: true,
    status: psaStatus.status,
    tracking: psaStatus.trackingNumber ?? undefined,
  };
}

export async function syncAllOrders(supabase: SupabaseClient): Promise<{
  synced: number;
  updated: number;
  errors: string[];
}> {
  const { data: orders, error } = await supabase
    .schema('psa_tracker').from('psa_orders')
    .select('id, psa_order_number, submission_number, status, status_detail, service_level, shipped_at, delivered_at, tracking_number, carrier, last_psa_sync_at')
    .is('archived_at', null);

  if (error) {
    throw new Error(error.message);
  }

  let updated = 0;
  const errors: string[] = [];

  for (const order of orders ?? []) {
    try {
      const result = await syncOrder(supabase, order);
      if (result.updated) updated++;
    } catch (e) {
      errors.push(`${order.psa_order_number}: ${(e as Error).message}`);
    }
  }

  return {
    synced: orders?.length ?? 0,
    updated,
    errors,
  };
}

/** Ingest raw email text and extract tracking; update order if match found. */
export async function ingestEmailForTracking(
  supabase: SupabaseClient,
  emailBody: string,
  psaOrderNumber?: string
): Promise<{ orderId?: string; tracking?: string; extracted: string[] }> {
  const extracted = extractTrackingFromText(emailBody);
  if (extracted.length === 0) {
    return { extracted: [] };
  }

  let orderId: string | undefined;
  if (psaOrderNumber) {
    const { data } = await supabase
      .schema('psa_tracker').from('psa_orders')
      .select('id, tracking_number')
      .eq('psa_order_number', psaOrderNumber)
      .single();
    if (data && !data.tracking_number) {
      orderId = data.id;
      await supabase
        .schema('psa_tracker').from('psa_orders')
        .update({
          tracking_number: extracted[0],
          carrier: 'DHL',
          updated_at: new Date().toISOString(),
        })
        .eq('id', data.id);
      await supabase.schema('psa_tracker').from('psa_order_events').insert({
        order_id: data.id,
        source: 'manual',
        event_type: 'tracking_added',
        payload_json: { tracking_number: extracted[0], source: 'email_parser' },
        occurred_at: new Date().toISOString(),
      });
    }
  }

  return { orderId, tracking: extracted[0], extracted };
}
