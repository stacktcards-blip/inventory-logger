import { NextRequest } from 'next/server';
import { getAuthenticatedClient } from '@/lib/supabase/auth';
import { jsonWithCors } from '@/lib/cors';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const matchSchema = z.object({
  cert: z.string().min(1),
  sale_id: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  const supabase = await getAuthenticatedClient(request);
  if (!supabase) {
    return jsonWithCors({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = matchSchema.safeParse(body);
  if (!parsed.success) {
    return jsonWithCors(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { cert, sale_id } = parsed.data;

  const { data: slabs, error: slabsError } = await supabase
    .from('slabs_dashboard')
    .select('id, cert, grade, set_abbr, num')
    .eq('cert', cert)
    .eq('sales_status', 'LISTED');

  if (slabsError) {
    return jsonWithCors({ error: slabsError.message }, { status: 500 });
  }

  const candidates = slabs ?? [];
  if (candidates.length === 0) {
    return jsonWithCors({
      matched: false,
      message: 'No listed slab found with this cert',
      candidates: [],
    });
  }

  if (candidates.length > 1) {
    return jsonWithCors({
      matched: false,
      message: 'Multiple slabs match – select manually',
      candidates,
    });
  }

  const slab = candidates[0]!;

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
      slab_id: slab.id,
      match_status: 'MATCHED',
      match_method: 'CERT_SCAN',
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
    .eq('id', slab.id);

  if (updateSlabError) {
    return jsonWithCors({ error: updateSlabError.message }, { status: 500 });
  }

  return jsonWithCors({
    matched: true,
    slab: { id: slab.id, cert: slab.cert, grade: slab.grade, set_abbr: slab.set_abbr, num: slab.num },
  });
}
