import express from 'express';
import { syncEbaySalesReadOnly } from '../services/ebaySalesSyncService.js';
import { getEbayOAuthTokenStatus } from '../repositories/ebayOAuthTokensRepo.js';

export const ebaySalesRouter = express.Router();

const parseDaysBack = (value: unknown): number | undefined => {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
};

ebaySalesRouter.get('/status', async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const storeAccount = typeof req.query.store === 'string' && req.query.store.trim()
      ? req.query.store.trim()
      : '2stackt';
    const tokenStatus = await getEbayOAuthTokenStatus(storeAccount);
    res.json({ connected: Boolean(tokenStatus), tokenStatus });
  } catch (error) {
    next(error);
  }
});

ebaySalesRouter.post('/sync', async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const storeAccount = typeof req.query.store === 'string' && req.query.store.trim()
      ? req.query.store.trim()
      : '2stackt';
    const daysBack = parseDaysBack(req.query.daysBack);
    const summary = await syncEbaySalesReadOnly({ storeAccount, daysBack });
    res.json({ status: 'ok', mode: 'read_only', summary });
  } catch (error) {
    next(error);
  }
});
