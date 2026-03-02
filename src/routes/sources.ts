import express from 'express';
import { listSourcesByStatus, getSourceWithDrafts, updateSourceStatus } from '../repositories/purchaseSourcesRepo.js';
import { approveDraftsForSource } from '../repositories/purchaseDraftsRepo.js';
import { commitPurchaseSource } from '../services/commitService.js';

export const sourcesRouter = express.Router();

sourcesRouter.get('/', async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : 'needs_review';
    const sources = await listSourcesByStatus(status);
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
    const reviewer = req.body?.reviewed_by ?? 'unknown';
    const drafts = await approveDraftsForSource(req.params.id, reviewer);
    await updateSourceStatus(req.params.id, 'approved');
    res.json({ data: drafts });
  } catch (error) {
    next(error);
  }
});

sourcesRouter.post('/:id/commit', async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const committedBy = req.body?.committed_by ?? 'unknown';
    const result = await commitPurchaseSource(req.params.id, committedBy);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});
