import express from 'express';
import { updateDraft } from '../repositories/purchaseDraftsRepo.js';

export const draftsRouter = express.Router();

draftsRouter.patch('/:id', async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const updates = req.body ?? {};
    const draft = await updateDraft(req.params.id, updates);
    res.json({ data: draft });
  } catch (error) {
    next(error);
  }
});
