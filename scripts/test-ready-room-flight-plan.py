#!/usr/bin/env python3
"""Validate the actual PDF field graph and execute its embedded JavaScript with Node."""
from pathlib import Path
import json
import re
import subprocess
import tempfile

from pypdf import PdfReader, PdfWriter

ROOT = Path(__file__).resolve().parent.parent
pdf_path = ROOT / 'public/documents/ready-room-event-flight-plan.pdf'
reader = PdfReader(pdf_path)
assert len(reader.pages) == 5
version = re.search(r'readyRoomFlightPlanVersion = "([^"]+)"', (ROOT / 'src/lib/ready-room-flight-plan.ts').read_text()).group(1)
assert version in reader.metadata.title
fields = {str(ref.get_object()['/T']): ref.get_object() for page in reader.pages for ref in page.get('/Annots', []) if '/T' in ref.get_object()}
field_pages = {str(ref.get_object()['/T']): index for index, page in enumerate(reader.pages) for ref in page.get('/Annots', []) if '/T' in ref.get_object()}
assert fields['customer_signature']['/FT'] == '/Sig'
order = [str(ref.get_object()['/T']) for ref in reader.trailer['/Root']['/AcroForm']['/CO']]
assert len(set(order)) == len(order) == 11
source = (ROOT / 'scripts/ready-room-flight-plan-calculations.js').read_text()
data = {'fields': {}, 'order': order, 'documentScripts': []}
for name, field in fields.items():
    actions = {key[1:]: str(value.get_object()['/JS']) for key, value in field.get('/AA', {}).items()}
    value = field.get('/V', '')
    if field.get('/FT') == '/Btn':
        value = str(value).lstrip('/')
    data['fields'][name] = {'value': str(value), 'flags': int(field.get('/Ff', 0)), 'actions': actions, 'page': field_pages[name]}
    if name in order:
        assert int(field.get('/Ff', 0)) & 1
        assert actions['C'].startswith(source)
    if (field_pages[name] == 1 and name.startswith(('app_', 'entree_', 'premium_', 'side_', 'salad_'))) or name in ('pizza_included_entree', 'pizza_extra_entree'):
        assert field['/MaxLen'] == 1
        assert 'V' in actions and 'K' in actions
    elif name in ('extra_side', 'extra_salad', 'extra_premium_entree'):
        assert field['/MaxLen'] == 2
        assert 'V' in actions
assert int(fields['entree_time'].get('/MaxLen', 100)) >= 8, 'Serving time must not have a quantity character limit'
for name in ('summary_bar', 'summary_other', 'summary_deposit'):
    assert not int(fields[name].get('/Ff', 0)) & 1
names = reader.trailer['/Root']['/Names']['/JavaScript']['/Names']
for i in range(1, len(names), 2):
    data['documentScripts'].append(str(names[i].get_object()['/JS']))
for page in reader.pages:
    assert page.extract_text().count('v.' + version) >= 2, 'Version must appear in both header and footer'
    version_positions = []
    page.extract_text(visitor_text=lambda text, cm, tm, font, size: version_positions.append(tm[5]) if 'v.' + version in text else None)
    assert any(y > 600 for y in version_positions) and any(y < 40 for y in version_positions)
menu_text = reader.pages[1].extract_text()
for label in ('APPETIZERS', 'ENTREES', 'PREMIUM ENTREES', 'REPLACE +$2 / PERSON', 'Additional premium entree: $7 / person total.'):
    assert label in menu_text, label
assert '/TU' in fields['extra_premium_entree']
assert 'app_pulled_pork' not in fields and 'premium_pulled_pork' not in fields
assert fields['app_hush_puppies']['/Rect'][0] < fields['entree_pulled_pork']['/Rect'][0]
result = subprocess.run(['node', str(ROOT / 'scripts/test-ready-room-flight-plan.mjs')], input=json.dumps(data), text=True, capture_output=True, check=True)
report = json.loads(result.stdout)
print(report['message'])
# Generate a filled example from the tested embedded scripts for print/layout review.
writer = PdfWriter(clone_from=pdf_path)
values = report['exampleValues']
for name in ('package_brewery_social', 'package_aviator_feast', 'package_ready_room_dinner'):
    values[name] = '/' + values[name]
for page in writer.pages:
    page_values = {str(ref.get_object()['/T']): values[str(ref.get_object()['/T'])] for ref in page.get('/Annots', []) if ref.get_object().get('/FT') in ('/Tx', '/Btn')}
    writer.update_page_form_field_values(page, page_values, auto_regenerate=False)
example = Path(tempfile.gettempdir()) / 'ready-room-flight-plan-calculated-example.pdf'
writer.write(example)
print('Filled calculation example:', example)
