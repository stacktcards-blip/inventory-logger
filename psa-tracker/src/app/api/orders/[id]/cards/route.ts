import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const addCardSchema = z.object({
  card_name: z.string().min(1),
  set_abbr: z.string().min(1),
  card_number: z.string().min(1),
  lang: z.string().optional().default('EN'),
  quantity: z.number().int().min(1).optional().default(1),
  declared_value: z.number().optional().nullable(),
  grade_result: z.string().optional().nullable(),
  cert_number: z.string().optional().nullable(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: orderId } = await params;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = addCardSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .schema('psa_tracker').from('psa_order_cards')
    .insert({
      order_id: orderId,
      card_name: parsed.data.card_name,
      set_abbr: parsed.data.set_abbr,
      card_number: parsed.data.card_number,
      lang: parsed.data.lang,
      quantity: parsed.data.quantity,
      declared_value: parsed.data.declared_value ?? null,
      grade_result: parsed.data.grade_result ?? null,
      cert_number: parsed.data.cert_number ?? null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
