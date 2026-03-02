import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { findSlabMatches } from '@/lib/slabs/slabs.adapter';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: order, error: orderError } = await supabase
    .schema('psa_tracker')
    .from('psa_orders')
    .select('id, psa_order_number')
    .eq('id', id)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  const { data: cards } = await supabase
    .schema('psa_tracker')
    .from('psa_order_cards')
    .select('id, card_name, set_abbr, card_number, lang, cert_number')
    .eq('order_id', id);

  const matches = await findSlabMatches({
    orderId: order.id,
    psaOrderNumber: order.psa_order_number,
    cards: (cards ?? []).map((c) => ({
      id: c.id,
      card_name: c.card_name,
      set_abbr: c.set_abbr,
      card_number: c.card_number,
      lang: c.lang ?? 'EN',
      cert_number: c.cert_number,
    })),
  });

  return NextResponse.json(matches);
}
