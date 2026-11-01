# Private Events office workflow

The existing event editor now groups its current saved status and history into **Event Order Flow**, with **Event Actions** immediately below. Save, direct staff approval, customer updates, cancellation, deletion, proposal drafting, acceptance and deposit reminders use their existing handlers, approval gates and confirmation prompts. Nothing advances automatically just because the flow is displayed.

Milestones come from the saved plan, latest proposal version, acceptance records and verified payment ledger. Customer acceptance, booking confirmation and deposit payment remain independent. A manually confirmed event can skip proposal milestones, while still showing an unpaid deposit. A revised proposal needs its own acceptance; earlier payments remain credited. An open/creating checkout or a paid provider attempt awaiting its ledger entry is pending, not a recorded payment. Existing saved payments and verified Stripe payments are not double counted.

The flow history uses recorded timestamps only. Older proposal versions remain visible. No confirmation timestamp is invented where the current event model has none. Manual payments are identified without inventing a receipt time.

**Print orders & receipts** is separate from actions and includes kitchen sheets, summaries, menu planning sheets, proposal previews/downloads and available deposit receipts. Printing and saving do not send customer emails. Staff must still approve customer email delivery and confirm its recipient.

Validate with `npm run test:event-plans`, the production build, and desktop/mobile manager browser checks using mocked records/providers. Do not issue real customer emails, payments or event mutations for automated testing.
