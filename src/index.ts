import express from 'express';
import pino from 'pino';
import { jobsRouter } from './routes/jobs.js';
import { sourcesRouter } from './routes/sources.js';
import { draftsRouter } from './routes/drafts.js';
import { slabIntakeRouter } from './routes/slabIntake.js';
import { ebayOAuthProtectedRouter, ebayOAuthPublicRouter } from './routes/ebayOAuth.js';
import { ebaySalesRouter } from './routes/ebaySales.js';
import { corsMiddleware, requireCorsConfiguration } from './middleware/cors.js';
import { requireAuthenticatedUser, requireAuthConfiguration } from './middleware/auth.js';

const app = express();
const logger = pino({ name: 'japan-email-purchase-logger' });
const isProduction = process.env.NODE_ENV === 'production';

requireCorsConfiguration();
requireAuthConfiguration();

app.use(corsMiddleware);
app.options('*', (_req: express.Request, res: express.Response) => res.sendStatus(204));
app.use(express.json({ limit: '2mb' }));

app.get('/healthz', (_req: express.Request, res: express.Response) => {
  res.json({ status: 'ok' });
});

app.use('/ebay/oauth', ebayOAuthPublicRouter);

app.use(requireAuthenticatedUser);

app.use('/jobs', jobsRouter);
app.use('/sources', sourcesRouter);
app.use('/drafts', draftsRouter);
app.use('/slab-intake', slabIntakeRouter);
app.use('/ebay/oauth', ebayOAuthProtectedRouter);
app.use('/ebay/sales', ebaySalesRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err }, 'Unhandled error');
  res.status(500).json({ error: isProduction ? 'Internal server error' : err.message });
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  logger.info({ port }, 'Server started');
});
