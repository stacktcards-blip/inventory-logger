import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';

const EBAY_AUTH_BASE_URL = 'https://auth.ebay.com/oauth2/authorize';
const EBAY_TOKEN_URL = 'https://api.ebay.com/identity/v1/oauth2/token';
const DEFAULT_SCOPE = 'https://api.ebay.com/oauth/api_scope/sell.fulfillment';

export type EbayOAuthTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  token_type: string;
  scope?: string;
};

export type EbayOAuthState = {
  storeCode: string;
  nonce: string;
  createdAt: number;
};

const requireEnv = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
};

export function getEbayOAuthConfig() {
  const clientId = requireEnv('EBAY_CLIENT_ID');
  const clientSecret = requireEnv('EBAY_CLIENT_SECRET');
  const redirectUri = requireEnv('EBAY_REDIRECT_URI');
  const scope = process.env.EBAY_SCOPES?.trim() || DEFAULT_SCOPE;
  const stateSecret = process.env.EBAY_OAUTH_STATE_SECRET?.trim() || clientSecret;

  return { clientId, clientSecret, redirectUri, scope, stateSecret };
}

const toBase64Url = (value: string): string =>
  Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

const fromBase64Url = (value: string): string => {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), '=');
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
};

export function createEbayOAuthState(storeCode = '2stackt'): string {
  const { stateSecret } = getEbayOAuthConfig();
  const payload: EbayOAuthState = {
    storeCode,
    nonce: crypto.randomBytes(16).toString('hex'),
    createdAt: Date.now(),
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', stateSecret).update(encodedPayload).digest('hex');
  return `${encodedPayload}.${signature}`;
}

export function verifyEbayOAuthState(state: string | undefined): EbayOAuthState {
  if (!state) {
    throw new Error('Missing OAuth state');
  }

  const { stateSecret } = getEbayOAuthConfig();
  const [encodedPayload, signature] = state.split('.');
  if (!encodedPayload || !signature) {
    throw new Error('Invalid OAuth state');
  }

  const expectedSignature = crypto
    .createHmac('sha256', stateSecret)
    .update(encodedPayload)
    .digest('hex');

  if (signature !== expectedSignature) {
    throw new Error('Invalid OAuth state signature');
  }

  const payload = JSON.parse(fromBase64Url(encodedPayload)) as EbayOAuthState;
  const maxAgeMs = 15 * 60 * 1000;
  if (!payload.createdAt || Date.now() - payload.createdAt > maxAgeMs) {
    throw new Error('Expired OAuth state');
  }

  return payload;
}

export function buildEbayAuthorizationUrl(storeCode = '2stackt'): string {
  const { clientId, redirectUri, scope } = getEbayOAuthConfig();
  const state = createEbayOAuthState(storeCode);
  const url = new URL(EBAY_AUTH_BASE_URL);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', scope);
  url.searchParams.set('state', state);
  return url.toString();
}

export async function exchangeEbayAuthorizationCode(code: string): Promise<EbayOAuthTokenResponse> {
  const { clientId, clientSecret, redirectUri } = getEbayOAuthConfig();
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });

  const response = await fetch(EBAY_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const errorMessage = payload?.error_description || payload?.error || response.statusText;
    throw new Error(`eBay token exchange failed: ${errorMessage}`);
  }

  return payload as EbayOAuthTokenResponse;
}
