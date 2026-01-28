import { Router } from 'express';
import { listSourcesByStatus, getSourceWithDrafts, updateSourceStatus } from '../repositories/purchaseSourcesRepo.js';
import { approveDraftsForSource } from '../repositories/purchaseDraftsRepo.js';
import { commitPurchaseSource } from '../services/commitService.js';

export const sourcesRouter = Router();

sourcesRouter.get('/', async (req, res, next) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : 'needs_review';
    const sources = await listSourcesByStatus(status);
    res.json({ data: sources });
  } catch (error) {
    next(error);
  }
});

sourcesRouter.get('/:id', async (req, res, next) => {
  try {
    const source = await getSourceWithDrafts(req.params.id);
    res.json({ data: source });
  } catch (error) {
    next(error);
  }
});

sourcesRouter.post('/:id/approve', async (req, res, next) => {
  try {
    const reviewer = req.body?.reviewed_by ?? 'unknown';
    const drafts = await approveDraftsForSource(req.params.id, reviewer);
    await updateSourceStatus(req.params.id, 'approved');
    res.json({ data: drafts });
  } catch (error) {
    next(error);
  }
});

sourcesRouter.post('/:id/commit', async (req, res, next) => {
  try {
    const committedBy = req.body?.committed_by ?? 'unknown';
    const result = await commitPurchaseSource(req.params.id, committedBy);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});
