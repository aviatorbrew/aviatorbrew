# Appetizer events in the manager portal

In Private Events, create or open an event and choose **Meetings & custom events → Appetizers & drinks — no buffet package** under Food & beverage plan. The appetizer picker is also available for other meetings/custom plans without a buffet package.

Choose an available regular, premium or manager-only appetizer, its billing unit, quantity and agreed unit price, then click **+ Add appetizer**. Guest servings default to the event guest count and the current additional-appetizer price plus the premium upgrade when applicable. Staff can override each price. Tray/piece pricing requires an explicit staff-entered price; no tray prices, portions, yields or pan counts are invented. Duplicate choices are allowed as separate lines.

Each appetizer is an ordinary custom Food order row with its billing unit in the name. Staff can edit/remove these rows in **Order summary & custom charges**. Quantities and quoted prices stay as entered when guest count or menu configuration changes. Adding food to a no-food meeting changes its service plan to appetizers; an existing custom service plan is retained. Other custom charges, contacts, notes and payments remain intact. No buffet base price or 30-guest buffet minimum is added; existing venue approval/capacity rules still apply.

Save the event, then **Create proposal draft** to preview/download the existing itemized proposal PDF. Creating or saving sends no email. **Approve & Email Proposal** retains the existing staff approval and recipient confirmation. Issued versions remain frozen. Changes to appetizer quantities/prices require a revised proposal and new acceptance through the existing workflow.

Validation: `npm run test:event-plans` and `npm run test:event-booking` (fresh disposable local `aviator_event_test_*` database only). The booking harness uses simulated Stripe and stubbed mail. Browser fixtures intercept saves/draft APIs and never send customer email or charge a card.
