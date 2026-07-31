# Aviator Brewing Company — New Website

A production-ready Next.js 15, React 19, TypeScript, and Tailwind CSS foundation for Aviator Brewing Company in Fuquay-Varina, NC.

## What is included

- Custom aviation-inspired, mobile-first visual system.
- Home, beer catalog + detail pages, locations + detail pages, menus, events + detail pages, private events, brewery, distillery, about, careers, contact, gift cards/merchandise, and FAQ routes.
- Responsive desktop navigation, accessible mobile menu, and persistent mobile actions for directions, menus, events, and calls.
- Centralized operational content in `src/data/site.ts`.
- Filterable beer catalog; structured locations and events.
- Validated newsletter, contact, private-event, and career forms via `POST /api/inquiries`.
- Conversion event hooks via `data-analytics` attributes and the `aviator:conversion` browser event.
- Metadata, Open Graph defaults, canonical base URL, XML sitemap, robots.txt, local-business/restaurant JSON-LD, and individual location schema.
- Local legacy Aviator image assets copied into `public/images/` for the initial build.

## Quick start

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`. For network testing:

```bash
npm run build
PORT=4173 npm run start:public
```

## Content operations

Update `src/data/site.ts` to change the default content model. Manager Portal changes for locations, beers, beverages, events, coupons, tours, kegs, menus, and photos are stored under `data/` or `public/` so operations can update active site content without code changes.

Set `FORM_WEBHOOK_URL` in `.env.local` to forward validated form submissions to a CRM, email provider, Zapier/Make workflow, or custom API. Without it, validation and success states work but submissions are not delivered externally.

## Sitemap

See [docs/sitemap.md](docs/sitemap.md). Dynamic location, beer, and event pages are statically generated from the content model and also emitted in `/sitemap.xml`.

## Component inventory

| Component | Responsibility |
| --- | --- |
| `SiteHeader` | Desktop/mobile navigation and mobile action bar |
| `SiteFooter` | Location, conversion, and utility navigation |
| `LocationCard` | Reusable location preview |
| `BeerCard` + `BeerGallery` | Beer preview and client-side category filter |
| `EventCard` | Reusable event preview |
| `InquiryForm` | Accessible validated form variations |
| `AnalyticsHooks` | Conversion event dispatching |

## Build and test

```bash
npm run build
curl -I http://localhost:4173/
```

Manual test checklist:

- Test keyboard navigation, visible focus indicators, mobile menu, and reduced motion.
- Test directions, call, menu, event, and form conversion paths.
- Test every location, beer, and event detail route.
- Confirm hours, addresses, menus, and availability against operations before launch.
- Test form webhook delivery once `FORM_WEBHOOK_URL` is configured.
- Run Lighthouse against the production build after final photography and third-party integrations are added.

## Deployment

See [docs/deployment.md](docs/deployment.md) for the external-server runbook.

1. Copy `.env.production.example` to `.env.production` on the server and set `NEXT_PUBLIC_SITE_URL` to the canonical HTTPS hostname.
2. Set mail, manager, coupon, tour, Stripe, Aviator Live, and persistent data settings in server secrets or `.env.production`.
3. Run `npm ci && npm run build`.
4. Deploy with a Node 20+ host using `PORT=4173 npm run start:public`.
5. Route the desired hostname to the service through HTTPS.
6. Submit `/sitemap.xml` in Google Search Console and confirm structured data with Google’s Rich Results Test.

## Still requiring credentials or operational input

- CRM/email/SMS webhook for forms.
- Live event/calendar platform feed and ticket/RSVP links.
- Live online-ordering, merchandise, gift-card, and reservation links.
- Approved social profiles and analytics measurement ID.
- Final current menus, weekly specials, hours, location phones, parking/accessibility details, beer availability, and images.
- Production database/CMS credentials if moving the current TypeScript content layer to the local PostgreSQL-backed admin.

## Asset plan

See [docs/image-manifest.md](docs/image-manifest.md) for used assets and the recommended professional photography/rendering shot list.

## Future improvements

- Connect the content model to a manager-facing CMS with publishing roles.
- Add event calendar, email/SMS, ordering, gift cards, reservations, and analytics integrations.
- Produce current campus drone, food, music, venue, beer-can, and portrait photography.
- Add real menu data with price, allergens, dietary tags, and availability.
- Add end-to-end form tests, visual regression checks, and monitoring before public launch.


## Brewery tours

The individual tour signup at `/about#brewery-tours` tracks seats toward a Saturday 4:00 PM flight. A flight is qualified at 20 guests. Once the 4:00 PM flight reaches 20, the next registrations are placed on a 6:00 PM overflow flight. Registrations made inside 24 hours of a Saturday are assigned to the following Saturday.

