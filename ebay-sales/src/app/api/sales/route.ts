import { NextRequest } from 'next/server';
import { getAuthenticatedClient } from '@/lib/supabase/auth';
import { jsonWithCors } from '@/lib/cors';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const supabase = await getAuthenticatedClient(request);
  if (!supabase) {
    return jsonWithCors({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const matchStatus = searchParams.get('match_status');
  const fulfillmentStatus = searchParams.get('fulfillment_status');
  const dateFrom = searchParams.get('date_from');
  const dateTo = searchParams.get('date_to');

  let query = supabase
    .from('ebay_sales')
    .select('*')
    .order('sold_date', { ascending: false });

  if (matchStatus) query = query.eq('match_status', matchStatus);
  if (fulfillmentStatus) query = query.eq('fulfillment_status', fulfillmentStatus);
  if (dateFrom) query = query.gte('sold_date', dateFrom);
  if (dateTo) query = query.lte('sold_date', dateTo);

  const { data, error } = await query;

  if (error) {
    return jsonWithCors({ error: error.message }, { status: 500 });
  }
  return jsonWithCors(data);
}
