# BrewOps inventory receiver

Prepared receiver: `POST /api/integrations/brewops/inventory`. **Do not deploy or enable publishing until the BrewOps live cooler inventory has been entered and verified.** The existing public snapshot and its counts are unchanged by this work.

Configure a persistent PostgreSQL connection and `BREWOPS_SALES_SYNC_TOKEN` (a random secret of at least 32 characters). The BrewOps service uses the same secret in `SALES_SYNC_TOKEN` and the HTTPS endpoint in `SALES_SYNC_ENDPOINT`. No credentials are committed. The route rejects unauthorized requests and unconfigured storage.

The route uses a PostgreSQL advisory transaction lock and `website.settings.brewops_sales_snapshot` for atomic snapshot replacement, SHA-256 acknowledgement, UUID idempotency, monotonic revision validation and a persistent 30-minute cooldown. It requires complete product coverage and validates case/loose-can arithmetic, pack counts and volume. Website prices, hidden products, labels and merchandising survive quantity updates; normal manager pricing remains effective after activation.

The `/kegs` page reads the synchronized snapshot only after the receiver has stored one. Before then it uses its existing data. The bundled public `/data/kegs-for-sale.json` remains the historical file; synchronized rendered availability is stored in PostgreSQL. There is no Git commit or application rebuild per inventory change.

Receiver tests must use a disposable `_test` PostgreSQL database and NODE_ENV=test. Run with a TypeScript runner, for example `tsx --test scripts/test-brewops-sales-sync.ts`. They call the actual route with a generated ephemeral token and temporary fixture file. They never send a production HTTP request. The application's operating procedure is documented in BrewOps `docs/SALES_INVENTORY_SYNC.md`.
