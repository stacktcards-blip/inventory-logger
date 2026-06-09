import express from 'express';
import { syncEbaySalesReadOnly } from '../services/ebaySalesSyncService.js';
import { getEbayOAuthTokenStatus } from '../repositories/ebayOAuthTokensRepo.js';
import { fetchSalesLedger } from '../repositories/salesLedgerRepo.js';

export const ebaySalesRouter = express.Router();

const parseDaysBack = (value: unknown): number | undefined => {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
};

const parseString = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value.trim() : undefined);

const parseNumber = (value: unknown, fallback: number, min: number, max: number): number => {
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(min, Math.min(parsed, max));
    }
  }
  return fallback;
};

ebaySalesRouter.get('/status', async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const storeAccount = parseString(req.query.store) ?? '2stackt';
    const tokenStatus = await getEbayOAuthTokenStatus(storeAccount);
    res.json({ connected: Boolean(tokenStatus), tokenStatus });
  } catch (error) {
    next(error);
  }
});

ebaySalesRouter.post('/sync', async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const storeAccount = parseString(req.query.store) ?? '2stackt';
    const daysBack = parseDaysBack(req.query.daysBack);
    const summary = await syncEbaySalesReadOnly({ storeAccount, daysBack });
    res.json({ status: 'ok', mode: 'read_only', summary });
  } catch (error) {
    next(error);
  }
});

ebaySalesRouter.get('/ledger', async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const limit = parseNumber(req.query.limit, 50, 1, 200);
    const offset = parseNumber(req.query.offset, 0, 0, Number.MAX_SAFE_INTEGER);
    const filters = {
      startDate: parseString(req.query.startDate),
      endDate: parseString(req.query.endDate),
      matchStatus: parseString(req.query.matchStatus),
      fulfillmentStatus: parseString(req.query.fulfillmentStatus),
      search: parseString(req.query.search),
    };
    const result = await fetchSalesLedger({ filters, limit, offset });
    res.json(result);
  } catch (error) {
    next(error);
  }
});
