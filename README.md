# Japan Email Purchase Logger

Backend service for processing Japan store purchase confirmation emails (CardRush / Hareruya / Magi). The workflow is: Gmail ingest → parsed drafts → manual approval → commit to `raw_cards`.

## Folder Structure
```
appsmith/             Appsmith page layout + query plan
fixtures/             Sample email fixtures for parser tests
migrations/           Supabase SQL migrations
src/
  adapters/           Mapping from drafts → raw_cards
  config/             Store detection + parser config
  jobs/               Ingest + parse jobs
  parsers/            Vendor parsers + shared helpers
  repositories/       Supabase data access layer
  routes/             Express routes
  services/           Gmail + commit services
  utils/              Text helpers
  index.ts            Express app entry
```

## Setup
### Prerequisites
- Node.js 20+ (uses the built-in Node test runner).

### 1) Install dependencies
```
npm install
```

### 2) Environment variables
Create a `.env` file (or export env vars) with:
```
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
GMAIL_REFRESH_TOKEN=...
GMAIL_REDIRECT_URI=urn:ietf:wg:oauth:2.0:oob
PORT=4000
# Optional: for Slab Intake (PSA cert lookup)
PSA_API_TOKEN=...   # or PSA_API_KEY – get from https://www.psacard.com/publicapi
CORS_ORIGIN=*       # or your frontend origin, e.g. http://localhost:5173
```
Frontend: set `VITE_API_URL=http://localhost:4000` (or your Express URL) so the Slab Intake page can call the backend.

### 3) Supabase migrations
Run the SQL in `migrations/001_create_purchase_tables.sql` and `migrations/002_commit_purchase_source.sql` in Supabase.

## Running locally
```
npm run dev
```

## Tests
```
npm test
```

## Jobs (manual trigger)
```
POST /jobs/ingest-gmail
POST /jobs/parse-pending
```

## API Endpoints
- `POST /jobs/ingest-gmail`
- `POST /jobs/parse-pending`
- `GET /sources?status=needs_review`
- `GET /sources/:id`
- `PATCH /drafts/:id`
- `POST /sources/:id/approve`
- `POST /sources/:id/commit`

### Slab Intake (PSA cert lookup)
- `POST /slab-intake/fetch` – body `{ certNumber }` – fetch from PSA API, create draft
- `GET /slab-intake/drafts?status=pending|approved`
- `GET /slab-intake/drafts/:id`
- `PATCH /slab-intake/drafts/:id`
- `POST /slab-intake/drafts/:id/approve`
- `POST /slab-intake/drafts/:id/reject`
- `POST /slab-intake/drafts/:id/commit` – body `{ committed_by? }`

## Parser Notes
- Vendor detection uses `src/config/japanStores.ts` (sender domain + subject keywords).
- Parsing is deterministic; ambiguous extractions are flagged in `purchase_drafts.flags`.
- Confidence is computed from presence of card name, set, number, and price. Anything below 0.85 is marked `needs_review`.

### Adding more sample emails
Place raw body text in `fixtures/` and add a test in `tests/parsers.test.ts`.

## raw_cards Adapter
`src/adapters/rawCardsAdapter.ts` maps draft rows into `raw_cards` inserts. The mapping targets `purchase_price`, `set_abbr`, `num`, `lang`, `seller`, `purchase_date`, and `note` per the real schema. The service does not modify `raw_cards` schema.

## Gmail OAuth setup (quick)
1. Create OAuth client credentials in Google Cloud Console.
2. Generate a refresh token using the OAuth Playground.
3. Provide the token and client details via env vars above.

## Slab Intake
The Slab Intake flow lets you add slabs by PSA certificate number: fetch from the [PSA Public API](https://www.psacard.com/publicapi/documentation), review parsed drafts, then commit to the `slabs` table. Run migration `migrations/022_slab_intake_drafts.sql` in Supabase. Requires `PSA_API_TOKEN` (or `PSA_API_KEY`). Free PSA accounts have a daily API call limit (~100).

## Appsmith
See `appsmith/plan.md` for queries and page layout suggestions.
