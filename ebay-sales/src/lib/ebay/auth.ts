/**
 * eBay OAuth 2.0 – exchange refresh token for access token.
 * Scope: sell.fulfillment
 */

const FULFILLMENT_SCOPE = 'https://api.ebay.com/oauth/api_scope/sell.fulfillment';
// buy.browse dropped from refresh scope until token is re-authorized with both scopes
const SCOPES = FULFILLMENT_SCOPE;

const SANDBOX_TOKEN_URL = 'https://api.sandbox.ebay.com/identity/v1/oauth2/token';
const PRODUCTION_TOKEN_URL = 'https://api.ebay.com/identity/v1/oauth2/token';

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

function getTokenUrl(): string {
  const env = process.env.EBAY_ENVIRONMENT || 'production';
  return env === 'sandbox' ? SANDBOX_TOKEN_URL : PRODUCTION_TOKEN_URL;
}

function getCredentials(): { appId: string; certId: string } {
  const appId = process.env.EBAY_APP_ID;
  const certId = process.env.EBAY_CERT_ID;
  if (!appId || !certId) {
    throw new Error('Missing EBAY_APP_ID or EBAY_CERT_ID');
  }
  return { appId, certId };
}

/**
 * Get a valid access token. Uses in-memory cache; refreshes when expired.
 */
export async function getAccessToken(): Promise<string> {
  const refreshToken = process.env.EBAY_REFRESH_TOKEN;
  if (!refreshToken) {
    throw new Error('Missing EBAY_REFRESH_TOKEN');
  }

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) {
    return cachedToken.accessToken;
  }

  const { appId, certId } = getCredentials();
  const credentials = Buffer.from(`${appId}:${certId}`).toString('base64');

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: SCOPES,
  });

  const res = await fetch(getTokenUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`eBay OAuth failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  const expiresIn = data.expires_in ?? 7200;
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: now + expiresIn * 1000,
  };

  return cachedToken.accessToken;
}
