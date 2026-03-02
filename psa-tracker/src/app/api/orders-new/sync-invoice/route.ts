import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncInvoicesFromGmail } from '@/lib/orders-new/sync-invoice';
import { isGmailConfigured } from '@/lib/gmail/client';

export async function POST() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isGmailConfigured()) {
    return NextResponse.json(
      {
        error: 'Gmail not configured. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN in .env.local.',
      },
      { status: 503 }
    );
  }

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/f8f0603f-2b36-4528-913d-8ad472135704', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'sync-invoice/route.ts:POST', message: 'Sync to invoice started', data: {}, timestamp: Date.now(), hypothesisId: 'H4' }) }).catch(() => {});
  // #endregion
  try {
    const adminClient = createAdminClient();
    const result = await syncInvoicesFromGmail(adminClient);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/f8f0603f-2b36-4528-913d-8ad472135704', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'sync-invoice/route.ts:result', message: 'Sync to invoice completed', data: { emailsFetched: result.emailsFetched, linesUpserted: result.linesUpserted, ordersUpdated: result.ordersUpdated, errorsLen: result.errors.length, firstError: result.errors[0] ?? null }, timestamp: Date.now(), hypothesisId: 'H4' }) }).catch(() => {});
    // #endregion
    return NextResponse.json(result);
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
