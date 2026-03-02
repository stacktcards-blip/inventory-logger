import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncShipment } from '@/lib/sync/shipment-sync';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: order } = await supabase
    .schema('psa_tracker')
    .from('psa_orders')
    .select('id, psa_order_number, tracking_number, carrier, delivered_at, last_ship_sync_at, notifications_enabled')
    .eq('id', id)
    .single();

  if (!order || !order.tracking_number) {
    return NextResponse.json(
      { error: 'Order not found or has no tracking number' },
      { status: 404 }
    );
  }

  const adminClient = createAdminClient();
  const result = await syncShipment(adminClient, order);

  return NextResponse.json(result);
}
