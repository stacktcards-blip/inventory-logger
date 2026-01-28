import { Router } from 'express';
import { ingestGmail } from '../jobs/ingestGmail.js';
import { parsePendingSources } from '../jobs/parsePending.js';

export const jobsRouter = Router();

jobsRouter.post('/ingest-gmail', async (_req, res, next) => {
  try {
    await ingestGmail();
    res.json({ status: 'ok' });
  } catch (error) {
    next(error);
  }
});

jobsRouter.post('/parse-pending', async (_req, res, next) => {
  try {
    await parsePendingSources();
    res.json({ status: 'ok' });
  } catch (error) {
    next(error);
  }
});
