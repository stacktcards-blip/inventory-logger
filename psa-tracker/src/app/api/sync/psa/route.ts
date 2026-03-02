import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncAllOrders } from '@/lib/sync/psa-sync';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = authHeader?.replace(/^Bearer\s+/i, '') ?? request.nextUrl.searchParams.get('secret');

  const isAuthenticated = !!session;
  const isCronAuthorized = cronSecret && providedSecret === cronSecret;

  if (!isAuthenticated && !isCronAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminClient = createAdminClient();
  const result = await syncAllOrders(adminClient);

  return NextResponse.json({
    synced: result.synced,
    updated: result.updated,
    errors: result.errors,
  });
}
