The Ready Room manager calendar imports Google Calendar **Event-ReadyRoom** at **8 a.m., noon and 3 p.m. America/New_York** daily. Google remains read-only.

Run `npm run test:calendar-sync` for preservation, deletion detection, recurrence, DST, idempotency and error-handling checks. Run `npm run calendar:sync -- --dry-run` to verify a real snapshot without committing anything.

The Render cron service uses `npm ci --omit=dev` to build and `node scripts/sync-ready-room-calendar.mjs --scheduled` to run. Schedule `0 12,13,16,17,19,20 * * *` is UTC; the command exits immediately unless the Eastern hour is 8, 12 or 15, so the requested times follow daylight saving automatically. Manual verification uses the command without `--scheduled`.

Configure `READY_ROOM_CALENDAR_ICS_URL` as the private Google iCal address, `DATABASE_URL` as the same internal database used by the website, and the same `POSTGRES_SSL` setting where applicable. Never commit the private feed address or database credentials. Cron jobs have a $1/month minimum on Render.

The sync adds new future bookings for the next two years, using the same deterministic IDs as the original Google import. A successful snapshot only updates the separate `calendar_sync` metadata on existing rows: it never changes their title, date/time, status, contact, notes, menu, prices, payments, or optimistic-lock version. Google changes are flagged for staff to review. Missing/cancelled Google events are flagged without deleting or cancelling saved plans. Reappearing events clear the deletion flag. A failed/invalid download or parse makes no changes. The entire database update is one transaction with an advisory lock. No email is sent and no Google event is edited.

The website manager shows source warnings beside saved events and the last successful sync time. `private_event_calendar_sync` in `website.settings` stores the last successful summary; the cron's Render logs show failures. Calendar-only sync changes do not change the Event Flight Plan PDF version.
