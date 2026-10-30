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

1. Customer builds a menu, chooses an eligible pickup, and verifies their inbox using a 6-digit emailed code before review/submission. The server requires the verified proof for the exact normalized email and consumes it for one order. It recalculates from current settings; no client prices/totals or verification flags are trusted. Submission is idempotent by request UUID and remains Under review. A request-copy email is sent to the customer and copied to events@aviatorbrew.com; no payment is taken.
2. Customer saves the secure order link returned on the page. Its random token is stored only as a SHA-256 hash on the server and expires after 120 days. Token stays in the URL fragment and is sent in POST bodies, rather than server access logs/query strings. Staff can generate a replacement link; this revokes the previous link. Approval emails use additional hashed, expiring links so the original customer link remains usable. Verification-code emails go only to the inbox owner; they are not copied to staff.
3. Staff reviews/recalculates, confirms pickup capacity and uses **Approve order & notify customer**, confirming the recipient and events-team copy. This records approval and sends the itemized approval/order link to the customer, copied to events@aviatorbrew.com. Delivery status and timestamp are visible in the order; failures retain approval and show a separate retry action. Only approved orders reserve capacity. Requests do not reserve inventory. Menu edits to unpaid orders create a new immutable revision and reset staff approval. Production notes are internal and may be updated independently.
4. The approval email supplies the private order link and payment instructions when checkout is configured. Customer reviews the exact quoted revision and policies and records acceptance when entering checkout. Checkout charges the remaining quoted order balance after recorded credits; this is not a Ready Room deposit.
5. Verified, matching Stripe payment or an explicit authorized full manual-payment record makes the customer payment receipt available. A Stripe success URL alone does not record payment. Manual payment does not contact Stripe.
6. Staff can move paid orders to Preparing, Ready and Completed, and print/download the internal kitchen order and customer receipt. Unpaid documents clearly say checkout summary, not paid receipt. Unapproved/unpaid kitchen sheets clearly say planning preview.

## Records and safety

Additive tables: `feast_orders`, `feast_order_revisions`, `feast_checkout_attempts`, `feast_payments`, `feast_email_verifications`, `feast_order_links`, `feast_message_deliveries`, `feast_order_flow`, `feast_verified_customers`, `feast_email_sessions`. Migrations are included in both existing migration paths. Prices, inclusions, production quantities, policies, taxes and pickup details are snapshotted at each revision. Existing orders are not silently repriced by settings changes.

Capacity approval/checkout checks serialize on the Feast settings row. Guest-based feasts charge actual purchased guest quantities, fixed turkey packages charge complete packages, and extras charge their own serving/container unit. Included items are not billed twice. Feast orders are pickup only. Delivery, buffet setup and serving staff are removed from customer and manager choices; new requests for these services are rejected. Existing quoted order revisions remain intact.

Stripe checkout creation uses a persistent attempt, provider idempotency key, fixed parameters and one active checkout per order. Active checkout must be verified/expired before menu edits, cancellation or manual payment. **Refresh payment status** verifies against Stripe; **Expire active checkout** closes open sessions where possible. A network-interrupted checkout creation is recovered by retrying the same customer checkout, not creating another attempt. Signed webhooks verify session, version, amount, currency and reference before recording a payment. Unique provider session/payment-intent constraints prevent duplicate payment records.

Cancellation retains all orders, revisions and payments and does not automatically refund or send mail. Paid menus cannot be overwritten; use a supplemental order for additional charges and retain notes for fulfillment adjustments. Refund processing remains an authorized payment-provider operation; do not pretend cancellation is a refund.

Kitchen amounts use supplied known portion/yield data only. No invented pan counts. Included sauces/accompaniments without a defined portion are listed for kitchen confirmation. No payment information or staff-only notes are exposed on customer receipts.

## Tests

Create a fresh disposable local PostgreSQL database named `aviator_feast_test_*`, then run:

```
FEAST_TEST_DATABASE_URL=postgresql://aviator_test@127.0.0.1:45833/aviator_feast_test_example npm run test:feast
```

The test refuses remote/production databases and nonempty website schemas. It stubs Stripe and mail and makes no real charges or deliveries. Covers launch calculations, fixed package recommendations, yield amounts, units, selection rules, disabled/seasonal items, immutable snapshots, authorization, secure links, policies, pickup-capacity concurrency, approval, idempotent checkout/webhooks, unsuccessful payments, manual records, kitchen privacy and PDFs. Existing `test:event-booking` verifies the shared webhook changes preserve event payment behavior.

## Canned beer