Every signup is stored in `data/tour-signups.json` (or `TOUR_DATA_FILE`) and triggers an internal email to `tours@aviatorbrew.com` that includes its assigned flight and current seat total. Each ticket is $20 and includes a pint glass, one beer pour, and one flight of four pours. Tours are approximately 30 minutes.

Configure either `TOUR_EMAIL_WEBHOOK_URL` or the `RESEND_API_KEY` + `TOUR_FROM_EMAIL` pair before launch. The weekly confirmation endpoint is:

```
POST /api/tours/weekly-notify
x-tour-cron-key: $TOUR_CRON_KEY
```

Schedule it every Wednesday around noon Eastern. It sends one confirmation to each attendee in a qualified Saturday flight that is 2-5 days away, then records the notification so it cannot repeat. Example cron command:

```bash
0 12 * * 3 curl -fsS -X POST https://your-domain.example/api/tours/weekly-notify -H "x-tour-cron-key: $TOUR_CRON_KEY"
```

Stripe Checkout is built in for tour tickets. Set `STRIPE_SECRET_KEY` server-side (and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` if client-side Stripe features are added later). A tour signup creates a Stripe-hosted Checkout session at $20 per guest, so the site never collects card data.

Register `https://your-domain.example/api/stripe/webhook` in Stripe for the `checkout.session.completed` event, then set its signing secret as `STRIPE_WEBHOOK_SECRET`. The webhook marks the matching manager-visible tour reservation **Paid via Stripe**. Keep the test credentials in local/deployment secrets and switch to Stripe live keys only when production checkout is approved.

The reusable `/api/checkout` endpoint accepts only server-defined catalog items. Add a priced, approved item to `src/lib/stripe.ts` before exposing Checkout for merchandise, gift cards, or any other paid offering.


## Keg inventory

The public /kegs page reads the inventory published by a manager instead of contacting internal BrewOps. In **Manager Portal > Kegs**, upload the JSON exported from BrewOps /api/public/kegs-for-sale. The expected object has an items array; each item needs beerName, sixthBblKegs, fiftyLKegs, and optional totalBbl. You may also include backfillPickupNote and updatedAt.

The uploaded source is validated and atomically saved to data/keg-inventory.json (or KEG_INVENTORY_DATA_FILE). Keg order validation uses this same published inventory, so it works on the external site without any connection to the internal BrewOps network.

## Coupons

The protected media library includes **Coupons + blackouts**. Create a coupon there with the exact title, offer terms, and expiration date; it immediately appears at `/coupons`. Guests receive a unique downloadable coupon image with an embedded QR code. The bar validates it at `/coupon-validate`, which marks the code redeemed after a successful scan.

Coupons are automatically unavailable and invalid on Fridays and Saturdays. Add each special-event date in the manager or set `COUPON_SPECIAL_EVENT_DATES` as a comma-separated list. Set `COUPON_VALIDATION_KEY` in production and provide it only to approved bar staff. Live coupon records are stored in `data/coupons.json` unless `COUPON_DATA_FILE` is set.


### ShopNew cart and shipping

ShopNew stores products, variants, bonus settings, orders, and fulfillment metadata in PostgreSQL. Import the current public Shopify catalog with:

```bash
npm run db:migrate
npm run shop:import-shopify
```

The importer upserts Shopify products and variants, downloads product images into `public/media/shop-products/shopify`, and configures the Aviator Brewing sticker as the default bonus for merchandise totals over $20.

USPS rates are calculated through EasyPost when `EASYPOST_API_KEY` is configured. Without that key, checkout uses a ZIP-code and package-weight estimate until live carrier pricing is connected. Set `EASYPOST_API_KEY` and a strong random `SHOP_CHECKOUT_SIGNING_SECRET`. `EASYPOST_USPS_CARRIER_ACCOUNT_ID` is optional and restricts rate requests to one connected USPS carrier account. Product weights, the ship-from address, default parcel dimensions, bonus threshold, and bonus item are managed under Manager > Shop.

Stripe still handles payment. Configure `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`; the `checkout.session.completed` webhook marks ShopNew orders paid and decrements tracked inventory exactly once.
