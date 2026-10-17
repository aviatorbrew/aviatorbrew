The public Flight Plan PDF is committed as a finished asset; deploying the website requires no Python dependencies.

To update its layout or calculations locally:

```sh
python3 -m venv /tmp/aviator-pdf-tools
/tmp/aviator-pdf-tools/bin/pip install -r scripts/requirements-flight-plan-pdf.txt
/tmp/aviator-pdf-tools/bin/python scripts/update-ready-room-flight-plan.py
/tmp/aviator-pdf-tools/bin/python scripts/test-ready-room-flight-plan.py
npm run test:event-plans
```

Increment the simple version in `src/lib/ready-room-flight-plan.ts` for every published Flight Plan change, including content, menu, pricing, layout, and calculations: v.1.1 → v.1.2 → v.1.3. Do not use date-based versions. Its version is used by the website download label and URL, PDF metadata, and every page header and footer; regenerate the PDF to keep them in sync. The builder accepts `--input /path/to/original.pdf` to start from an untouched template.

`ready-room-flight-plan-calculations.js` uses Acrobat-compatible JavaScript. The builder embeds it in the calculated fields and sets the PDF calculation order. Menu quantities accept only a single digit from `1` through `9`; leave unused items blank. Both keystroke and commit validation reject invalid entries with “Enter a number from 1-9.” The keystroke handler checks the original paste text when the viewer crops input to the one-character field limit. Page 3 optional extra totals retain their separate 0–99 rules, including a zero premium-extra override. Food overages are charged above each package allowance. Optional totals on page 3 use the larger of that number and the menu overage, avoiding double billing. Pizza entries mirrored on pages 2 and 3 are counted once. Each shrimp or brisket crostini selection has its $3 premium upgrade in addition to any charge for exceeding the appetizer allowance.

The PDF test extracts the actual embedded actions and field defaults, exercises them in Node, verifies form structure, and creates `/tmp/ready-room-flight-plan-calculated-example.pdf` using a 55-guest Feast example with the updated appetizer menu ($4,180 food; $4,524.85 with tax and no deposit credit). Automatic calculations require a viewer supporting Acrobat form JavaScript; the first PDF page directs customers to Acrobat Reader.

Premium entrees replace included regular entrees for $2 per guest; the Dinner package includes two premium choices. An extra regular entree costs $5 per guest and an extra premium entree costs $7 total. In the PDF, regular entrees fill included slots first by default. The optional "Of extra entrees: premium" quantity on page 3 specifies how many selected premium choices are extras (enter 0 when all premium choices are included/replacements); it is part of the extra-entree total, not another charge. The manager form already separates included choices and extras explicitly. Pulled pork, country fried chicken and Pizza Bar appear only in the regular menu; they remain selectable with Dinner.

Chicken tenders are offered only as an entree on the current menu. Historical manager bookings retain their saved chicken-tender appetizer or Loaded Tots selections so menu edits do not invalidate an existing order. These legacy values are shown only for a slot that already contains them.
