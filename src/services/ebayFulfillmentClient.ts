import { Buffer } from 'node:buffer';
import { getEbayOAuthConfig, type EbayOAuthTokenResponse } from './ebayOAuthClient.js';

const EBAY_TOKEN_URL = 'https://api.ebay.com/identity/v1/oauth2/token';
const EBAY_FULFILLMENT_BASE_URL = 'https://api.ebay.com/sell/fulfillment/v1';

export type EbayMoney = {
  value?: string;
  currency?: string;
};

export type EbayFulfillmentLineItem = {
  lineItemId?: string;
  legacyItemId?: string;
  itemId?: string;
  sku?: string;
  title?: string;
  quantity?: number;
  lineItemCost?: EbayMoney;
  total?: EbayMoney;
  deliveryCost?: {
    shippingCost?: EbayMoney;
  };
  image?: {
    imageUrl?: string;
  };
};

export type EbayFulfillmentOrder = {
  orderId: string;
  legacyOrderId?: string;
  creationDate?: string;
  lastModifiedDate?: string;
  orderFulfillmentStatus?: string;
  orderPaymentStatus?: string;
  buyer?: {
    username?: string;
  };
  pricingSummary?: {
    total?: EbayMoney;
  };
  lineItems?: EbayFulfillmentLineItem[];
};

export type EbayOrdersResponse = {
  orders?: EbayFulfillmentOrder[];
  total?: number;
  limit?: number;
  offset?: number;
};

const authHeader = () => {
  const { clientId, clientSecret } = getEbayOAuthConfig();
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64')}`;
};

export async function refreshEbayAccessToken(refreshToken: string): Promise<EbayOAuthTokenResponse> {
  const { scope } = getEbayOAuthConfig();
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope,
  });

  const response = await fetch(EBAY_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const errorMessage = payload?.error_description || payload?.error || response.statusText;
    throw new Error(`eBay refresh token failed: ${errorMessage}`);
  }

  return payload as EbayOAuthTokenResponse;
}

export async function fetchEbayOrdersPage(params: {
  accessToken: string;
  startDate: Date;
  endDate: Date;
  limit: number;
  offset: number;
}): Promise<EbayOrdersResponse> {
  const url = new URL(`${EBAY_FULFILLMENT_BASE_URL}/order`);
  url.searchParams.set('filter', `creationdate:[${params.startDate.toISOString()}..${params.endDate.toISOString()}]`);
  url.searchParams.set('limit', String(params.limit));
  url.searchParams.set('offset', String(params.offset));

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      Accept: 'application/json',
    },
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const errorMessage = payload?.errors?.[0]?.message || payload?.error_description || payload?.error || response.statusText;
    throw new Error(`eBay order fetch failed: ${errorMessage}`);
  }

  return payload as EbayOrdersResponse;
}
