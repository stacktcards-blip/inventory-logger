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

  const { data: { user } } = await supabase.auth.getUser();
  const resolvedBy = user?.email ?? 'unknown';

  const { error } = await supabase
    .from('ebay_refund_requests')
    .update({
      status: 'REJECTED',
      resolved_at: new Date().toISOString(),
      resolved_by: resolvedBy,
    })
    .eq('id', id)
    .eq('status', 'PENDING');

  if (error) {
    return jsonWithCors({ error: error.message }, { status: 500 });
  }

  return jsonWithCors({ ok: true });
}
