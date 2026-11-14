# Shop Sales

**Manager → Products & Sales → Shop Sales** opens `/manager/shop-sales`. Choose a month, then **View report**. The report includes website shop merchandise and event tickets, item sales, shipping, recorded tax, gross recorded customer payments, items/variants sold, free bonus units, saved destination groups and an order ledger. Private-event, catering, feast, tour and bar/POS payments are outside this report.

**Download Excel** exports a real `.xlsx` workbook for the selected month, with Summary, Items sold, Orders, Destinations and Tax records sheets. Currency and percentages are numeric cells, headers can be filtered, and missing tax stays marked Not recorded. **Print report / Save PDF** prints the full month. **Summary CSV**, **Items CSV** and **Orders CSV** export totals, historical item/variant snapshots and the audit ledger. The screen shows 50 ledger rows at a time; exports include every matching order. CSV text is protected against spreadsheet formulas; Excel product names and notes are literal text, never formulas. Customer names, email addresses and street addresses are not included. The orders CSV retains the Stripe session reference for reconciliation.

The authenticated, private/no-store GET endpoint is `/api/manager/shop-sales?month=YYYY-MM`. Optional formats are `xlsx`, `print`, `summary-csv`, `items-csv`, `orders-csv` and `tax-csv`. A single database statement reads orders, item snapshots and exclusion counts consistently. The payment timestamp (`paid_at`) determines the month using `America/New_York` boundaries, including daylight-saving transitions. Order creation dates and current product prices do not determine paid sales. There is no 500-order cap.

Orders without recorded payment, `is_test_order` records, `test` statuses and `cs_test_` Stripe sessions are excluded. Processing/shipped orders with recorded payment remain included. Orders marked paid/processing/shipped without a payment timestamp are counted for review and excluded from totals. Bonuses have a separate quantity and contribute no sold units or item sales. Per-item order counts are distinct; the report footer uses the distinct monthly order count.

## Tax and refund records

Collected tax comes from the saved tax record when available, with explicit nonnegative `metadata.taxCents` / `tax_cents` values supported for older orders. Missing tax stays **Not recorded**, and the known recorded portion appears separately. Calculated historical tax and tax that was not collected have their own columns; they do not change original payments. The report reads the saved tax calculations and does not calculate a new tax charge during export. Unexplained payment differences, missing counties, item/subtotal mismatches and refund records remain flagged for review. See the main README's Shop sales tax records section for the separate record-creation workflow.

Sales and collected payments are **before refunds**. The shop order log does not sync refund/chargeback amounts or effective dates from Stripe. Cancelled/refunded orders with recorded payment stay visible in gross sales and are flagged for reconciliation; the report does not invent a deduction or refund date. Saved shipping destinations may be incomplete, especially for tickets and pickup orders. Review these gaps and reconcile with Stripe before using the worksheet for filing. Creating the report does not change checkout, tax collection, orders, inventory, payments or email.

Excel generation uses ExcelJS 4.4.0 with its UUID dependency pinned to patched CommonJS-compatible 11.1.1.

## Validation

`npm run test:shop-sales` requires `SHOP_SALES_TEST_DATABASE_URL` pointing to a fresh **local** `aviator_shop_test_*` database. It runs the existing migration and tests real report SQL and authenticated routes with fixtures, including 500+ orders, Eastern DST/leap-month boundaries, status/test exclusions, historical prices, bonus/ticket quantities, missing tax, refund review, exports, privacy, escaping, numeric Excel values, literal formula-like item names, complete workbook sheets, missing tax and unchanged stored records. External calls are blocked.

`npm run test:shop-sales-ui` uses the generated `/tmp/aviator-shop-sales-fixtures.json`, a production build and Playwright (`AVIATOR_PLAYWRIGHT_MODULE` can select an installed module). Manager APIs are intercepted; the test checks navigation, month selection, totals, Excel and CSV downloads, print/PDF, ledger pagination, empty/error/retry/race states and desktop/mobile layout without live mutations.
