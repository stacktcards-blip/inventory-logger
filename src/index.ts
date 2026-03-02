import express from 'express';
import pino from 'pino';
import { jobsRouter } from './routes/jobs.js';
import { sourcesRouter } from './routes/sources.js';
import { draftsRouter } from './routes/drafts.js';
import { slabIntakeRouter } from './routes/slabIntake.js';

const app = express();
const logger = pino({ name: 'japan-email-purchase-logger' });

const corsOrigin = process.env.CORS_ORIGIN ?? '*';
app.use((_req: express.Request, res: express.Response, next: express.NextFunction) => {
  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});
app.options('*', (_req: express.Request, res: express.Response) => res.sendStatus(204));
app.use(express.json({ limit: '2mb' }));

app.use('/jobs', jobsRouter);
app.use('/sources', sourcesRouter);
app.use('/drafts', draftsRouter);
app.use('/slab-intake', slabIntakeRouter);

app.get('/healthz', (_req: express.Request, res: express.Response) => {
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
