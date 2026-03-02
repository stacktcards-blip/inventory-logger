import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncAllOrders } from '@/lib/sync/psa-sync';
import { syncAllShipments } from '@/lib/sync/shipment-sync';

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

  // Phase 1: PSA order status sync
  const psaResult = await syncAllOrders(adminClient);

  // Phase 2: DHL shipment tracking (shipped orders only)
  const shipResult = await syncAllShipments(adminClient);

  return NextResponse.json({
    synced: psaResult.synced,
    updated: psaResult.updated,
    errors: [...psaResult.errors, ...shipResult.errors],
    shipments: {
      synced: shipResult.synced,
      updated: shipResult.updated,
      notified: shipResult.notified,
    },
  });
}
