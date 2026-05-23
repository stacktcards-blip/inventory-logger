import express from 'express';
import { z } from 'zod';
import { listSourcesByStatus, getSourceWithDrafts, updateSourceStatus } from '../repositories/purchaseSourcesRepo.js';
import { approveDraftsForSource } from '../repositories/purchaseDraftsRepo.js';
import { commitPurchaseSource } from '../services/commitService.js';

export const sourcesRouter = express.Router();

const sourceStatusSchema = z.enum(['pending', 'parsed', 'needs_review', 'error', 'approved', 'committed']);

const actorForRequest = (req: express.Request) => req.user?.email ?? req.user?.id ?? 'unknown';

sourcesRouter.get('/', async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const parsed = sourceStatusSchema.safeParse(req.query.status ?? 'needs_review');
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid source status' });
      return;
    }

    const sources = await listSourcesByStatus(parsed.data);
    res.json({ data: sources });
  } catch (error) {
    next(error);
  }
});

sourcesRouter.get('/:id', async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const source = await getSourceWithDrafts(req.params.id);
    res.json({ data: source });
  } catch (error) {
    next(error);
  }
});

sourcesRouter.post('/:id/approve', async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const reviewer = actorForRequest(req);
    const drafts = await approveDraftsForSource(req.params.id, reviewer);
    await updateSourceStatus(req.params.id, 'approved');
    res.json({ data: drafts });
  } catch (error) {
    next(error);
  }
});

sourcesRouter.post('/:id/commit', async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const committedBy = actorForRequest(req);
    const result = await commitPurchaseSource(req.params.id, committedBy);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});
