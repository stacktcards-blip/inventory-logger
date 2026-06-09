import { fetchEbayOrdersPage, refreshEbayAccessToken, type EbayFulfillmentOrder } from './ebayFulfillmentClient.js';
import { getEbayOAuthTokenForSync, updateEbayAccessToken } from '../repositories/ebayOAuthTokensRepo.js';
import { completeEbaySyncLog, logEbaySyncStart, upsertEbaySalesOrders } from '../repositories/ebaySalesRepo.js';

export type EbaySalesSyncSummary = {
  storeAccount: string;
  daysBack: number;
  startDate: string;
  endDate: string;
  ordersFetched: number;
  lineItemsUpserted: number;
};

const MAX_DAYS_BACK = 30;
const PAGE_LIMIT = 50;

const isAccessTokenFresh = (expiresAt: string): boolean => {
  const expiresMs = new Date(expiresAt).getTime();
  return Number.isFinite(expiresMs) && expiresMs - Date.now() > 5 * 60 * 1000;
};

export async function syncEbaySalesReadOnly(params: {
  storeAccount?: string;
  daysBack?: number;
}): Promise<EbaySalesSyncSummary> {
  const storeAccount = params.storeAccount ?? '2stackt';
  const daysBack = Math.max(1, Math.min(params.daysBack ?? 7, MAX_DAYS_BACK));
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - daysBack * 24 * 60 * 60 * 1000);
  const syncLogId = await logEbaySyncStart();

  try {
    let token = await getEbayOAuthTokenForSync(storeAccount);
    if (!token) {
      throw new Error(`No eBay OAuth token stored for ${storeAccount}`);
    }

    if (!isAccessTokenFresh(token.access_token_expires_at)) {
      const refreshed = await refreshEbayAccessToken(token.refresh_token);
      token = await updateEbayAccessToken(storeAccount, refreshed);
    }

    const orders: EbayFulfillmentOrder[] = [];
    for (let offset = 0; offset < 1000; offset += PAGE_LIMIT) {
      const page = await fetchEbayOrdersPage({
        accessToken: token.access_token,
        startDate,
        endDate,
        limit: PAGE_LIMIT,
        offset,
      });
      const pageOrders = page.orders ?? [];
      orders.push(...pageOrders);
      if (pageOrders.length < PAGE_LIMIT) break;
    }

    const result = await upsertEbaySalesOrders(orders);
    await completeEbaySyncLog(syncLogId, 'success', result);

    return {
      storeAccount,
      daysBack,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      ordersFetched: result.ordersFetched,
      lineItemsUpserted: result.lineItemsUpserted,
    };
  } catch (error) {
    await completeEbaySyncLog(syncLogId, 'failed', {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
