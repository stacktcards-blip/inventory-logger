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
    .from('ebay_sales')
    .select(`
      *,
      slabs:slab_id (id, cert, grade, set_abbr, num)
    `)
    .in('fulfillment_status', ['NOT_STARTED', 'IN_PROGRESS'])
    .order('sold_date', { ascending: true });

  if (error) {
    return jsonWithCors({ error: error.message }, { status: 500 });
  }
  return jsonWithCors(data);
}
