import { NextRequest } from 'next/server';
import { jsonWithCors } from '@/lib/cors';

const SANDBOX_TOKEN_URL = 'https://api.sandbox.ebay.com/identity/v1/oauth2/token';
const PRODUCTION_TOKEN_URL = 'https://api.ebay.com/identity/v1/oauth2/token';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const redirectUri = searchParams.get('redirect_uri');

  if (!code || !redirectUri) {
    return jsonWithCors({ error: 'Missing code or redirect_uri' }, { status: 400 });
  }

  const appId = process.env.EBAY_APP_ID;
  const certId = process.env.EBAY_CERT_ID;
  const sandbox = process.env.EBAY_ENVIRONMENT === 'sandbox' || process.env.NEXT_PUBLIC_EBAY_SANDBOX === 'true';

  if (!appId || !certId) {
    return jsonWithCors({ error: 'Missing EBAY_APP_ID or EBAY_CERT_ID' }, { status: 500 });
  }

  const tokenUrl = sandbox ? SANDBOX_TOKEN_URL : PRODUCTION_TOKEN_URL;
  const credentials = Buffer.from(`${appId}:${certId}`).toString('base64');

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: redirectUri,
  });

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: body.toString(),
  });

  const data = (await res.json()) as { refresh_token?: string; access_token?: string; error?: string; error_description?: string };

  if (!res.ok) {
    const msg = data.error_description || data.error || `HTTP ${res.status}`;
    return jsonWithCors({ error: `eBay token exchange failed: ${msg}` }, { status: 400 });
  }

  return jsonWithCors({ refresh_token: data.refresh_token });
}
