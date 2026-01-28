import { Router } from 'express';
import { updateDraft } from '../repositories/purchaseDraftsRepo.js';

export const draftsRouter = Router();

draftsRouter.patch('/:id', async (req, res, next) => {
  try {
    const updates = req.body ?? {};
    const draft = await updateDraft(req.params.id, updates);
    res.json({ data: draft });
  } catch (error) {
    next(error);
  }
});
