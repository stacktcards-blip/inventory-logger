import express from 'express';
import {
  buildEbayAuthorizationUrl,
  exchangeEbayAuthorizationCode,
  verifyEbayOAuthState,
} from '../services/ebayOAuthClient.js';
import { getEbayOAuthTokenStatus, upsertEbayOAuthToken } from '../repositories/ebayOAuthTokensRepo.js';

export const ebayOAuthPublicRouter = express.Router();
export const ebayOAuthProtectedRouter = express.Router();

const successHtml = (storeCode: string) => `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>eBay connected</title></head>
  <body style="font-family: system-ui, sans-serif; padding: 2rem;">
    <h1>eBay connected</h1>
    <p>${storeCode} is now authorised for Stackt Sales Logger.</p>
    <p>You can close this tab and return to the inventory app.</p>
  </body>
</html>`;

const declinedHtml = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>eBay declined</title></head>
  <body style="font-family: system-ui, sans-serif; padding: 2rem;">
    <h1>eBay authorisation declined</h1>
    <p>No eBay token was stored. You can close this tab.</p>
  </body>
</html>`;

ebayOAuthProtectedRouter.get('/start', (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const storeCode = typeof req.query.store === 'string' && req.query.store.trim()
      ? req.query.store.trim()
      : '2stackt';
    res.json({ authorizationUrl: buildEbayAuthorizationUrl(storeCode) });
  } catch (error) {
    next(error);
  }
});


ebayOAuthPublicRouter.get('/connect', (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const configuredCode = process.env.EBAY_OAUTH_CONNECT_CODE?.trim();
    const providedCode = typeof req.query.code === 'string' ? req.query.code.trim() : '';
    if (!configuredCode || providedCode !== configuredCode) {
      res.status(404).send('Not found');
      return;
    }

    const storeCode = typeof req.query.store === 'string' && req.query.store.trim()
      ? req.query.store.trim()
      : '2stackt';
    res.redirect(buildEbayAuthorizationUrl(storeCode));
  } catch (error) {
    next(error);
  }
});

ebayOAuthProtectedRouter.get('/status', async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const storeCode = typeof req.query.store === 'string' && req.query.store.trim()
      ? req.query.store.trim()
      : '2stackt';
    const status = await getEbayOAuthTokenStatus(storeCode);
    res.json({ connected: Boolean(status), status });
  } catch (error) {
    next(error);
  }
});

ebayOAuthPublicRouter.get('/callback', async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    if (typeof req.query.error === 'string') {
      res.status(400).send(`eBay OAuth error: ${req.query.error}`);
      return;
    }

    const code = typeof req.query.code === 'string' ? req.query.code : null;
    if (!code) {
      res.status(400).send('Missing eBay OAuth code');
      return;
    }

    const state = verifyEbayOAuthState(typeof req.query.state === 'string' ? req.query.state : undefined);
    const token = await exchangeEbayAuthorizationCode(code);
    await upsertEbayOAuthToken(state.storeCode, token);

    res.status(200).send(successHtml(state.storeCode));
  } catch (error) {
    next(error);
  }
});

ebayOAuthPublicRouter.get('/declined', (_req: express.Request, res: express.Response) => {
  res.status(200).send(declinedHtml);
});
