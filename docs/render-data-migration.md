# Render Data Migration

The migration utilities move the local Aviator catalog to the Render PostgreSQL database and package runtime media for the Render persistent disk.

## Safety model

- Catalog data is upserted by stable keys.
- Keg/package inventory is replaced because each inventory import is a complete snapshot.
- Existing Render orders, subscribers, Flight Log customers, and sessions are not deleted or imported.
- Existing shop inventory is preserved when Render already has orders, unless `--replace-shop-inventory` is explicitly supplied.
- Every applied import creates a custom-format backup of the Render database first.
- The import is a dry run unless both `--apply` and `CONFIRM_RENDER_IMPORT=aviatorbrew` are supplied.

## Export locally

```bash
npm run render:data:export
```

The command creates `.migration-exports/render-migration-<timestamp>/` containing:

- `catalog-data.json`
- `local-source-backup.dump`
- `render-media.tar.gz`
- `media-manifest.json`
- `render-media.env`

Migration exports are intentionally ignored by Git because the PostgreSQL backup may contain customer or order data.

## Configure the Render database connection locally

Create `.env.render.local`:

```bash
TARGET_DATABASE_URL=postgresql://USER:PASSWORD@EXTERNAL_RENDER_HOST/DATABASE?sslmode=require
CONFIRM_RENDER_IMPORT=aviatorbrew
```

Use the external database URL from the Render PostgreSQL dashboard. Do not use the internal URL from a local workstation.

## Render GitHub deploy

Use the normal production build for local development:

```bash
npm run build
```

For Render, either set the service Pre-Deploy Command to:

```bash
npm run render:predeploy
```

and keep the Build Command as:

```bash
npm ci && npm run build
```

or set the Build Command to:

```bash
npm ci && npm run render:build
```

Both Render options run the PostgreSQL schema migration before the site starts. They do not import local catalog data or media. Run the data import separately when you intentionally want to update the Render database.

## Inspect before importing

```bash
npm run render:data:import
```

This prints source and target row counts and makes no changes.

## Apply

```bash
npm run render:data:import -- --apply
```

The import backs up Render, runs the current schema migration, applies the catalog transaction, and prints post-import counts.

## Media

The archive is rooted at `aviatorbrew/`. Transfer it to the Render service and extract it on the persistent disk:

```bash
tar -xzf render-media.tar.gz -C /var/data
```

Add every variable from `render-media.env` to the Render web service. The disk mount path must be `/var/data`.

Verify the archive after extraction:

```bash
cd /var/data
sha256sum -c /path/to/generated-checksum-file
```

The JSON manifest contains the same SHA-256 values when programmatic verification is preferred.
