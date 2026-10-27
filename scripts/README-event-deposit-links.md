# Private-event deposit reminders

In the event's **Customer proposals & deposit payments** box, **Resend Deposit Link** is beside **Resend proposal link**. Staff must save the event, use the current sent/approved proposal, approve the customer email and confirm the recipient/amount in the send dialog.

The reminder shows the outstanding quoted deposit in its subject, a large amount panel and an explicit payment button. Its secure link opens `/event-proposal?view=deposit` at the existing acceptance/payment section. Customers still agree to the exact policy/proposal version and explicitly start Stripe Checkout. Opening a link never creates a charge. The original proposal link and previous reminder links remain usable until the proposal expires or is withdrawn.

The amount comes from the proposal's immutable deposit requirement minus the greater of recorded manual credit and the verified Stripe ledger. Paid deposits, stale terms, expired/closed/unsent proposals, conflicting dates, invalid capacity, missing policies and missing staff approval block reminders. Existing Stripe Checkout, webhook verification, idempotency, availability and payment-credit rules remain in force.

`website.private_event_deposit_links` retains hashed expiring access tokens and reminder delivery metadata. No raw access token is returned in manager/customer JSON. Repeated requests with the same send UUID cannot send another email. Unverified delivery is marked unknown and is not automatically retried. The manager shows the latest reminder's timestamp/status. This additive table is included in both existing migration paths.

`src/lib/event-mail.ts` copies `events@aviatorbrew.com` on all private-event customer correspondence: inquiry acknowledgments, proposals, reminders, manager event updates/alternative dates and deposit/booking confirmations. Catering To Go acknowledgments also use the helper. Internal messages already addressed to the events mailbox do not add a duplicate CC. New verified-payment notifications reach the team as a CC on the exact customer confirmation instead of a second identical email; existing delivery history is retained.

Validation uses the existing `npm run test:event-booking` harness with a fresh disposable local `aviator_event_test_*` database, stubbed email and simulated Stripe. It tests reminder approval/authentication, amount/credit handling, duplicate requests, original-link/acceptance preservation, shared checkout, expired-checkout retries, paid and expired guards, failures and CC behavior. Browser fixtures intercept all send/payment APIs. Never use real customer messages or live charges for automated verification.

## Event confirmation after acceptance

An event becomes Confirmed when the latest staff-approved, emailed proposal has recorded customer or manual acceptance and its terms still match the saved future event. Venue capacity and calendar availability are checked under the existing booking lock. The deposit remains separately unpaid until a verified Stripe payment or authorized manual credit is recorded; confirming never creates a payment. Unsent drafts, unaccepted proposals, closed events, outdated terms and conflicts cannot acquire confirmation this way. Sending a previously manually accepted proposal also applies this rule after successful delivery.

The protected `confirm-accepted` proposal action applies the same checks to existing accepted/emailed records without sending email or altering acceptance, quote or payment history. Repeated calls do not change the event version again. Calendar entries open the saved event editor, including events originally created from website inquiries.
