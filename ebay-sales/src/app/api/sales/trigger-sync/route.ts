import { NextRequest } from 'next/server';
import { getAuthenticatedClient } from '@/lib/supabase/auth';
import { jsonWithCors } from '@/lib/cors';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncEbayOrders } from '@/lib/ebay/sync-orders';

export const dynamic = 'force-dynamic';

/** User-triggered sync – requires authenticated user (no CRON_SECRET needed). */
export async function POST(request: NextRequest) {
  const supabase = await getAuthenticatedClient(request);
  if (!supabase) {
    return jsonWithCors({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminClient = createAdminClient();
  const result = await syncEbayOrders(adminClient);

  return jsonWithCors(result);
}
