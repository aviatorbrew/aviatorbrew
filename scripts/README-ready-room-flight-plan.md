The public Flight Plan PDF is committed as a finished asset; deploying the website requires no Python dependencies.

To update its layout or calculations locally:

```sh
python3 -m venv /tmp/aviator-pdf-tools
/tmp/aviator-pdf-tools/bin/pip install -r scripts/requirements-flight-plan-pdf.txt
/tmp/aviator-pdf-tools/bin/python scripts/update-ready-room-flight-plan.py
/tmp/aviator-pdf-tools/bin/python scripts/test-ready-room-flight-plan.py
npm run test:event-plans
```

Bump `src/lib/ready-room-flight-plan.ts` when publishing a new PDF. Its version is used by the website download link, PDF metadata, and every page footer. The builder accepts `--input /path/to/original.pdf` to start from an untouched template.

`ready-room-flight-plan-calculations.js` uses Acrobat-compatible JavaScript. The builder embeds it in the calculated fields and sets the PDF calculation order. Menu quantities accept `X` for one or a whole-number quantity for repeated selections. Food overages are charged above each package allowance. Optional totals on page 3 use the larger of that number and the menu overage, avoiding double billing. Pizza entries mirrored on pages 2 and 3 are counted once. Each shrimp selection has its $3 premium upgrade in addition to any charge for exceeding the appetizer allowance.

The PDF test extracts the actual embedded actions and field defaults, exercises them in Node, verifies form structure, and creates `/tmp/ready-room-flight-plan-calculated-example.pdf` using the customer's 55-guest Feast example ($4,180 food; $4,524.85 with tax and no deposit credit). Automatic calculations require a viewer supporting Acrobat form JavaScript; the first PDF page directs customers to Acrobat Reader.
