import { NextRequest } from 'next/server';
import { getAuthenticatedClient } from '@/lib/supabase/auth';
import { jsonWithCors } from '@/lib/cors';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await getAuthenticatedClient(request);
  if (!supabase) {
    return jsonWithCors({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const { data: sale, error: saleError } = await supabase
    .from('ebay_sales')
    .select('*')
    .eq('id', id)
    .single();

  if (saleError || !sale) {
    return jsonWithCors({ error: 'Not found' }, { status: 404 });
  }

  if (!sale.set_abbr || !sale.num || !sale.grade || !sale.grading_company) {
    return jsonWithCors({
      ...sale,
      suggested_slabs: [],
    });
  }

  const lang = sale.lang ?? 'ENG';
  const { data: suggestedSlabs } = await supabase
    .from('slabs_dashboard')
    .select('id, cert, grade, set_abbr, num, card_name')
    .eq('set_abbr', sale.set_abbr)
    .eq('num', sale.num)
    .eq('lang', lang)
    .eq('grade', sale.grade)
    .eq('grading_company', sale.grading_company)
    .eq('sales_status', 'LISTED')
    .limit(10);

  return jsonWithCors({
    ...sale,
    suggested_slabs: suggestedSlabs ?? [],
  });
}
