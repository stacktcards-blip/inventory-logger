import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const updateOrderSchema = z.object({
  psa_order_number: z.string().min(1).optional(),
  status: z.string().optional(),
  status_detail: z.string().optional().nullable(),
  tracking_number: z.string().optional().nullable(),
  carrier: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  notifications_enabled: z.boolean().optional(),
  archived_at: z.string().datetime().nullable().optional(),
});

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
    .schema('psa_tracker').from('psa_orders')
    .select('*')
    .eq('id', id)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  const { data: cards } = await supabase
    .schema('psa_tracker').from('psa_order_cards')
    .select('*')
    .eq('order_id', id)
    .order('created_at');

  const { data: invoiceLines } = await supabase
    .schema('psa_tracker').from('psa_order_invoice_lines')
    .select('submission_number, invoice_order_no, order_amount, payment_amount, balance_due')
    .eq('order_id', id)
    .order('invoice_order_no');

  return NextResponse.json({
    ...order,
    cards: cards ?? [],
    invoice_lines: invoiceLines ?? [],
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = updateOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.psa_order_number !== undefined) updates.psa_order_number = parsed.data.psa_order_number;
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;
  if (parsed.data.status_detail !== undefined) updates.status_detail = parsed.data.status_detail;
  if (parsed.data.tracking_number !== undefined) updates.tracking_number = parsed.data.tracking_number;
  if (parsed.data.carrier !== undefined) updates.carrier = parsed.data.carrier;
  if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes;
  if (parsed.data.notifications_enabled !== undefined) updates.notifications_enabled = parsed.data.notifications_enabled;
  if (parsed.data.archived_at !== undefined) updates.archived_at = parsed.data.archived_at;

  const { data, error } = await supabase
    .schema('psa_tracker').from('psa_orders')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
