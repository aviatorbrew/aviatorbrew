# À la carte event menus in the manager portal

In Private Events → Current event → Menu & Pricing, choose **À la carte menu — no buffet package** or add an item with the **À la carte menu builder**. The full current event catalog is available: regular/premium appetizers and entrées, sides, salads, pizzas, dessert display and coffee service, including manager-only selections. Unavailable items remain visible but cannot be added. Filter by category or search by name.

Set the billing unit (guest serving, individual portion, full tray, piece or whole pizza), quantity, agreed unit price and preparation notes. The configured buffet add-on rate is shown only as a reference; an explicit à la carte price is required. No tray prices, portions, yields or full-meal prices are invented. Duplicate choices can be separate lines. Off-menu dishes can be entered with **+ Add order item**.

Items are ordinary custom Food or Drinks rows in **Order summary & custom charges**, with their billing unit in the name. Quantities and prices stay fixed when guest count or menu configuration changes. With no buffet package, adding an item sets the service plan to à la carte without a buffet base charge or buffet guest minimum. If a buffet package is selected, these are additional charges and the package stays selected. Saved proposals remain frozen; save edits and create a revised proposal before obtaining new acceptance.

Kitchen sheets retain food quantities and preparation notes. Internal food-cost estimates use known matching costs where quantities support the cost basis, and mark unmatched/unverified costs incomplete. Saving and printing send no email; proposal emailing still requires explicit approval.

Validation: `npm run test:event-plans`, `npm run test:event-food-cost`, `npm run test:event-production`, and `npm run test:event-editor-ui` with mocked APIs.
