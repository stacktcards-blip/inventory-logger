import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { syncOrder } from '@/lib/sync/psa-sync';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: order } = await supabase
    .schema('psa_tracker').from('psa_orders')
    .select('*')
    .eq('id', id)
    .single();

  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  try {
    const adminClient = (await import('@/lib/supabase/admin')).createAdminClient();
    const result = await syncOrder(adminClient, order);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[sync]', err);
    const message = err instanceof Error ? err.message : 'Sync failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
