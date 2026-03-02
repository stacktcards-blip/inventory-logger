import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.schema('psa_tracker').from('psa_orders').select('id').limit(1);
    return NextResponse.json({
      status: 'ok',
      database: error ? 'error' : 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      { status: 'error', database: 'unreachable', timestamp: new Date().toISOString() },
      { status: 503 }
    );
  }
}
