import { NextRequest } from 'next/server';
import { getAuthenticatedClient } from '@/lib/supabase/auth';
import { jsonWithCors } from '@/lib/cors';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const supabase = await getAuthenticatedClient(request);
  if (!supabase) {
    return jsonWithCors({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('ebay_refund_requests')
    .select('*')
    .eq('status', 'PENDING')
    .order('requested_at', { ascending: false });

  if (error) {
    return jsonWithCors({ error: error.message }, { status: 500 });
  }
  return jsonWithCors(data ?? []);
}
