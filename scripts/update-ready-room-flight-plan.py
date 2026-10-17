#!/usr/bin/env python3
"""Update the fillable PDF in place. Install scripts/requirements-flight-plan-pdf.txt first."""
from io import BytesIO
from pathlib import Path
import json
import argparse
import re

from pypdf import PdfReader, PdfWriter
from pypdf.generic import ArrayObject, BooleanObject, DictionaryObject, FloatObject, NameObject, NumberObject, TextStringObject
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parent.parent
PDF = ROOT / 'public/documents/ready-room-event-flight-plan.pdf'
VERSION = re.search(r'readyRoomFlightPlanVersion = "([^"]+)"', (ROOT / 'src/lib/ready-room-flight-plan.ts').read_text()).group(1)
CALCULATIONS = (ROOT / 'scripts/ready-room-flight-plan-calculations.js').read_text()
PAPER = (247 / 255, 241 / 255, 229 / 255)
NAVY = (7 / 255, 30 / 255, 48 / 255)
INK = (20 / 255, 54 / 255, 72 / 255)
GOLD = (231 / 255, 182 / 255, 106 / 255)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=PDF, help="Optional original template PDF")
    args = parser.parse_args()
    writer = PdfWriter(clone_from=args.input)
    acro = writer._root_object['/AcroForm'].get_object()
    fields = {str(ref.get_object()['/T']): ref for page in writer.pages for ref in page.get('/Annots', []) if '/T' in ref.get_object()}

    def action(code):
        return writer._add_object(DictionaryObject({NameObject('/S'): NameObject('/JavaScript'), NameObject('/JS'): TextStringObject(code)}))

    def text_field(page_index, name, rect, readonly=False):
        if name in fields:
            return fields[name].get_object()
        field = DictionaryObject({
            NameObject('/Type'): NameObject('/Annot'), NameObject('/Subtype'): NameObject('/Widget'), NameObject('/FT'): NameObject('/Tx'),
            NameObject('/T'): TextStringObject(name), NameObject('/Rect'): ArrayObject([FloatObject(n) for n in rect]),
            NameObject('/F'): NumberObject(4), NameObject('/Ff'): NumberObject(1 if readonly else 0),
            NameObject('/Q'): NumberObject(0 if readonly else 1), NameObject('/DA'): TextStringObject('/Helv 7 Tf 0 g'),
            NameObject('/BS'): DictionaryObject({NameObject('/W'): NumberObject(0)}), NameObject('/V'): TextStringObject(''),
            NameObject('/P'): writer.pages[page_index].indirect_reference,
        })
        ref = writer._add_object(field)
        writer.pages[page_index]['/Annots'].append(ref)
        acro['/Fields'].append(ref)
        fields[name] = ref
        return field

    text_field(1, 'summary_selection_extras', [26.4, 86.4, 470.4, 99], readonly=True)
    text_field(2, 'extra_side', [33.6, 94.08, 43.2, 103.68])
    text_field(2, 'extra_salad', [178.56, 114.72, 188.16, 124.32])
    text_field(2, 'extra_premium_entree', [178.56, 94.08, 188.16, 103.68])
    text_field(1, 'app_brewer_fries', [33.6, 393.6, 43.2, 403.2])
    text_field(1, 'app_sweet_potato_fries', [33.6, 372, 43.2, 381.6])
    for old_name, new_name in [('app_loaded_tots', 'app_tater_tots'), ('app_brisket_crostini', 'premium_app_brisket_crostini')]:
        ref = fields.pop(old_name, fields.get(new_name))
        ref.get_object()[NameObject('/T')] = TextStringObject(new_name)
        fields[new_name] = ref
    # Keep appetizers and entrees in separate columns, with dedicated premium groups.
    shrimp_ref = fields.pop('app_shrimp_cocktail', fields.get('premium_app_shrimp_cocktail'))
    shrimp = shrimp_ref.get_object()
    shrimp[NameObject('/T')] = TextStringObject('premium_app_shrimp_cocktail')
    shrimp[NameObject('/Rect')] = ArrayObject([FloatObject(n) for n in [33.6, 328.8, 43.2, 338.4]])
    fields['premium_app_shrimp_cocktail'] = shrimp_ref
    for name in ['entree_brisket', 'entree_flat_iron', 'premium_country_chicken', 'premium_pulled_pork', 'app_chicken_tenders']:
        if name not in fields:
            continue
        removed = fields.pop(name)
        for page in writer.pages:
            page[NameObject('/Annots')] = ArrayObject([ref for ref in page.get('/Annots', []) if ref != removed])
        acro[NameObject('/Fields')] = ArrayObject([ref for ref in acro['/Fields'] if ref != removed])
    for name, x, y in [('premium_flat_iron', 33.6, 264), ('premium_brisket', 33.6, 242.4), ('premium_herb_chicken', 257.76, 264), ('premium_bourbon_chicken', 257.76, 242.4)]:
        fields[name].get_object()[NameObject('/Rect')] = ArrayObject([FloatObject(n) for n in [x, y, x + 9.6, y + 9.6]])
    quantity_names = [name for name in fields if name.startswith(('app_', 'entree_', 'premium_', 'side_', 'salad_'))]
    quantity_names += ['pizza_included_entree', 'pizza_extra_entree', 'extra_hour', 'extra_app', 'extra_entree', 'extra_side', 'extra_salad', 'extra_dessert', 'extra_coffee', 'extra_premium_entree']
    validate_quantity = '''var value = String(event.value).replace(/^\\s+|\\s+$/g, "");
if (value !== "" && !/^[xX]$/.test(value) && !/^\\d{1,2}$/.test(value)) {
  event.rc = false; app.alert("Enter X for one selection, or a whole-number quantity from 0 to 99.");
}'''
    for name in quantity_names:
        field = fields[name].get_object()
        field[NameObject('/MaxLen')] = NumberObject(2)
        field[NameObject('/DA')] = TextStringObject('/Helv 7 Tf 0 g')
        field[NameObject('/TU')] = TextStringObject('X = one selection; enter 2, 3, etc. for repeats. Quantities above the package allowance are charged per guest.')
        field.setdefault(NameObject('/AA'), DictionaryObject())[NameObject('/V')] = action(validate_quantity)
    for name in ['extra_app', 'extra_entree', 'extra_side', 'extra_salad']:
        fields[name].get_object()[NameObject('/TU')] = TextStringObject('Optional TOTAL extra selections. Menu overages are already counted automatically; the larger total applies, without double-counting.')
    fields['extra_premium_entree'].get_object()[NameObject('/TU')] = TextStringObject('Optional: how many selected premium entrees are extras, not replacements? Leave blank to fill included slots with regular entrees first; enter 0 if every premium entree is included or a replacement. This is part of the total extra entree count, not an additional count.')
    guest = fields['guest_count'].get_object()
    guest.setdefault(NameObject('/AA'), DictionaryObject())[NameObject('/V')] = action('var v=String(event.value).replace(/^\\s+|\\s+$/g, ""); if(v!=="" && (!/^\\d+$/.test(v) || Number(v)>10000)){event.rc=false;app.alert("Enter a whole-number guest count.");}')
    calculated = ['summary_selection_extras', 'summary_guests', 'summary_package_rate', 'summary_package_subtotal', 'summary_specialty_pizza', 'summary_food_extras', 'summary_event_hours', 'summary_subtotal', 'summary_tax', 'summary_pfb_tax', 'summary_balance']
    for name in calculated:
        field = fields[name].get_object()
        field[NameObject('/Ff')] = NumberObject(int(field.get('/Ff', 0)) | 1)
        field[NameObject('/AA')] = DictionaryObject({NameObject('/C'): action(CALCULATIONS + '\nevent.value = aviFlightValue(this, ' + json.dumps(name) + ');')})
        field[NameObject('/TU')] = TextStringObject('Calculated from the package, guest count, menu quantities and extras. Change the source fields to update.')
    acro[NameObject('/CO')] = ArrayObject([fields[name] for name in calculated])

    def overlay(page_index):
        buffer = BytesIO()
        page = writer.pages[page_index]
        c = canvas.Canvas(buffer, pagesize=(float(page.mediabox.width), float(page.mediabox.height)), invariant=1)

        def box(x, y, width, height, color=PAPER):
            c.setFillColorRGB(*color)
            c.rect(x, y, width, height, fill=1, stroke=0)

        def text(x, y, value, size=7.4, color=INK, bold=False):
            c.setFillColorRGB(*color)
            c.setFont('Helvetica-Bold' if bold else 'Helvetica', size)
            c.drawString(x, y, value)

        box(195, 17, 160, 17, NAVY)
        c.setFont('Helvetica-Bold', 6.6)
        c.setFillColorRGB(*GOLD)
        c.drawCentredString(248.4, 22, 'v.' + VERSION)
        if page_index == 0:
            box(26.4, 48, 444, 17)
            text(26.4, 54.5, 'For automatic totals, open in Adobe Acrobat Reader. Click outside each field after entering a value.', 6.7)
        if page_index == 1:
            box(26.4, 563, 444, 17, NAVY)
            text(26.4, 568, 'Enter X for one selection, or 2, 3... for repeated foods.', 9, (0.75, 0.82, 0.85))
            box(26.4, 524, 444, 24)
            text(26.4, 537, 'Selections beyond your package are charged automatically for every guest.', 7.8)
            text(26.4, 526.5, 'Extra app $3 / person | entree $5 | side $3 | salad $3. Premium upgrades listed below.', 7.5)
            # Replace the combined raster heading and menu with clearly divided sections.
            box(26.4, 211, 444, 311)
            for x, width, heading in [(26.4, 214, 'APPETIZERS'), (251.5, 218.9, 'ENTREES')]:
                box(x, 500, width, 22, (20 / 255, 54 / 255, 78 / 255))
                text(x + 7.2, 507, heading, 11, PAPER, True)
            c.setStrokeColorRGB(0.75, 0.77, 0.73)
            c.setLineWidth(.6)
            c.line(246, 302, 246, 522)

            def menu_item(name, x, y, label, subtitle=''):
                field = fields[name].get_object()
                field[NameObject('/Rect')] = ArrayObject([FloatObject(n) for n in [x, y, x + 9.6, y + 9.6]])
                c.setStrokeColorRGB(*INK)
                c.setLineWidth(.7)
                c.setFillColorRGB(*PAPER)
                c.rect(x - .6, y - .6, 10.8, 10.8, fill=1, stroke=1)
                text(x + 16, y + 2.5, label, 8.1, bold=True)
                if subtitle:
                    text(x + 16, y - 7.8, subtitle, 6.1)

            for name, y, label, subtitle in [
                ('app_hush_puppies', 480, 'Hush Puppies', ''),
                ('app_tater_tots', 458.4, 'Tater Tots', ''),
                ('app_chips_salsa', 436.8, 'Chips & Salsa', ''),
                ('app_caprese_skewers', 415.2, 'Caprese Skewers', ''),
                ('app_brewer_fries', 393.6, 'Brewer Fries', ''),
                ('app_sweet_potato_fries', 372, 'Sweet Potato Fries', ''),
            ]:
                menu_item(name, 33.6, y, label, subtitle)
            for name, y, label, subtitle in [
                ('entree_pizza_bar', 480, 'Aviator Pizzeria Pizza Bar', 'Choose details on page 3'),
                ('entree_pulled_pork', 458.4, 'Aviator Pulled Pork BBQ', ''),
                ('entree_country_chicken', 436.8, 'Country Fried Chicken Cutlet', ''),
                ('entree_meatloaf', 415.2, 'Bacon-Wrapped Meatloaf', ''),
                ('entree_tenders', 393.6, 'Aviator Chicken Tenders', ''),
                ('entree_wings', 372, 'Aviator Smoked Wings', 'Dry Rub, Aviator, Buffalo, BlackMamba or Monster'),
            ]:
                menu_item(name, 257.76, y, label, subtitle)
            box(26.4, 345.6, 214, 17, (20 / 255, 54 / 255, 78 / 255))
            text(33.6, 350.6, 'PREMIUM APPETIZERS  +$3 / PERSON', 7, GOLD, True)
            menu_item('premium_app_shrimp_cocktail', 33.6, 330.8, 'Shrimp Cocktail')
            menu_item('premium_app_brisket_crostini', 33.6, 312.8, 'Brisket Crostini')
            box(26.4, 284, 444, 22, (20 / 255, 54 / 255, 78 / 255))
            text(33.6, 291, 'PREMIUM ENTREES', 11, PAPER, True)
            text(322, 291, 'REPLACE +$2 / PERSON', 8.5, GOLD, True)
            menu_item('premium_flat_iron', 33.6, 264, 'Grilled Flat Iron Steak', 'collard green chimichurri')
            menu_item('premium_brisket', 33.6, 242.4, 'Aviator Beef Brisket')
            menu_item('premium_herb_chicken', 257.76, 264, 'Herb-Roasted Chicken')
            menu_item('premium_bourbon_chicken', 257.76, 242.4, 'Bourbon-Glazed Chicken')
            text(26.4, 225, 'Replace an included regular entree: +$2 / person. Dinner includes two premium entrees.', 7.1)
            text(26.4, 214.5, 'Additional premium entree: $7 / person total. Additional regular entree: $5 / person.', 7.1)
            box(26.4, 86.4, 444, 12.6, (0.91, 0.94, 0.95))
        if page_index == 2:
            # Clarify the mirrored Pizza Bar fields so an extra is not charged twice.
            box(27.5, 490, 307, 24, (122 / 255, 56 / 255, 40 / 255))
            text(35, 506, 'Mark Pizza Bar on page 2; repeat here only to identify included vs. extra.', 6.8, PAPER)
            text(35, 495, 'The same Pizza Bar selection is counted once across both pages.', 6.8, PAPER)
            box(360, 495, 108, 17, (122 / 255, 56 / 255, 40 / 255))
            text(364.5, 500.5, 'Extra +$5 / guest', 8.6, bold=True)
            box(237, 175.2, 233.4, 17, (20 / 255, 54 / 255, 78 / 255))
            text(242, 181, 'FOOD AUTO-COUNTS; OPTIONAL TOTALS BELOW', 6.1, GOLD, True)
            box(26.4, 91, 291, 79)
            for name, x, y, label in [
                ('extra_hour', 33.6, 156, 'Additional hour ($100 / hour)'),
                ('extra_app', 33.6, 135.36, 'Extra appetizers ($3 / guest)'),
                ('extra_entree', 33.6, 114.72, 'Extra entrees ($5 / guest)'),
                ('extra_side', 33.6, 94.08, 'Extra sides ($3 / guest)'),
                ('extra_dessert', 178.56, 156, 'Dessert ($6 / guest)'),
                ('extra_coffee', 178.56, 135.36, 'Coffee ($3 / guest)'),
                ('extra_salad', 178.56, 114.72, 'Extra salads ($3 / guest)'),
                ('extra_premium_entree', 178.56, 94.08, 'Of extra entrees: premium ($7)'),
            ]:
                c.setStrokeColorRGB(*INK)
                c.setLineWidth(.7)
                c.setFillColorRGB(*PAPER)
                c.rect(x - .6, y - .6, 10.8, 10.8, fill=1, stroke=1)
                text(x + 16, y + 2, label, 7.1, bold=True)
            # Explain optional food totals in the existing extra-quantities label.
            box(26.4, 82, 214, 10)
            text(32.64, 85.5, 'OPTIONAL EXTRA NOTES / PREMIUM EXTRAS: BLANK = AUTO', 5.1)
        if page_index == 4:
            box(342, 500, 128.4, 20, (20 / 255, 54 / 255, 78 / 255))
            text(346, 507.8, "AUTOMATIC TOTALS", 6.8, GOLD, True)
            box(26.4, 524, 444, 24)
            text(26.4, 537, 'Blue fields recalculate automatically. Enter bar, other charges and deposit / credit manually.', 7.3)
            text(26.4, 526.5, 'Per person: app $3, regular entree $5, side / salad $3. Premium entree: replacement +$2 / extra $7.', 7)
            box(26.4, 343.2, 129, 19.2)
            text(26.4, 350.4, 'Food extras / premium / services', 7.2, bold=True)
        c.save()
        page.merge_page(PdfReader(buffer).pages[0])

    for page_index in range(len(writer.pages)):
        overlay(page_index)
    for page in writer.pages:
        values = {str(ref.get_object()['/T']): str(ref.get_object().get('/V', '')) for ref in page.get('/Annots', []) if ref.get_object().get('/FT') == '/Tx'}
        writer.update_page_form_field_values(page, values, auto_regenerate=False)
    acro[NameObject('/NeedAppearances')] = BooleanObject(False)
    names = writer._root_object.get('/Names')
    if names:
        names.get_object().pop('/JavaScript', None)
    names = writer._root_object.setdefault(NameObject('/Names'), DictionaryObject()).get_object()
    names[NameObject('/JavaScript')] = DictionaryObject({NameObject('/Names'): ArrayObject([TextStringObject('AviatorFlightPlanInit'), action('this.calculate = true; this.calculateNow();')])})
    writer.add_metadata({'/Title': 'Ready Room Event Flight Plan v.' + VERSION, '/Subject': 'Version ' + VERSION + ' - automatic package overages and quantity-based food extras', '/Creator': 'Aviator Brewing Company - scripts/update-ready-room-flight-plan.py'})
    temporary = PDF.with_suffix('.updated.pdf')
    writer.write(temporary)
    temporary.replace(PDF)
    print('Updated', PDF.relative_to(ROOT), 'v.' + VERSION, '(' + str(len(fields)) + ' fields)')


if __name__ == '__main__':
    main()
