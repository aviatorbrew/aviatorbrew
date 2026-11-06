# Private-event kitchen production guide

Every saved event retains its seven top-box shortcuts while collapsed or expanded: Edit plan, Order Summary / Print, Menu Planning Sheet / PDF, Kitchen Production Sheet / Print, Write guest update, Cancel Event and Delete Event. Edit opens the Menu fields. Printing a summary can save the current edits through the existing handler; kitchen printing uses the saved record and is disabled while that record has unsaved edits. Cancel/Delete retain their existing confirmation dialogs and dirty-state checks. The top shortcuts do not bypass customer-email approval.

Kitchen sheets are internal HTML print views with one food item per table row. They include the saved guest count, date/time, food-out/appetizer service times, buffet selections, extra/repeated selections, dietary requests, wing sauce and food notes. A prominent pizza section includes each selected style, exact pizza notes, saved gluten-free whole-pizza request (including an explicit zero), and pizza service time. Financial details and staff payment notes are excluded. Canceled/draft/completed production status is retained. Optional omitted salads explicitly say No salad requested.

## Suggested planning assumptions

These are editable internal planning guides, not verified recipe yields, new menu prices, changed customer quantities or guaranteed appetites:

- All entrees combined: 8 oz of finished edible food per guest.
- All appetizers combined: 3 oz per guest.
- All sides combined: 8 oz per guest; 6 oz when a separate salad is selected.
- All separate salads combined: 2 oz per guest. A salad chosen in a side slot remains part of the side allocation.
- Reserve: 5%, applied once to each combined category allowance.
- Pan routing: sides use half-size S-22408 pans; salads and entrees use full-size S-22409 pans. A salad substituted into a side slot still uses a full salad pan. Food-specific pan overrides and separate full/half measurements are supported. Appetizers without a pan assignment retain planning-batch guidance.
- Initial estimated working fills: 5 lb per half side pan, 10 lb per full entree pan, 5 lb per full salad pan. These are planning assumptions, not manufacturer food-weight claims. Measured per-food fills take precedence. The last pan is kept partial, so the target food weight never increases to fill containers.
- Kitchen example: 18 lb of mac and cheese at the 5 lb estimated half-pan fill uses four half pans: 5 + 5 + 5 + 3 lb. At a measured 6 lb fill it instead uses three half pans. Tare empty pans, weigh cooked food, leave lid clearance, and split the same food target into another pan if volume is too high.

The category allowance is divided among all base and additional choices, weighted by repeated selections. Adding more choices changes the distribution, not the total guest count or a full-entree allowance for every choice. Actual explicit custom tray/piece/guest orders remain as entered and are listed separately; the chef must reconcile their weights with the buffet to avoid double production. Missing guest counts or entree choices produce chef-check warnings. The guide does not invent raw purchase amounts or cooking shrinkage.

`Event Settings → Catering packages, food & pricing → Kitchen production planning` uses the existing private-event settings record. Staff can edit combined portions, reserve and batch weight, and enter measured finished pounds separately for each full and half pan. Measured weights replace estimates for that food and pan size. Regular/gluten-free finished whole-pizza weights are blank until measured; no pie counts are invented. Unknown yields are clearly flagged. Whole-pizza counts round the combined regular-pizza allowance up once, then distribute that count among styles. Known gluten-free pizza weights are deducted first; no extra full entree allowance is added. Whole-pizza rounding and any insufficient style allowance are visible, including added weight above the base buffet target.

The starting weights are operational suggestions, not USDA adult-buffet recommendations. USDA's [Food Buying Guide](https://foodbuyingguide.fns.usda.gov/Home/About) distinguishes edible/finished yield from food as purchased, and its [Resource Center](https://foodbuyingguide.fns.usda.gov/Home/ResourceCenter) advises measuring or weighing serving-utensil quantities. Actual recipe/pan yields still require kitchen measurements.

## Validation

`npm run test:event-production` covers allowance conservation across guest counts and extra/repeated choices, salad substitution, finished weights/partial batches, single reserve, measured and unknown tray/pizza yields, gluten-free inclusion, combined pizza rounding, custom-order preservation, privacy, escaping and settings bounds. `npm run test:event-booking` uses the existing disposable local database harness and stubs mail/Stripe; it verifies admin settings save/read, production-route integration and unchanged quotes/proposal snapshots. `npm run test:event-production-ui` checks all top actions and dirty guards, print output, saved pizza instructions and measured-yield settings on desktop/mobile with mocked APIs. Set `AVIATOR_PLAYWRIGHT_MODULE` if Playwright is installed outside this app, and optionally `EVENT_EDITOR_UI_ORIGIN` for deployed assets. Tests do not mutate real orders, send customer mail or charge payments.

## Standard pan references

The linked ULINE [full-size S-22409](https://www.uline.com/Product/Detail/S-22409/Take-Out-Containers/Aluminum-Steam-Table-Pans-Full-Size) lists nominal outside dimensions of 21 × 13 × 3 inches and 343 fl oz capacity (10.72 qt). The [half-size S-22408](https://www.uline.com/Product/Detail/S-22408/Take-Out-Containers/Aluminum-Steam-Table-Pans-1-2-Size) lists 13 × 10 × 3 inches and 128 fl oz (4 qt). These are fluid volumes; the half model has approximately 37% of the full model’s listed volume. No automatic half-weight or raw-food conversion is made from these volumes. The kitchen sheet includes both product references, explicit pan counts/fill weights and a step-by-step packing guide. See README-event-food-cost.md for the separate internal cost panel.
