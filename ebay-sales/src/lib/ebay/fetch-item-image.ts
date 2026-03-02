/**
 * Fetch primary image URL for an eBay item via Browse API.
 * Uses get_item_by_legacy_id for reliability with Fulfillment API legacy IDs.
 * Requires buy.browse OAuth scope. Fails silently if scope missing.
 */

import { getAccessToken } from './auth';

const BROWSE_BASE = process.env.EBAY_ENVIRONMENT === 'sandbox'
  ? 'https://api.sandbox.ebay.com'
  : 'https://api.ebay.com';

type ImageObj = { imageUrl?: string };
type BrowseResponse = {
  image?: ImageObj;
  additionalImages?: ImageObj[];
};

export async function fetchItemImageUrl(itemId: string | null): Promise<string | null> {
  if (!itemId) return null;
  try {
    const token = await getAccessToken();
    const url = `${BROWSE_BASE}/buy/browse/v1/item/get_item_by_legacy_id?legacy_item_id=${encodeURIComponent(itemId)}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_AU',
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as BrowseResponse;
    const primary = data.image?.imageUrl;
    if (primary) return primary;
    const firstExtra = data.additionalImages?.[0]?.imageUrl;
    return firstExtra ?? null;
  } catch {
    return null;
  }
}
