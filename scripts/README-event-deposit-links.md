# Private-event deposit reminders

The **Proposal & payments** tab has separate **Customer proposal** and **Payments** cards. **Resend Deposit Link** is in Payments while a deposit remains due. A paid deposit shows **Deposit paid** instead. Staff review the recipient, amount and email approval together in the send dialog. **Resend proposal link** and **Record customer acceptance** are in Customer proposal. The optional proposal email note remains in its send dialog.

The current link expiration is shown once in Customer proposal. **Revise proposal** opens a separate **New proposal expires** field for a new draft; changing that field does not alter an issued proposal. Failed email retries also require approval in their confirmation dialog. Event cancellation, deletion and other administrative controls are under **Activity → Other event actions**.

In the deposit send dialog, choose **Send a staff copy instead of emailing the customer** and enter an `@aviatorbrew.com` address to send the same working deposit email to a staff member. The confirmation shows the selected recipient. This preserves the customer contact, quote and original links. Staff copies retain the same expiry, payment rules, approval and delivery tracking.

The reminder shows the outstanding quoted deposit in its subject, a large amount panel and an explicit payment button. Its secure link opens `/event-proposal?view=deposit` at the existing acceptance/payment section. Customers still agree to the exact policy/proposal version and explicitly start Stripe Checkout. Opening a link never creates a charge. The original proposal link and previous reminder links remain usable until the proposal expires or is withdrawn.

The amount comes from the proposal's immutable deposit requirement minus the greater of recorded manual credit and the verified Stripe ledger. Paid deposits, stale terms, expired/closed/unsent proposals, conflicting dates, invalid capacity, missing policies and missing staff approval block reminders. Existing Stripe Checkout, webhook verification, idempotency, availability and payment-credit rules remain in force.

`website.private_event_deposit_links` retains hashed expiring access tokens and reminder delivery metadata. No raw access token is returned in manager/customer JSON. Repeated requests with the same send UUID cannot send another email. Unverified delivery is marked unknown and is not automatically retried. The manager shows the latest reminder's timestamp/status. This additive table is included in both existing migration paths.

`src/lib/event-mail.ts` copies `events@aviatorbrew.com` on all private-event customer correspondence: inquiry acknowledgments, proposals, reminders, manager event updates/alternative dates and deposit/booking confirmations. Catering To Go acknowledgments also use the helper. Internal messages already addressed to the events mailbox do not add a duplicate CC. New verified-payment notifications reach the team as a CC on the exact customer confirmation instead of a second identical email; existing delivery history is retained.

Validation uses the existing `npm run test:event-booking` harness with a fresh disposable local `aviator_event_test_*` database, stubbed email and simulated Stripe. It tests reminder approval/authentication, amount/credit handling, duplicate requests, original-link/acceptance preservation, shared checkout, expired-checkout retries, paid and expired guards, failures and CC behavior. Browser fixtures intercept all send/payment APIs. Never use real customer messages or live charges for automated verification.

## Event confirmation after acceptance

An event becomes Confirmed when the latest staff-approved, emailed proposal has recorded customer or manual acceptance and its terms still match the saved future event. Venue capacity and calendar availability are checked under the existing booking lock. The deposit remains separately unpaid until a verified Stripe payment or authorized manual credit is recorded; confirming never creates a payment. Unsent drafts, unaccepted proposals, closed events, outdated terms and conflicts cannot acquire confirmation this way. Sending a previously manually accepted proposal also applies this rule after successful delivery.

The protected `confirm-accepted` proposal action applies the same checks to existing accepted/emailed records without sending email or altering acceptance, quote or payment history. Repeated calls do not change the event version again. Calendar entries open the saved event editor, including events originally created from website inquiries.

## Recording manual payments

In the **Payments** card, enter the cumulative **Total manual payments received ($)** and choose **Save payment credit**. This field excludes verified Stripe payments, which are shown separately and included automatically in total credit. Saving a payment updates the current customer proposal, deposit amount still due, remaining event balance, manager/customer proposal PDF downloads and future emailed proposal attachments. Both manual and Stripe credits appear when present. The issued menu, prices and acceptance evidence remain unchanged; a payment update does not create a new proposal or send an email. Previously downloaded or emailed files remain historical copies.

## Bar/POS ticket and customer receipt

**Preview & Print Receipt** in **Payments** opens the event receipt in a new tab. Choose letter paper or the 80-mm receipt layout, then **Print Receipt / Save PDF**. The same document lists itemized food, drinks, room/service charges, discounts and taxes, manual and verified Stripe credits, total received, and balance due. It includes the event/customer reference and a POS check-number line. Deposits already received are payment credits, not additional charges; hosted bar limits are not charges. Payment status shows unpaid, partially paid, paid in full or a credit balance using recorded funds only.

The authenticated, no-store receipt endpoint reads the saved event, latest quote and verified payment total in one database statement. Issued quote prices stay fixed even when catalog prices change. Saved events without a proposal use the saved order and current catalog. Unsaved changes disable the print link, and changed quoted event terms require a revised proposal before printing. Printing never sends email, starts checkout, enters anything into the POS, or records a payment. Staff-only, kitchen and preparation notes and processor references are excluded from this customer copy.