Drinks includes canned beers from the existing published Beverage Sales inventory. Six-pack prices are the current case price multiplied by 6 and divided by cans per case (legacy exports use 24-can cases). Both 12 oz and 16 oz formats are supported. Stock views are alternatives, never added together; whole six-packs are calculated from actual cans where provided. Hidden, unavailable and nonbeer products are excluded. In-stock beers without a positive case price are visible but cannot be selected. Manage names, availability and case prices in the existing Beverage Sales screen, not a duplicate Feast menu.

Orders allow up to five different beers, with separate six-pack quantities. Two can sizes of the same beer count as one beer. The server rechecks the limit, prices and stock; approved future orders reserve six-packs across pickup windows. Customers confirm age 21+ and valid photo ID at pickup. Packaged-beer sales/additional tax settings must be explicitly configured before a beer order has a final total or can be approved for checkout. No tax rate is assumed. Food-only calculations retain their existing settings. Issued prices and quantities stay snapshotted.

## Ordering window and inbox verification

New customer and staff-entered Feast orders require **96 full hours** between submission and pickup. Thursday/Friday submissions cannot use the following Monday/Tuesday pickup, even when 96 hours would otherwise be satisfied. Later Mondays/Tuesdays remain available. The rule uses America/New_York, actual elapsed hours across DST, and server time. Pickup dates/times are filtered/validated in the customer form and checked again on the server. Package and pickup-window cutoff dates remain additional restrictions.

A change to guest count, food quantities/selections or pickup date/time starts a new procurement review and must meet the same notice rules. Contact/notes-only edits do not reset this window. Existing records/payments stay intact; legacy orders with no lead-time stamp are not retroactively rejected just for notes edits. Capacity and expiry are still checked at approval/checkout using existing rules.

Verification codes expire in 10 minutes, permit five guesses and are throttled per email/IP (60-second resend cooldown, three sends/15 minutes and ten/day per email; ten/15 minutes and forty/day per IP). Stored code hashes incorporate the high-entropy browser session secret, which is itself stored only as a hash. Successful verification returns a random hashed proof valid for 30 minutes and bound to one email/order. Changing the email clears client verification; stale in-flight responses cannot verify a new address. Manager-created phone/manual orders are marked as staff-entered, never falsely inbox-verified.

Email jobs are unique per order/version/kind. Approval retries require manager authentication, explicit recipient confirmation, the current version and exact delivery ID. Sent jobs cannot send again. SMTP exceptions are marked uncertain and are not retried automatically; staff must verify delivery and explicitly confirm a retry. Additional order-access tokens are hashed and expire after 120 days. Internal production notes are never included in customer emails. Existing approval/payment configuration gates remain: real pickup windows, tax rates, approved Feast policies and any required yield confirmations must be configured; these values are not invented or enabled by this update.

## FEAST order flow and Stripe payment follow-ups

The manager order's **FEAST ORDER FLOW** box shows the current stage, remaining balance, warning deadline and chronological status/email/payment history. The separate **FEAST ACTIONS** section immediately beneath the flow contains approval, payment links/email requests, payment refresh, cancellation and production controls. Notes and email retries are grouped there; printing/downloads remain separately at the bottom. Approval returns a prominent copy/open payment link in Actions. Customers land at the order's payment section, review the exact order/policies, then explicitly enter Stripe Checkout for the outstanding balance. Copying/opening a link never charges a card. Checkout product names, PaymentIntent descriptions and metadata identify **FEAST**; the existing Stripe account, signed webhooks and payment ledger are reused.

A successful payment-request email starts the timer. If the full balance remains unpaid after **48 hours**, a warning email supplies another payment link. If still unpaid **24 hours after successful warning delivery**, the order is cancelled and a cancellation email is sent. All order correspondence copies events@aviatorbrew.com. Delivery failures/uncertainty and provider verification problems appear in the flow; an unsent warning cannot trigger cancellation. Customer payments are verified against Stripe before warning/cancellation, active sessions must expire safely before cancellation, and paid or unresolved payments cannot be falsely cancelled. A late verified payment is retained and flagged for staff review; it never silently reopens a cancelled order. No automatic refund is performed.

Tables/columns: additive `feast_order_flow` audit history and order payment-request/warning/cancellation timestamps. Email jobs remain unique per order/revision/kind. Retries, duplicate webhook notifications and overlapping scheduled runs cannot duplicate paid records or routine email sends. Changed/reopened orders receive a new revision and fresh approval/payment window; historical quotes, emails, payments and flow events remain. Existing sent approvals acquire no retroactive timer unless a new payment request is explicitly sent. Partial recorded credits reduce the Stripe balance.

