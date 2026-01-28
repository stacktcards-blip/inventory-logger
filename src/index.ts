import express from 'express';
import pino from 'pino';
import { jobsRouter } from './routes/jobs.js';
import { sourcesRouter } from './routes/sources.js';
import { draftsRouter } from './routes/drafts.js';

const app = express();
const logger = pino({ name: 'japan-email-purchase-logger' });

app.use(express.json({ limit: '2mb' }));

app.use('/jobs', jobsRouter);
app.use('/sources', sourcesRouter);
app.use('/drafts', draftsRouter);

app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err }, 'Unhandled error');
  res.status(500).json({ error: err.message });
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  logger.info({ port }, 'Server started');
});
