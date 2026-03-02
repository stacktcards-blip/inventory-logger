import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let action: 'archive' | 'unarchive' = 'archive';
  try {
    const body = await request.json();
    if (body?.action === 'unarchive') action = 'unarchive';
  } catch {
    // No body or invalid JSON – default to archive
  }

  const { data: order, error: fetchError } = await supabase
    .schema('psa_tracker')
    .from('psa_orders')
    .select('id, delivered_at, archived_at')
    .eq('id', id)
    .single();

  if (fetchError || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  if (action === 'unarchive') {
    const { data, error } = await supabase
      .schema('psa_tracker')
      .from('psa_orders')
      .update({ archived_at: null })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data);
  }

  // Archive
  if (!order.delivered_at) {
    return NextResponse.json(
      { error: 'Only delivered orders can be archived' },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .schema('psa_tracker')
    .from('psa_orders')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
