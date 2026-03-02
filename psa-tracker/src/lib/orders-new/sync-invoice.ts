/**
 * Sync invoice data from Gmail: "PSA Invoices" emails from info@psacard.com.
 * Parses table (Order No., Submission No., Order Amount, Payment Amount, Balance Due)
 * and upserts into psa_order_invoice_lines; updates order billed_amount_usd from invoice totals.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchPsaEmails, PSA_INVOICES_QUERY } from '../gmail/client';
import { parseInvoiceEmail } from './parsers';

export type SyncInvoiceResult = {
  emailsFetched: number;
  linesUpserted: number;
  ordersUpdated: number;
  errors: string[];
};

export async function syncInvoicesFromGmail(supabase: SupabaseClient): Promise<SyncInvoiceResult> {
  const result: SyncInvoiceResult = {
    emailsFetched: 0,
    linesUpserted: 0,
    ordersUpdated: 0,
    errors: [],
  };

  const messages = await fetchPsaEmails({
    query: PSA_INVOICES_QUERY,
    maxResults: 50,
  });
  result.emailsFetched = messages.length;

  let logRowCount = 0;
  for (const msg of messages) {
    const bodyForTable = msg.bodyHtml ?? msg.bodyPlain ?? '';
    const rows = parseInvoiceEmail(bodyForTable);
    // #region agent log
    if (messages.indexOf(msg) < 2) {
      fetch('http://127.0.0.1:7242/ingest/f8f0603f-2b36-4528-913d-8ad472135704', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'sync-invoice.ts:parse', message: 'invoice parse', data: { emailIndex: messages.indexOf(msg), bodyLen: bodyForTable.length, rowsLength: rows.length, firstRow: rows[0] ?? null, snippet: rows.length === 0 ? bodyForTable.slice(0, 600) : undefined }, timestamp: Date.now(), hypothesisId: 'H1' }) }).catch(() => {});
    }
    // #endregion
    if (rows.length === 0) continue;

    for (const row of rows) {
      try {
        // Find orders by DB submission_number = invoice Submission No. Fallback: psa_order_number = invoice Submission No. when submission_number is null (e.g. Gmail-created orders). Then pick the order whose psa_order_number matches the invoice Order No. when there are multiple.
        let ordersWithSubmission: { id: string; psa_order_number: string }[] | null = null;
        let orderErr: { message: string } | null = null;
        const { data: bySubmission, error: err1 } = await supabase
          .schema('psa_tracker')
          .from('psa_orders')
          .select('id, psa_order_number')
          .eq('submission_number', row.submissionNo.trim())
          .is('archived_at', null);
        if (err1) orderErr = err1;
        else ordersWithSubmission = bySubmission;

        if ((ordersWithSubmission?.length ?? 0) === 0) {
          const { data: byPsaOrder, error: err2 } = await supabase
            .schema('psa_tracker')
            .from('psa_orders')
            .select('id, psa_order_number')
            .eq('psa_order_number', row.submissionNo.trim())
            .is('archived_at', null)
            .limit(1);
          if (!err2 && byPsaOrder?.length) ordersWithSubmission = byPsaOrder;
        }

        // #region agent log
        if (logRowCount < 4) {
          logRowCount++;
          const count = ordersWithSubmission?.length ?? 0;
          fetch('http://127.0.0.1:7242/ingest/f8f0603f-2b36-4528-913d-8ad472135704', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'sync-invoice.ts:lookup', message: 'order lookup', data: { orderNo: row.orderNo.trim(), submissionNo: row.submissionNo.trim(), count, found: count > 0, orderErr: orderErr?.message ?? null }, timestamp: Date.now(), hypothesisId: 'H2' }) }).catch(() => {});
          if (count === 0) {
            const byOrderNo = await supabase.schema('psa_tracker').from('psa_orders').select('id, psa_order_number, submission_number').eq('psa_order_number', row.orderNo.trim()).maybeSingle();
            const bySubmissionNo = await supabase.schema('psa_tracker').from('psa_orders').select('id, psa_order_number, submission_number').eq('psa_order_number', row.submissionNo.trim()).maybeSingle();
            fetch('http://127.0.0.1:7242/ingest/f8f0603f-2b36-4528-913d-8ad472135704', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'sync-invoice.ts:lookupZero', message: 'DB sample when lookup by submission_number found 0', data: { orderNo: row.orderNo.trim(), submissionNo: row.submissionNo.trim(), orderByOrderNo: byOrderNo.data ?? null, orderBySubmissionNo: bySubmissionNo.data ?? null }, timestamp: Date.now(), hypothesisId: 'H3' }) }).catch(() => {});
          }
        }
        // #endregion

        if (orderErr) {
          result.errors.push(`${row.orderNo}: ${orderErr.message}`);
          continue;
        }
        const candidates = ordersWithSubmission ?? [];
        const order = candidates.find((o) => o.psa_order_number === row.orderNo.trim()) ?? candidates[0] ?? null;
        if (!order) continue; // no matching order in DB (no order with this submission_number)

        const { error: upsertErr } = await supabase
          .schema('psa_tracker')
          .from('psa_order_invoice_lines')
          .upsert(
            {
              order_id: order.id,
              submission_number: row.submissionNo.trim(),
              invoice_order_no: row.orderNo.trim(),
              order_amount: row.orderAmount,
              payment_amount: row.paymentAmount,
              balance_due: row.balanceDue,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'order_id,invoice_order_no' }
          );

        if (upsertErr) {
          result.errors.push(`${row.orderNo}/${row.submissionNo}: ${upsertErr.message}`);
          continue;
        }
        // Remove backfilled placeholder line (invoice_order_no = submission_number) so we don't double-count
        if (row.submissionNo.trim() !== row.orderNo.trim()) {
          await supabase
            .schema('psa_tracker')
            .from('psa_order_invoice_lines')
            .delete()
            .eq('order_id', order.id)
            .eq('invoice_order_no', row.submissionNo.trim());
        }
        result.linesUpserted++;
      } catch (e) {
        result.errors.push(`${row.orderNo}: ${(e as Error).message}`);
      }
    }
  }

  // Update billed_amount_usd on orders that have invoice lines (sum of order_amount per order)
  const { data: ordersWithLines } = await supabase
    .schema('psa_tracker')
    .from('psa_order_invoice_lines')
    .select('order_id, order_amount');
  if (ordersWithLines?.length) {
    const sumByOrderId = new Map<string, number>();
    for (const line of ordersWithLines) {
      const id = line.order_id as string;
      const amt = line.order_amount != null ? Number(line.order_amount) : 0;
      sumByOrderId.set(id, (sumByOrderId.get(id) ?? 0) + amt);
    }
    for (const [orderId, total] of sumByOrderId) {
      const { error } = await supabase
        .schema('psa_tracker')
        .from('psa_orders')
        .update({ billed_amount_usd: total, updated_at: new Date().toISOString() })
        .eq('id', orderId)
        .is('archived_at', null);
      if (!error) result.ordersUpdated++;
    }
  }

  return result;
}
