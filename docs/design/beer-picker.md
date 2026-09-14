# Keg page beer picker

The picker uses reviewed beer descriptions and ABVs from page 1 of these repository-owned published drink menus:

- Hangar Bar, July 7, 2026: `public/media/menus/hangar-bar/drinks/1784992744058-Hangar-Beer-Menu-v38.pdf`
- TapHouse, June 25, 2026: `public/media/menus/taphouse/drinks/1785011506479-TapHouse-Beer-Menu-ver-168.pdf`
- Pizza Pub, June 25, 2026: `public/media/menus/pizza-pub/drinks/1785011703224-Pizza-Beer-Menu-v79.pdf`

`src/data/beer-picker.ts` stores paraphrased tasting notes, numeric ABVs, source links, and exact inventory-name aliases. Flavor groups are editorial classifications based on the menu descriptions, sections, and styles; they are not measured bitterness or sweetness scores. The lower alcohol group ends at 5.5%, the middle group is above 5.5% and below 7%, and the higher group begins at 7%.

Review the profiles and source links when drink menus change. This is a curated menu snapshot, not runtime PDF extraction. No nutrition or allergy claims are inferred. Menu nitro serving details are not treated as keg equipment promises.

`src/lib/beer-picker.ts` matches profiles to the live inventory using exact normalized names. Unknown beers, variants, sodas, seltzers, and THC drinks remain in the full inventory but are not assigned guessed beer profiles. Only packages with a configured price and positive available count enter the results. Filters are strict; an empty result never silently broadens them. Results are alphabetized, and choosing a beer preserves the selected keg-or-pack filter when opening the order form.

Run `node scripts/test-beer-picker.mjs` for menu-source, alias, flavor/ABV, and package-availability checks. Browser checks should also cover mobile radio controls, no-match/reset, expanding results, source PDF links, and choosing a beer into the existing order form without submitting a real order.
