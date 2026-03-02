import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncShippedFromGmail } from '@/lib/orders-new/sync-shipped';
import { isGmailConfigured } from '@/lib/gmail/client';

export async function POST() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isGmailConfigured()) {
    return NextResponse.json(
      {
        error: 'Gmail not configured. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN in .env.local.',
      },
      { status: 503 }
    );
  }

  try {
    const adminClient = createAdminClient();
    const result = await syncShippedFromGmail(adminClient);
    return NextResponse.json(result);
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
