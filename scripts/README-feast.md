# Feast by Aviator

Public builder: `/feast`. Intentionally absent from public navigation and sitemap, with `noindex, nofollow` metadata. This is an unlisted page, not an authenticated private page.

Manager: **Events & Hospitality → Feast Event**, `/manager/feast`. Uses existing manager authentication, PostgreSQL `website.settings`, the shared branded PDF renderer, existing Stripe Checkout helper and signed Stripe webhook. It does not change Ready Room packages, prices, calendars, inquiries or deposits.

## Before accepting payments

In **Seasonal menu, pickup & checkout settings**:

- Review the supplied launch prices, recipes, portions and seasonal availability.
- Confirm the sales-tax and prepared-food-tax rates (both rates apply to the itemized subtotal; enter an explicit zero where appropriate).
- Enter approved Feast-specific pickup, cancellation and payment policy text and its version. Ready Room deposit terms are not assumed to apply to take-home food orders.
- Configure actual pickup windows, order-by dates, total serving capacity and location/instructions. Windows on the same date must not overlap. Dates and deadlines use America/New_York; order-by dates close at the end of that calendar day.
- Confirm the turkey weights are raw bird weights and that actual yields support the planned 8/12 servings. Confirm size standards for shrimp, meatballs, crostini and sausage balls.
- Set a preorder deadline on prime rib or its pickup window and optionally cap each package's sales per window (guest counts for guest-priced feasts, package counts for fixed feasts).
- Enable online payment only when ready. Existing `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` must both be configured. The existing webhook endpoint `/api/stripe/webhook` now handles metadata item `aviator-feast` as well as its existing event/shop/tour cases.

Requests can be collected while checkout is disabled, but cannot be silently approved/charged without the required settings. Missing pickup/tax/policy/yield configuration is deliberately not invented.

## Workflow

1. Customer builds a menu and submits a request. The server recalculates from current settings; no client prices or totals are trusted. Submission is idempotent by request UUID. No payment or email is sent.
2. Customer saves the secure order link returned on the page. Its random token is stored only as a SHA-256 hash on the server and expires after 120 days. Token stays in the URL fragment and is sent in POST bodies, rather than server access logs/query strings. Staff can generate a replacement link; this revokes the previous link. No automatic email is sent by any Feast manager control.
3. Staff reviews/recalculates, confirms pickup capacity and approves. Only approved orders reserve capacity. Requests do not reserve inventory. Menu edits to unpaid orders create a new immutable revision and reset staff approval. Production notes are internal and may be updated independently.
4. Staff shares the private order link. Customer reviews the exact quoted revision and policies and records acceptance when entering checkout. Checkout charges the full quoted order total; this is not a Ready Room deposit.
5. Verified, matching Stripe payment or an explicit authorized full manual-payment record makes the customer payment receipt available. A Stripe success URL alone does not record payment. Manual payment does not contact Stripe.
6. Staff can move paid orders to Preparing, Ready and Completed, and print/download the internal kitchen order and customer receipt. Unpaid documents clearly say checkout summary, not paid receipt. Unapproved/unpaid kitchen sheets clearly say planning preview.

## Records and safety

Additive tables: `feast_orders`, `feast_order_revisions`, `feast_checkout_attempts`, `feast_payments`. Migrations are included in both existing migration paths. Prices, inclusions, production quantities, policies, taxes and pickup details are snapshotted at each revision. Existing orders are not silently repriced by settings changes.

Capacity approval/checkout checks serialize on the Feast settings row. Guest-based feasts charge actual purchased guest quantities, fixed turkey packages charge complete packages, and extras charge their own serving/container unit. Included items are not billed twice. Explicitly quoted services block online approval until separately resolved; they are never treated as free.

Stripe checkout creation uses a persistent attempt, provider idempotency key, fixed parameters and one active checkout per order. Active checkout must be verified/expired before menu edits, cancellation or manual payment. **Refresh payment status** verifies against Stripe; **Expire active checkout** closes open sessions where possible. A network-interrupted checkout creation is recovered by retrying the same customer checkout, not creating another attempt. Signed webhooks verify session, version, amount, currency and reference before recording a payment. Unique provider session/payment-intent constraints prevent duplicate payment records.

Cancellation retains all orders, revisions and payments and does not automatically refund or send mail. Paid menus cannot be overwritten; use a supplemental order for additional charges and retain notes for fulfillment adjustments. Refund processing remains an authorized payment-provider operation; do not pretend cancellation is a refund.

Kitchen amounts use supplied known portion/yield data only. No invented pan counts. Included sauces/accompaniments without a defined portion are listed for kitchen confirmation. No payment information or staff-only notes are exposed on customer receipts.

## Tests

Create a fresh disposable local PostgreSQL database named `aviator_feast_test_*`, then run:

```
FEAST_TEST_DATABASE_URL=postgresql://aviator_test@127.0.0.1:45833/aviator_feast_test_example npm run test:feast
```

The test refuses remote/production databases and nonempty website schemas. It stubs Stripe and mail and makes no real charges or deliveries. Covers launch calculations, fixed package recommendations, yield amounts, units, selection rules, disabled/seasonal items, immutable snapshots, authorization, secure links, policies, pickup-capacity concurrency, approval, idempotent checkout/webhooks, unsuccessful payments, manual records, kitchen privacy and PDFs. Existing `test:event-booking` verifies the shared webhook changes preserve event payment behavior.