Scheduled processing uses the Render cron **aviatorbrew-feast-payment-followups**, every 15 minutes (`*/15 * * * *`, UTC), Virginia, running `node scripts/process-feast-payments.mjs`. It calls the website's protected `/api/internal/feast-payments` endpoint with `FEAST_AUTOMATION_KEY`; only the SHA-256 hash is stored in the website settings key `feast_automation_key_hash`. Cron also needs `FEAST_AUTOMATION_URL=https://aviatorbrew.com/api/internal/feast-payments`. Do not copy database, Stripe or SMTP credentials into cron or commit any secret. The cron build can use `node --version`; the runner has no package dependencies. The job exits after its bounded run; provider calls time out, failed verifications hold the order for review, and later ticks recover pending cancellation notices.

`npm run test:feast` in a disposable local database covers real route/service integration using simulated Stripe/email: balance/credit calculations, FEAST payment naming, strong UI links, approval delivery, 48/24-hour timing, warnings/cancellations, provider expiry/unavailability/pending states, late/duplicate payments, delivery recovery, revision resets, no retroactive cancellations and scheduler authentication/concurrency. Browser checks intercept every mutation; never use real customer orders or live charges for automated tests.

## Wake County tax configuration

Feast reuses managed tax rates: combined state/local/transit sales tax **7.25%** and Wake prepared food and beverage (PFB) tax **1%**. Rates remain editable in seasonal settings. Live rates were copied from existing private-event catering settings on October 30, 2026 and checked against NCDOR/Wake County. Unopened take-home canned beer six-packs carry **7.25% sales tax, 0% PFB** under Wake's off-premises sealed beverage exemption.

New quotes snapshot separate sales-tax/PFB amounts and the combined total. Builder, customer links, manager, emails and checkout summaries/receipts show both tax rows; Stripe charges the snapshotted total less recorded payment credits. Tax is calculated independently on the subtotal, never compounded. Existing issued quotes/payments retain their original totals and legacy combined-tax display; staff must explicitly save/recalculate an unpaid order to apply new settings. Kitchen reports omit prices/taxes.

Sources: [NCDOR rates](https://www.ncdor.gov/taxes-forms/sales-and-use-tax/sales-and-use-tax-rates/current-sales-and-use-tax-rates), [Wake PFB rules](https://taxhelp.wake.gov/hc/en-us/articles/42592052855060-Prepared-Food-and-Beverage-Rules-and-Regulations).

## Immediate manager approval and status updates

The approval button first commits the validated approval and queues its version-specific email. The manager applies the saved Approved state immediately, then sends the queued customer notification through the existing authorized delivery endpoint. Sending/failure/setup messages appear inside the order flow. Email success alone never indicates payment. If the browser closes between approval and sending, the existing 15-minute job recovers only explicitly queued, pending approval emails. It does not resend sent/uncertain/failed mail or start timers on historic approvals. The successful email still starts the payment window.

The visible order list (or the expanded order) refreshes its saved details, flow and delivery ledger every three seconds and on returning to the tab. Refreshes are authenticated reads, pause during staff mutations and never overwrite unsaved notes or trigger Stripe checkout/email. Verified full payment changes its list label to Paid; partial credit remains Approved. Production/cancelled statuses remain visible. The list includes explicit pickup date/time after its package name. Approval blockers remain enforced on the server and appear beside the flow, including missing pickup windows, required turkey yield confirmation, policies and recalculation for missing tax totals.

## Saved verified email and newsletter signup

A successful Feast inbox code check saves the normalized email in `feast_verified_customers` and confirms it in the existing `newsletter_subscribers` list (source `feast-verified` for new subscribers). The verification screen/button and code email disclose newsletter signup and unsubscribe options. This adds no duplicate newsletter admin and sends no additional confirmation/welcome/campaign email. Existing subscriber source, name, phone, confirmation and welcome history are preserved. Enrollment is recorded once; remembered visits and repeat code verification never re-add a subscriber removed via the existing unsubscribe flow. Forgetting verification does not alter newsletter preferences.

The `aviator_feast_email` cookie is HttpOnly, Secure on HTTPS/production, SameSite=Lax and scoped to `/api/feast`, valid for one year. Only its random token hash is stored in `feast_email_sessions`. A valid device cookie can restore the saved email and mint a fresh short-lived, one-order proof without another code. The customer-facing page auto-fills a remembered address; a different email/device requires its own inbox check. The submit endpoint renews a valid remembered proof automatically, so a long visit does not require another code. Known email addresses, newsletter membership and client flags are never accepted as ownership proof.

The restore/forget routes enforce the existing same-origin checks. Revoked/expired cookies cannot restore verification; “Forget saved verification” revokes only the current device. Remembered proofs are throttled and excluded from verification-code email rate limits. No historical unverified contacts or staff-entered addresses are treated as inbox verified. Existing order/payment snapshots are untouched.
