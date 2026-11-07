# Shop event tickets and guest check-in

Uses the existing shop products, variants, orders, order items, ticket purchases, manager session and Stripe integration. No separate ticket store, payment gateway or customer administration system.

The NYE draft is product 1, slug `aviator-new-years-2026`, titled **Aviator New Years 2027**. Its configured date is December 31, 2026, 7 p.m. Eastern (`2027-01-01T00:00Z`); capacity 340; advance admission $20. Online sales close December 31 at 5 p.m. Eastern (`2026-12-31T22:00Z`); the door price is $25, subject to capacity. Raleigh Assassins plays 7–10 p.m.; LongLeaf Soul 10 p.m.–1 a.m. Admission requires a ticket. Product remains unpublished until staff publish it.

## Customer checkout and names

Checkout collects the purchaser's first/last name and exactly one first/last name per ticket. The first attendee initially uses the purchaser's name and can be edited for gift purchases. Multi-option orders combine guest counts per event, then allocate the names to the ordered ticket lines. Names accept Unicode letters, spaces, apostrophes, hyphens and initials; blank names, invalid input and guest counts that differ from ticket quantities are rejected before a payment link is created. Names remain in the existing order database and receipt; Stripe metadata receives order references, not guest lists.

Order-item `guest_names` and `ticket_details` snapshots preserve the names and event date/location purchased. On verified payment, names are copied into the existing ticket-purchase record. Later product edits do not rewrite paid snapshots. Legacy purchases without names stay intact and are explicitly labeled 'Name not collected' on the checklist.

## Capacity, payment and cutoff

Seats are reserved in a transaction, with product locks in ID order, before Stripe Checkout is created. Rechecks include publication, current ticket price and option, event details, guest count, remaining capacity, cumulative per-customer limit and the cutoff. Stripe sessions use the existing account, an order-specific idempotency key and card payment methods for tickets. A failed setup is cleaned up without issuing a payment link. Existing merchandise checkout remains supported, including shipping and bonus rules.

Paid ticket creation and reservation creation serialize on the same product locks. Pending ticket sessions continue to hold capacity past their local expiry until Stripe confirms expiration or payment. This prevents late webhooks from freeing a paid seat. Public counts exclude unavailable stock, and update on focus and every 30 seconds. 'Going fast' begins at 75% allocated; 'Almost sold out' at 90%. At zero available, held sessions are distinguished from a fully sold-out event. Sold-out messaging takes precedence over the door-price message. Merchandise cards retain their existing behavior.

New checkout requests close at the cutoff. The buy control also removes itself at the deadline on an open page. Stripe's [native Checkout expiry](https://docs.stripe.com/payments/checkout/managing-limited-inventory) requires at least 30 minutes. Native expiry is used where supported. On Render's persistent Node server, `src/instrumentation.ts` starts a timer that wakes for the next cutoff/expiry and explicitly expires remaining open sessions. It skips builds and can be disabled in tests with `SHOP_TICKET_WORKER_DISABLED=true`. Processing uses bounded concurrency, keeps uncertain provider states reserved and retries provider errors. The already-configured protected Feast follow-up job (every 15 minutes) also processes ticket cutoffs as a recovery path. No new service, billing plan, cron secret or Stripe credential is introduced.

The existing signed webhook verifies payment amount/currency against the saved order before completing a purchase. Duplicate notifications do not duplicate stock decrements, guest purchases or receipts. Failed/expired events do not create paid guests. Notification retries preserve the paid state and retry failed customer receipts without sending duplicate staff notifications. Ticket confirmations contain the guest names, date/location, order reference and admission instructions, and copy events@aviatorbrew.com. They do not show shipping promises for ticket-only purchases. The success screen checks the existing paid order; the return URL alone cannot confirm payment.

## Manager tools

Manager → Shop → **Ticket guest lists & check-in**. Each event shows sold, held and remaining counts plus **Print guest check-in list**, **Download CSV** (the existing purchaser export), and **Refresh guest lists**. The print view queries current paid purchases and sorts guests by last name, with one checkoff box per admission, purchaser/order reference and ticket option. Pending and test orders are excluded. Email addresses, phone numbers and payment amounts are omitted from the paper list. The endpoint requires manager authorization, is private/no-store and is not indexed.

Ticket editing also exposes **Door ticket price** and **Sales end (Eastern)**. The date inputs and server parse naive date/time values consistently as Eastern. Door sales are a staffed operation; the website shows their price after online sales close, while the printed total/capacity supports admission counting.

## Artwork

Built-in image-generation tool produced two original assets, with no real band-member photos or external band logos:

- `public/images/tickets/aviator-nye-2027-poster.png` (portrait)
- `public/images/tickets/aviator-nye-2027-banner.png` (landscape)

Both show the bands/times, date, $20 advance/$25 door prices, 5 p.m. cutoff and ticket-required instruction. Final prompts are recorded in `scripts/nye-2027-artwork-prompts.txt`. Originals remain under the image-generation tool's saved directory; project assets are copied into this repository.

## Validation

Use a fresh, disposable local database with an `aviator_shop_test_*` name. Run `DATABASE_URL=... npm run db:migrate`, then `SHOP_TICKET_TEST_DATABASE_URL=... npm run test:shop-tickets`. This exercises names/counts, multilingual names, exact cutoff boundaries, allocation/scarcity states, source pricing, provider verification, final-seat concurrency, late-webhook holds, failed/expired sessions, receipt retries, payment/notification idempotence, legacy data, manager authorization, private print output, Eastern date inputs, hidden drafts and merchandise regression. Stripe and mail are simulated.

`SHOP_TICKET_TEST_DATABASE_URL=... AVIATOR_PLAYWRIGHT_MODULE=... npm run test:shop-tickets-ui` uses that isolated fixture database and the local standalone build. Checkout is intercepted before any Stripe request; other nonessential mutations are mocked. It validates desktop/mobile forms, exact guest payloads, manager saves and print controls, PDF pagination for 340 guests, real paid-status lookup, live scarcity and the cutoff's sold-out/door-message priority.

Also run the existing event-booking and Feast suites against their own fresh disposable databases. No real charges, customer messages, orders or event records are used by automated tests.
