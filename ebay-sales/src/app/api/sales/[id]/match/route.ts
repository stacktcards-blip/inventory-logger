import { NextRequest } from 'next/server';
import { getAuthenticatedClient } from '@/lib/supabase/auth';
import { jsonWithCors } from '@/lib/cors';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const matchSchema = z.object({
  slab_id: z.string().uuid(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await getAuthenticatedClient(request);
  if (!supabase) {
    return jsonWithCors({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: sale_id } = await params;
  const body = await request.json();
  const parsed = matchSchema.safeParse(body);
  if (!parsed.success) {
    return jsonWithCors(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { slab_id } = parsed.data;

  const { data: slab, error: slabError } = await supabase
    .from('slabs_dashboard')
    .select('id, cert, sales_status')
    .eq('id', slab_id)
    .single();

  if (slabError || !slab) {
    return jsonWithCors({ error: 'Slab not found' }, { status: 404 });
  }

  if (slab.sales_status !== 'LISTED') {
    return jsonWithCors(
      { error: 'Slab is not LISTED – cannot match' },
      { status: 400 }
    );
  }

  const { data: sale, error: saleError } = await supabase
    .from('ebay_sales')
    .select('id, sale_price, currency, sold_date')
    .eq('id', sale_id)
    .single();

  if (saleError || !sale) {
    return jsonWithCors({ error: 'Sale not found' }, { status: 404 });
  }

  const { error: updateSaleError } = await supabase
    .from('ebay_sales')
    .update({
      slab_id: slab_id,
      match_status: 'MATCHED',
      match_method: 'MANUAL',
      matched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', sale_id);

  if (updateSaleError) {
    return jsonWithCors({ error: updateSaleError.message }, { status: 500 });
  }

  const { error: updateSlabError } = await supabase
    .from('slabs')
    .update({
      sold_date: sale.sold_date,
      sale_price: sale.sale_price,
      sale_currency: sale.currency ?? 'AUD',
      ebay_sale_id: sale_id,
    })
    .eq('id', slab_id);

  if (updateSlabError) {
    return jsonWithCors({ error: updateSlabError.message }, { status: 500 });
  }

  return jsonWithCors({
    matched: true,
    slab: { id: slab.id, cert: slab.cert },
  });
}
