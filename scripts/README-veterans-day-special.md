# Cancelled Veterans Day meal special — November 11, 2026

The meal special was cancelled before service and must not be advertised. The dedicated `/events/veterans-day` route has been removed. The seasonal Veterans Day tribute links to `/events` without mentioning meal specials.

The original managed event can remain in manager records for reference. Public event queries exclude the cancelled November 11, 2026 meal special by its menu URL or Veterans Day MRE meal title, including when an older production database record is still marked published. This applies to both the homepage event list and the Events page. Other Veterans Day events and the tribute artwork are unaffected.

The original publication payload is archived in `content/veterans-day-special-2026.json` with `published: false`; it is not a runtime fallback. Do not republish it.

Validation: `npm run test:managed-events`, `npm run test:site-skins`, production build, and live checks of `/`, `/events`, and the removed menu route.
