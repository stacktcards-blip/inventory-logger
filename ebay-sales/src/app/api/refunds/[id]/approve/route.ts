import { NextRequest } from 'next/server';
import { getAuthenticatedClient } from '@/lib/supabase/auth';
import { jsonWithCors } from '@/lib/cors';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await getAuthenticatedClient(request);
  if (!supabase) {
    return jsonWithCors({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const { data: refund, error: fetchError } = await supabase
    .from('ebay_refund_requests')
    .select('id, slab_id, ebay_sale_id')
    .eq('id', id)
    .eq('status', 'PENDING')
    .single();

  if (fetchError || !refund) {
    return jsonWithCors({ error: 'Refund request not found or already resolved' }, { status: 404 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  const resolvedBy = user?.email ?? 'unknown';

  const { error: updateSlabError } = await supabase
    .from('slabs')
    .update({
      sold_date: null,
      sale_price: null,
      sale_currency: null,
      ebay_sale_id: null,
    })
    .eq('id', refund.slab_id);

  if (updateSlabError) {
    return jsonWithCors({ error: updateSlabError.message }, { status: 500 });
  }

  const { error: updateRefundError } = await supabase
    .from('ebay_refund_requests')
    .update({
      status: 'APPROVED',
      resolved_at: new Date().toISOString(),
      resolved_by: resolvedBy,
    })
    .eq('id', id);

  if (updateRefundError) {
    return jsonWithCors({ error: updateRefundError.message }, { status: 500 });
  }

  return jsonWithCors({ ok: true });
}
