import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncOrdersFromGmail } from '@/lib/orders-new/sync-gmail';
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
    const result = await syncOrdersFromGmail(adminClient);
    return NextResponse.json(result);
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    const gmailApiDisabled = /Gmail API has not been used|is disabled|Enable it by visiting/i.test(msg);
    const enableUrl = msg.match(/https:\/\/[^\s]+/)?.[0] ?? 'https://console.developers.google.com/apis/api/gmail.googleapis.com/overview';
    if (gmailApiDisabled) {
      return NextResponse.json(
        {
          error: `Gmail API is not enabled for your Google Cloud project. Enable it here: ${enableUrl} — then retry (wait a few minutes if just enabled).`,
          enableUrl,
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: msg },
      { status: 500 }
    );
  }
}
