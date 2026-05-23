import express from 'express';
import { z } from 'zod';
import { updateDraft } from '../repositories/purchaseDraftsRepo.js';

export const draftsRouter = express.Router();

const purchaseDraftUpdateSchema = z.object({
  purchase_date: z.string().nullable().optional(),
  card_name: z.string().nullable().optional(),
  set_abbr: z.string().nullable().optional(),
  card_num: z.string().nullable().optional(),
  lang: z.string().nullable().optional(),
  quantity: z.number().int().positive().optional(),
  price_jpy: z.number().nullable().optional(),
  exchange_rate_formula: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).optional(),
  flags: z.array(z.string()).optional(),
  review_status: z.enum(['needs_review', 'approved', 'rejected']).optional(),
}).strict();

draftsRouter.patch('/:id', async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const parsed = purchaseDraftUpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid draft update', details: parsed.error.flatten() });
      return;
    }

    const draft = await updateDraft(req.params.id, parsed.data);
    res.json({ data: draft });
  } catch (error) {
    next(error);
  }
});
