/**
 * Shipment sync: poll DHL for shipped orders, update status, send Telegram notifications.
 * Phase 2: Only DHL; notification events: delivered, failure, out-for-delivery (when detectable).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getDhlProviderOrNull } from '../shipping/dhl.provider';
import { sendTelegramMessage, buildShipmentNotificationMessage } from '../notifications/telegram';
import { createHash } from 'crypto';

type ShippedOrderRow = {
  id: string;
  psa_order_number: string;
  tracking_number: string;
  carrier: string | null;
  delivered_at: string | null;
  last_ship_sync_at: string | null;
  notifications_enabled: boolean;
};

const NOTIFY_EVENTS = ['delivered', 'failure', 'out_for_delivery'] as const;

function isOutForDelivery(description: string | undefined): boolean {
  const d = (description ?? '').toLowerCase();
  return (
    d.includes('out for delivery') ||
    d.includes('being delivered') ||
    d.includes('on delivery') ||
    d.includes('with delivery')
  );
}

function messageHash(orderId: string, eventType: string, detail: string): string {
  return createHash('sha256').update(`${orderId}:${eventType}:${detail}`).digest('hex');
}

export async function syncShipment(
  supabase: SupabaseClient,
  order: ShippedOrderRow
): Promise<{ updated: boolean; notified?: boolean; error?: string; skipped?: string }> {
  const carrier = (order.carrier ?? '').toLowerCase();
  // Only DHL is supported for automatic delivery status updates. FedEx, USPS, UPS are skipped.
  if (!carrier.includes('dhl')) {
    return { updated: false, skipped: carrier ? `Carrier "${carrier}" not supported (DHL only)` : 'No carrier' };
  }

  const provider = getDhlProviderOrNull();
  if (!provider) {
    return { updated: false, error: 'DHL API key not configured (set DHL_API_KEY in .env)' };
  }

  try {
    const result = await provider.getShipmentStatus(order.tracking_number);
    if (!result) {
      // 404 or empty response: record that we tried so the UI shows something
      const { error: updateErr } = await supabase
        .schema('psa_tracker')
        .from('psa_orders')
        .update({
          last_ship_sync_at: new Date().toISOString(),
          shipping_status: 'Not found (DHL)',
          updated_at: new Date().toISOString(),
        })
        .eq('id', order.id);
      if (!updateErr) {
        return { updated: true, skipped: 'Shipment not found in DHL' };
      }
      return { updated: false, skipped: 'Shipment not found in DHL' };
    }

    const statusLabel = result.description ?? result.statusCode;
    const updates: Record<string, unknown> = {
      last_ship_sync_at: new Date().toISOString(),
      shipping_status: statusLabel,
    };

    if (result.statusCode === 'delivered' && result.deliveredAt && !order.delivered_at) {
      updates.delivered_at = result.deliveredAt;
    }

    const { error: updateError } = await supabase
      .schema('psa_tracker')
      .from('psa_orders')
      .update(updates)
      .eq('id', order.id);

    if (updateError) throw new Error(updateError.message);

    // Record shipping event
    await supabase.schema('psa_tracker').from('psa_order_events').insert({
      order_id: order.id,
      source: 'shipping',
      event_type: `ship_${result.statusCode}`,
      payload_json: {
        statusCode: result.statusCode,
        description: result.description,
        deliveredAt: result.deliveredAt,
      },
      occurred_at: new Date().toISOString(),
    });

    // Send Telegram notification if enabled and event is notify-worthy
    let notified = false;
    if (order.notifications_enabled) {
      const eventType =
        result.statusCode === 'delivered'
          ? 'delivered'
          : result.statusCode === 'failure'
            ? 'failure'
            : result.statusCode === 'transit' && isOutForDelivery(result.description)
              ? 'out_for_delivery'
              : null;

      if (eventType) {
        const detail = result.description ?? result.statusCode;
        const msg = buildShipmentNotificationMessage(
          order.psa_order_number,
          eventType.replace(/_/g, ' '),
          detail,
          process.env.APP_BASE_URL ?? 'http://localhost:3001',
          order.id
        );
        const hash = messageHash(order.id, eventType, detail);

        // Dedupe: check if we already sent this
        const { data: existing } = await supabase
          .schema('psa_tracker')
          .from('psa_notifications')
          .select('id')
          .eq('order_id', order.id)
          .eq('channel', 'telegram')
          .eq('message_hash', hash)
          .maybeSingle();

        if (!existing) {
          const botToken = process.env.TELEGRAM_BOT_TOKEN;
          const chatId = process.env.TELEGRAM_CHAT_ID;
          if (botToken && chatId) {
            const sendResult = await sendTelegramMessage({ botToken, chatId }, msg);
            if (sendResult.ok) {
              await supabase.schema('psa_tracker').from('psa_notifications').insert({
                order_id: order.id,
                channel: 'telegram',
                message_hash: hash,
                event_type: eventType,
                payload_json: { description: detail },
              });
              notified = true;
            }
          }
        }
      }
    }

    return {
      updated: Object.keys(updates).length > 1,
      notified,
    };
  } catch (e) {
    return { updated: false, error: (e as Error).message };
  }
}

export async function syncAllShipments(supabase: SupabaseClient): Promise<{
  synced: number;
  updated: number;
  notified: number;
  errors: string[];
}> {
  const provider = getDhlProviderOrNull();
  if (!provider) {
    return { synced: 0, updated: 0, notified: 0, errors: ['DHL_API_KEY not configured'] };
  }

  const { data: orders, error } = await supabase
    .schema('psa_tracker')
    .from('psa_orders')
    .select('id, psa_order_number, tracking_number, carrier, delivered_at, last_ship_sync_at, notifications_enabled, shipping_status')
    .is('archived_at', null)
    .not('tracking_number', 'is', null)
    .is('delivered_at', null); // Only sync orders not yet delivered

  if (error) {
    return { synced: 0, updated: 0, notified: 0, errors: [error.message] };
  }

  const skipStatus = (s: string | null | undefined) => {
    const lower = (s ?? '').toLowerCase();
    return lower.includes('delivered') || lower.includes('not found');
  };

  const dhlOrders = (orders ?? []).filter(
    (o) =>
      (o.carrier ?? '').toLowerCase().includes('dhl') &&
      !skipStatus(o.shipping_status)
  ) as ShippedOrderRow[];

  let updated = 0;
  let notified = 0;
  const errors: string[] = [];

  for (const order of dhlOrders) {
    const result = await syncShipment(supabase, order);
    if (result.updated) updated++;
    if (result.notified) notified++;
    if (result.error) errors.push(`${order.psa_order_number}: ${result.error}`);
  }

  return {
    synced: dhlOrders.length,
    updated,
    notified,
    errors,
  };
}
