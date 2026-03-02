import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const createOrderSchema = z.object({
  psa_order_number: z.string().min(1),
  status: z.string().optional().default('unknown'),
  notes: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const shipped = searchParams.get('shipped'); // 'true' | 'false' | null
  const delivered = searchParams.get('delivered');
  const exception = searchParams.get('exception');
  const archived = searchParams.get('archived'); // 'true' = archived only, 'false' = active only, 'all' = both
  const shippingStatus = searchParams.get('shippingStatus'); // 'delivered' | 'not_found' | 'transit' | 'none' | null
  const includeInvoiceLines = searchParams.get('includeInvoiceLines') === 'true';

  let query = supabase
    .schema('psa_tracker').from('psa_orders')
    .select('*')
    .order('created_at', { ascending: false });

  if (archived === 'true') {
    query = query.not('archived_at', 'is', null);
  } else if (archived !== 'all') {
    query = query.is('archived_at', null);
  }
  if (status) query = query.eq('status', status);
  if (shipped === 'true') query = query.not('shipped_at', 'is', null);
  if (shipped === 'false') query = query.is('shipped_at', null);
  if (delivered === 'true') query = query.not('delivered_at', 'is', null);
  if (exception === 'true') query = query.eq('status', 'exception');
  if (shippingStatus === 'delivered') query = query.ilike('shipping_status', '%delivered%');
  else if (shippingStatus === 'not_found') query = query.ilike('shipping_status', '%not found%');
  else if (shippingStatus === 'transit') query = query.ilike('shipping_status', '%transit%');
  else if (shippingStatus === 'none') query = query.is('shipping_status', null);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (includeInvoiceLines && data?.length) {
    const orderIds = data.map((o: { id: string }) => o.id);
    const { data: lines } = await supabase
      .schema('psa_tracker')
      .from('psa_order_invoice_lines')
      .select('order_id, submission_number, invoice_order_no, order_amount, payment_amount, balance_due')
      .in('order_id', orderIds);
    const byOrderId = new Map<string, Array<{ submission_number: string; invoice_order_no: string; order_amount: number | null; payment_amount: number | null; balance_due: number | null }>>();
    for (const line of lines ?? []) {
      const id = line.order_id as string;
      if (!byOrderId.has(id)) byOrderId.set(id, []);
      byOrderId.get(id)!.push({
        submission_number: line.submission_number as string,
        invoice_order_no: line.invoice_order_no as string,
        order_amount: line.order_amount != null ? Number(line.order_amount) : null,
        payment_amount: line.payment_amount != null ? Number(line.payment_amount) : null,
        balance_due: line.balance_due != null ? Number(line.balance_due) : null,
      });
    }
    const withLines = data.map((o: { id: string }) => ({
      ...o,
      invoice_lines: byOrderId.get(o.id) ?? [],
    }));
    return NextResponse.json(withLines);
  }

  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .schema('psa_tracker').from('psa_orders')
    .insert({
      psa_order_number: parsed.data.psa_order_number,
      status: parsed.data.status,
      notes: parsed.data.notes ?? null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'Order number already exists' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
