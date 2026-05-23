import express from 'express';
import { z } from 'zod';
const { Router } = express;
import { getByCertNumber } from '../services/psaCertClient.js';
import { psaCertToSlabDraft } from '../adapters/psaCertToSlabDraft.js';
import {
  insertDraft,
  listDraftsByStatus,
  getDraftById,
  updateDraft,
  slabExistsByCert,
  hasPendingOrApprovedDraft,
} from '../repositories/slabIntakeDraftsRepo.js';
import { commitSlabIntakeDraft } from '../services/slabIntakeCommitService.js';

export const slabIntakeRouter = Router();

const draftStatusSchema = z.enum(['pending', 'approved', 'committed', 'rejected']);
const slabDraftUpdateSchema = z.object({
  grade: z.string().nullable().optional(),
  set_abbr: z.string().nullable().optional(),
  num: z.string().nullable().optional(),
  lang: z.string().nullable().optional(),
  grading_company: z.string().nullable().optional(),
  card_name: z.string().nullable().optional(),
  is_1ed: z.boolean().nullable().optional(),
  is_rev: z.boolean().nullable().optional(),
  note: z.string().nullable().optional(),
  order_number: z.string().nullable().optional(),
  acquired_date: z.string().nullable().optional(),
  image_url: z.string().url().nullable().optional(),
}).strict();

const actorForRequest = (req: express.Request) => req.user?.email ?? req.user?.id ?? 'unknown';

/** POST /slab-intake/fetch – body: { certNumber: string } */
slabIntakeRouter.post('/fetch', async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const certNumber = req.body?.certNumber ?? req.query?.certNumber;
    const raw = typeof certNumber === 'string' ? certNumber.trim() : '';
    if (!raw) {
      res.status(400).json({ error: 'certNumber is required' });
      return;
    }

    const inSlabs = await slabExistsByCert(raw);
    if (inSlabs) {
      res.status(409).json({
        error: 'already_in_inventory',
        message: 'A slab with this certificate number is already in inventory.',
      });
      return;
    }

    const inDrafts = await hasPendingOrApprovedDraft(raw);
    if (inDrafts) {
      res.status(409).json({
        error: 'already_in_intake',
        message: 'This certificate number already has a pending or approved draft.',
      });
      return;
    }

    const apiResponse = await getByCertNumber(raw);
    if (!apiResponse) {
      res.status(404).json({
        error: 'no_data_found',
        message: 'PSA returned no data for this certificate number.',
      });
      return;
    }

    const parsed = psaCertToSlabDraft(apiResponse, raw);
    const draft = await insertDraft({
      ...parsed,
      result_json: apiResponse as unknown as Record<string, unknown>,
    });

    res.status(201).json({ data: draft });
  } catch (err) {
    next(err);
  }
});

/** GET /slab-intake/drafts?status=pending */
slabIntakeRouter.get('/drafts', async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const parsed = draftStatusSchema.safeParse(req.query.status ?? 'pending');
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid draft status' });
      return;
    }

    const drafts = await listDraftsByStatus(parsed.data);
    res.json({ data: drafts });
  } catch (err) {
    next(err);
  }
});

/** GET /slab-intake/drafts/:id */
slabIntakeRouter.get('/drafts/:id', async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const draft = await getDraftById(req.params.id);
    res.json({ data: draft });
  } catch (err) {
    next(err);
  }
});

/** PATCH /slab-intake/drafts/:id */
slabIntakeRouter.patch('/drafts/:id', async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const parsed = slabDraftUpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid slab intake draft update', details: parsed.error.flatten() });
      return;
    }

    const draft = await updateDraft(req.params.id, parsed.data);
    res.json({ data: draft });
  } catch (err) {
    next(err);
  }
});

/** POST /slab-intake/drafts/:id/approve */
slabIntakeRouter.post('/drafts/:id/approve', async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const draft = await updateDraft(req.params.id, { status: 'approved' });
    res.json({ data: draft });
  } catch (err) {
    next(err);
  }
});

/** POST /slab-intake/drafts/:id/reject */
slabIntakeRouter.post('/drafts/:id/reject', async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const draft = await updateDraft(req.params.id, { status: 'rejected' });
    res.json({ data: draft });
  } catch (err) {
    next(err);
  }
});

/** POST /slab-intake/drafts/:id/commit – body: { committed_by?: string } */
slabIntakeRouter.post('/drafts/:id/commit', async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const committedBy = actorForRequest(req);
    const result = await commitSlabIntakeDraft(req.params.id, committedBy);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});
