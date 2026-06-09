import { supabase } from './supabaseClient.js';
import type { EbayOAuthTokenResponse } from '../services/ebayOAuthClient.js';

export type EbayOAuthTokenRecord = {
  store_account: string;
  environment: string;
  token_type: string;
  scope: string | null;
  access_token: string;
  access_token_expires_at: string;
  refresh_token: string;
  refresh_token_expires_at: string | null;
  updated_at: string;
};

const secondsFromNowIso = (seconds: number | undefined): string | null => {
  if (!seconds || !Number.isFinite(seconds)) return null;
  return new Date(Date.now() + seconds * 1000).toISOString();
};

export async function upsertEbayOAuthToken(
  storeAccount: string,
  token: EbayOAuthTokenResponse
): Promise<EbayOAuthTokenRecord> {
  if (!token.refresh_token) {
    throw new Error('eBay did not return a refresh token. Re-run seller approval with consent.');
  }

  const record = {
    store_account: storeAccount,
    environment: process.env.EBAY_ENV?.trim() || 'production',
    token_type: token.token_type,
    scope: token.scope ?? null,
    access_token: token.access_token,
    access_token_expires_at: secondsFromNowIso(token.expires_in) ?? new Date().toISOString(),
    refresh_token: token.refresh_token,
    refresh_token_expires_at: secondsFromNowIso(token.refresh_token_expires_in),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('ebay_oauth_tokens')
    .upsert(record, { onConflict: 'store_account,environment' })
    .select('store_account, environment, token_type, scope, access_token, access_token_expires_at, refresh_token, refresh_token_expires_at, updated_at')
    .single();

  if (error) {
    throw new Error(`Failed to store eBay OAuth token: ${error.message}`);
  }

  return data as EbayOAuthTokenRecord;
}

export async function getEbayOAuthTokenStatus(storeAccount = '2stackt') {
  const environment = process.env.EBAY_ENV?.trim() || 'production';
  const { data, error } = await supabase
    .from('ebay_oauth_tokens')
    .select('store_account, environment, scope, access_token_expires_at, refresh_token_expires_at, updated_at')
    .eq('store_account', storeAccount)
    .eq('environment', environment)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load eBay OAuth token status: ${error.message}`);
  }

  return data;
}

export async function getEbayOAuthTokenForSync(storeAccount = '2stackt'): Promise<EbayOAuthTokenRecord | null> {
  const environment = process.env.EBAY_ENV?.trim() || 'production';
  const { data, error } = await supabase
    .from('ebay_oauth_tokens')
    .select('store_account, environment, token_type, scope, access_token, access_token_expires_at, refresh_token, refresh_token_expires_at, updated_at')
    .eq('store_account', storeAccount)
    .eq('environment', environment)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load eBay OAuth token: ${error.message}`);
  }

  return data as EbayOAuthTokenRecord | null;
}

export async function updateEbayAccessToken(
  storeAccount: string,
  token: EbayOAuthTokenResponse
): Promise<EbayOAuthTokenRecord> {
  const environment = process.env.EBAY_ENV?.trim() || 'production';
  const updates = {
    token_type: token.token_type,
    scope: token.scope ?? null,
    access_token: token.access_token,
    access_token_expires_at: secondsFromNowIso(token.expires_in) ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('ebay_oauth_tokens')
    .update(updates)
    .eq('store_account', storeAccount)
    .eq('environment', environment)
    .select('store_account, environment, token_type, scope, access_token, access_token_expires_at, refresh_token, refresh_token_expires_at, updated_at')
    .single();

  if (error) {
    throw new Error(`Failed to update eBay access token: ${error.message}`);
  }

  return data as EbayOAuthTokenRecord;
}
