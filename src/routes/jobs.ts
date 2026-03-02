import express from 'express';
import { ingestGmail } from '../jobs/ingestGmail.js';
import { parsePendingSources } from '../jobs/parsePending.js';

export const jobsRouter = express.Router();

jobsRouter.post('/ingest-gmail', async (_req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    await ingestGmail();
    res.json({ status: 'ok' });
  } catch (error) {
    next(error);
  }
});

jobsRouter.post('/parse-pending', async (_req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    await parsePendingSources();
    res.json({ status: 'ok' });
  } catch (error) {
    next(error);
  }
});
