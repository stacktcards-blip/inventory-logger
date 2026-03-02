import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncEbayOrders } from '@/lib/ebay/sync-orders';
import { jsonWithCors } from '@/lib/cors';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret =
    authHeader?.replace(/^Bearer\s+/i, '') ??
    request.nextUrl.searchParams.get('secret');

  if (!cronSecret || providedSecret !== cronSecret) {
    return jsonWithCors({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminClient = createAdminClient();
  const result = await syncEbayOrders(adminClient);

  return jsonWithCors(result);
}
