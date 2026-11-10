# Veterans Day special, November 11, 2026

Customer page: `/events/veterans-day`. The existing Veterans Day skin links here during its **2026** rotation only. Later years retain the normal evergreen skin link. The dated special is a normal published **Special event** under Manager → Events, appearing in Brewery Events and the existing homepage event list. No separate food backend, ordering flow, coupon, discount eligibility or payment changes are introduced.

All meal names, descriptions and displayed prices come from this event’s existing `description`, editable in Manager → Events. Format each meal as a paragraph:

```
THE INFANTRYMAN'S MEATLOAF MRE | $17.76
Smoked meatloaf topped with brown gravy, mashed potatoes, green beans, a warm dinner roll, and a brownie.
```

Separate each meal and ordinary paragraph with a blank line. The dedicated page renders `NAME | $00.00` plus its following description as a meal card; other paragraphs remain introductory/closing text. There is no HTML interpretation. Unpublishing the event hides the menu page. Keep its date (`2026-11-11`) and details URL (`https://aviatorbrew.com/events/veterans-day`) to retain the page association. The supplied content, including prices and hashtags, is saved in `scripts/content/veterans-day-special-2026.json` as the one-time publication payload; it is not a runtime fallback or a second source of truth. After publication, portal edits control the live menu.

The payload uses **Show date only (no serving times advertised)**. This optional boolean is stored in the existing event JSON `details`, requires no migration, and avoids inventing hours. An internal `00:00` is used only for sorting/date storage, never displayed as a serving time. Timed events keep their current behavior; live music cannot use date-only display. Public lists and newsletter previews omit date-only start times. No emails are sent by creating/updating this event.

Upcoming-event lists stop advertising the special after November 11 using the existing event date filters. Its published detail page remains accessible for old links and clearly labels the menu as a past special afterward. It is not advertised as an annual meal offer.

Artwork reuses `public/images/skins/veterans-day-v3.webp` (original illustration, no hangar, distant plane). Location address comes from the existing Hangar Bar location record.

Validation: `npm run test:managed-events`, `npm run test:site-skins`, production build, and `VETERANS_SPECIAL_TEST_DATABASE_URL=postgresql://.../aviator_veterans_test_... AVIATOR_PLAYWRIGHT_MODULE=... npm run test:veterans-special-ui`. The UI test starts the real standalone app with disposable local Postgres, verifies all four supplied meals/prices, desktop/mobile layout, date-only display, manager price editing, anonymous-write rejection and unpublishing. Unrelated page mutations are blocked; no customer email, real order or charge is created.
