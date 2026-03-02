/**
 * Telegram notifier. Phase 2: real implementation.
 * MVP: stub that logs instead of sending.
 */

export type TelegramNotifierConfig = {
  botToken: string;
  chatId: string;
};

export async function sendTelegramMessage(
  config: TelegramNotifierConfig,
  message: string
): Promise<{ ok: boolean; error?: string }> {
  if (!config.botToken || !config.chatId) {
    return { ok: false, error: 'Telegram not configured' };
  }

  try {
    const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    const data = (await res.json()) as { ok?: boolean; description?: string };
    if (!data.ok) {
      return { ok: false, error: data.description ?? 'Unknown error' };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Build notification message for shipment event. Dedupe via message_hash. */
export function buildShipmentNotificationMessage(
  orderNumber: string,
  eventType: string,
  detail: string,
  appBaseUrl: string,
  orderId?: string
): string {
  const link = orderId
    ? `${appBaseUrl.replace(/\/$/, '')}/orders/${orderId}`
    : `${appBaseUrl}/orders?highlight=${orderNumber}`;
  return `📦 <b>PSA Order ${orderNumber}</b>\n\n${eventType}: ${detail}\n\n<a href="${link}">View order</a>`;
}
