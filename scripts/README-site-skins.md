# Website skins and artwork comments

Manager Portal → Marketing → Website Skins (`/manager/site-skins`) controls the existing `website.settings` record `site_theme`. The six original seasonal presets are Veterans Day, Thanksgiving, Christmas, New Year’s, Valentine’s Day and St. Patrick’s Day. Existing Standard Aviator, Grateful Dead Night, Holiday Gathering and After Dark remain available.

## Annual automatic rotation

Enable / resume automatic rotation in Website Skins. All boundaries are midnight **America/New_York**, with daylight saving time handled automatically:

| Skin | Inclusive dates |
| --- | --- |
| Veterans Day | November 8–11 |
| Thanksgiving | November 12–fourth Thursday of November |
| Christmas | Day after Thanksgiving–December 25 |
| New Year’s | December 26–January 1 |
| Valentine’s Day | February 1–14 |
| St. Patrick’s Day | March 1–17 |

The standard design appears between seasons. The schedule repeats every year, computes Thanksgiving’s date and treats January 1 as the previous December 31 celebration. It does not create events, promotions, business hours or offers. New visits resolve the schedule on the server; already-open pages refresh within a minute. No cron, extra service or annual deployment is needed.

Saving a manual skin while rotation is enabled overrides it until that skin’s turn-off date, or for 24 hours when no date is set. Enable / resume clears the override. Pause rotation & use standard design and Turn off skins & rotation turn automatic activation off. Activation is an explicit manager setting, not a code-deploy side effect. Automatic presets use their own supplied copy; use a manual override to feature edited copy or custom artwork.

Server settings are cached for up to 30 seconds and invalidated on manager save. APIs use no-store. Manager, private-event, Feast, proposal and checkout pages keep their standard presentation. Skins do not alter menus, orders, bookings, pricing or payments.

## Artwork and design research

The six landscape originals were generated with the built-in image generation tool as separate requests. Exact prompts and asset paths are in `scripts/seasonal-skin-artwork-prompts.json`. Original PNG files are in `public/images/skins/originals/`; versioned, optimized WebP files in `public/images/skins/` are used on the website. Display uses contain sizing so titles and illustrations are not cropped. Each design combines Aviator hangar/brewery cues with a separate palette and seasonal motifs; none advertises invented dates, hours, discounts or offers.

Research informing the designs:

- [VA: History of Veterans Day](https://news.va.gov/125629/the-history-of-veterans-day/) — honor all who served; eagle, American flag, patriotic navy, crimson and amber beer.
- [Smithsonian winter holidays](https://www.si.edu/events/winter-holidays) — seasonal gathering and community.
- [English Heritage: Christmas greenery](https://www.english-heritage.org.uk/learn/histories/christmas-greenery-history/) — evergreen, warm lights, cranberry and gold.
- [National Park Service: Historic Valentine cards](https://www.nps.gov/articles/000/historic-valentine-s-day-cards.htm) and [V&A: Valentine cards](https://www.vam.ac.uk/articles/a-brief-history-of-valentines-cards) — ruby, roses, paired beers and candlelight.
- [Ireland: St. Patrick’s Day](https://www.ireland.ie/en/st-patricks-day-2026/everything-you-need-to-know-about-st-patricks-day/) — emerald, shamrocks, convivial celebration, stout and gold.
- [Encyclopedia of Greater Philadelphia: New Year traditions](https://philadelphiaencyclopedia.org/essays/new-years-traditions/) — midnight celebration and fireworks.

The legacy November 7 Bring Out Yer Dead poster remains at `public/images/promotions/bring-out-yer-dead-nov7.jpg`, copied without image edits from Aviator Live’s published schedule (booking `73217e91-5438-44eb-a8a2-c46cbf00281a`). Its original default expiry was November 8, 2026, midnight Eastern. Existing promotion fields are retained when turning a skin off.

## Likes, comments and private manager audit

Artwork likes and moderated comments can be enabled independently of manual or automatic presentation. A campaign is tied to the skin and artwork URL; switching images does not misattribute reactions. A signed, HttpOnly, SameSite visitor cookie remembers one like per visitor/artwork. Likes can be removed. It is not verified identity or a unique-person count; clearing cookies can create a new visitor.

All comments are held from public view until approved by a manager. Deterministic rules automatically mark profanity, advertising, hostile attacks on Aviator/America, unsafe HTML and common spam as removed. Rules are an initial filter, not a semantic classifier; manager approval is the publication gate for other comments. Removed comments remain private for audit and false-positive restoration. User content is displayed as plain text. Submitted names are optional and public only upon approval; email is optional, private to authorized managers, and is neither a newsletter signup nor a request to send mail.

Manager Portal → Marketing → Image Comments (`/manager/skin-comments`) shows pending, published and removed comments with search, skin filters, pagination and automatic/manager action history. Managers can approve (with confirmation), remove or restore to review. Optimistic versions prevent stale actions overwriting newer decisions. No review action sends email.

Additive tables: `website.skin_image_likes`, `website.skin_image_comments`, `website.skin_comment_actions`, `website.skin_social_rate_events`. Both migration entry points include the same schema. The existing database initialization creates these if necessary. Signing material is a private settings record `skin_social_secret`, never exposed by public APIs. Visitor/IP values are HMAC hashes, not raw addresses. Public responses expose only counts and approved display names/comment text/timestamps. Manager review requires the existing manager session. Origin checks, signed visitor validation, body bounds, idempotent requests, parameterized SQL, transaction locks and rate limits protect posting. Per-day limits are 5 comments per visitor within an IP, 20 comments per IP, and 40 like actions per IP per hour. Rate records older than two days are pruned on writes; comment/audit records are retained for manager review. Request IP uses the hosting proxy’s forwarded header; these are abuse deterrents, not verified identity.

## Validation

- `npm run test:site-skins`: existing skin storage, expiration, protected paths, manager authentication, field validation and sharing metadata.
- `SKIN_SOCIAL_TEST_DATABASE_URL=... npm run test:skin-social`: disposable local Postgres integration tests for six presets/assets, annual schedule/Eastern boundaries, New Year rollover, signed cookies, concurrent/idempotent likes, origin/stale-artwork protection, comments, private email, moderation, authenticated audit, stale-review protection and rate limits. Database name must start `aviator_skin_test_`.
- `SITE_SKIN_TEST_DATABASE_URL=... AVIATOR_PLAYWRIGHT_MODULE=... npm run test:site-skins-ui`: real standalone server and disposable local database, desktop/tablet/mobile layout, legacy skins, keyboard selection, automatic rotation/manual override/pause, reactions, private comments and manager publication/removal. All unrelated mutations are intercepted. No real customers, emails or payments are used.
- `npx tsc --noEmit`, `npm run build`.

## Social sharing

Homepage Open Graph and Twitter metadata use the active artwork with date and copy (event time only for event promotions), absolute versioned URLs and primary `https://aviatorbrew.com/` URL. Off, expired or missing-artwork skins use the regular logo. Facebook caches previews: use its Sharing Debugger and Scrape Again to refresh an old preview. This does not publish a Facebook post.
