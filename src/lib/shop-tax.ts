import { getNcCountyTaxRate } from '@/lib/nc-sales-tax';
export const SHOP_TAX_RULE_VERSION = 'nc-shop-2026-11-14.1';
export const SHOP_TAX_SOURCES = [
    'https://www.ncdor.gov/taxes-forms/sales-and-use-tax/sales-and-use-tax-rates/current-sales-and-use-tax-rates',
    'https://www.ncdor.gov/taxes-forms/sales-and-use-tax/filing-requirements-payment-options/sourcing-sales-sales-and-use-tax',
    'https://www.ncdor.gov/sutb-2026pdf/open',
    'https://taxhelp.wake.gov/hc/en-us/articles/42592052855060-Prepared-Food-and-Beverage-Rules-and-Regulations',
];
export type ShopTaxCategory = 'general' | 'admission' | 'gift_card' | 'prepared_food' | 'qualifying_food' | 'review';
export type ShopTaxItem = {
    id?: string;
    name: string;
    quantity: number;
    unitPriceCents: number;
    isBonus: boolean;
    requiresShipping: boolean;
    taxCategory: ShopTaxCategory;
};
export type ShopTaxDestination = {
    country?: string;
    state?: string;
    county?: string;
    method?: string;
};
export type ShopTaxGroup = {
    country: string;
    state: string;
    county: string;
    category: ShopTaxCategory;
    reason: string;
    itemCents: number;
    shippingCents: number;
    taxableCents: number;
    rateBasisPoints: number;
    stateTaxCents: number;
    countyTaxCents: number;
    transitTaxCents: number;
    salesTaxCents: number;
    pfbTaxCents: number;
};
export type ShopTaxQuote = {
    ruleVersion: string;
    assessedAt: string;
    basis: 'exclusive' | 'inclusive';
    status: 'complete' | 'review';
    subtotalCents: number;
    shippingCents: number;
    taxableCents: number;
    exemptCents: number;
    unresolvedCents: number;
    salesTaxCents: number;
    pfbTaxCents: number;
    taxCents: number | null;
    totalCents: number;
    groups: ShopTaxGroup[];
    review: string[];
    useTaxReview: boolean;
    countyMethod: string;
    lines: ShopTaxItem[];
    sources: string[];
};
export function shopTaxCategory(category: string, productType: string, name = ''): ShopTaxCategory {
    const key = category.toLowerCase().replace(/[^a-z]/g, '');
    if (productType === 'ticket')
        return 'admission';
    if (key === 'giftcards' || /^e?-?gift (?:card|certificate)\b/i.test(name))
        return 'gift_card';
    if (['preparedfood', 'preparedmeals'].includes(key))
        return 'prepared_food';
    if (['qualifyingfood', 'groceries'].includes(key))
        return 'qualifying_food';
    if (['apparel', 'signs', 'glassware', 'beverages', 'merchandise'].includes(key))
        return 'general';
    return 'review';
}
const amount = (value: number) => { if (!Number.isSafeInteger(value) || value < 0)
    throw Error('Invalid amount in tax calculation.'); return value; };
function allocate(total: number, weights: number[]) {
    const sum = weights.reduce((a, b) => a + b, 0);
    if (!sum)
        return weights.map(() => 0);
    const shares = weights.map(w => Math.floor(total * w / sum));
    let remaining = total - shares.reduce((a, b) => a + b, 0);
    const order = weights.map((w, i) => ({ i, remainder: total * w / sum - shares[i] })).sort((a, b) => b.remainder - a.remainder || a.i - b.i);
    for (let i = 0; remaining > 0; i++, remaining--)
        shares[order[i % order.length].i]++;
    return shares;
}
export function calculateShopTax(items: ShopTaxItem[], shippingCents: number, destination: ShopTaxDestination = {}, soldAt = new Date(), basis: 'exclusive' | 'inclusive' = 'exclusive'): ShopTaxQuote {
    amount(shippingCents);
    const groups: ShopTaxGroup[] = [], review: string[] = [];
    const lines = items.map(i => ({ ...i })), subtotalCents = lines.reduce((sum, i) => sum + amount(i.isBonus ? 0 : amount(i.quantity) * amount(i.unitPriceCents)), 0);
    amount(subtotalCents);
    const shippingShares = allocate(shippingCents, lines.map(i => i.requiresShipping && !i.isBonus ? i.quantity * i.unitPriceCents : 0));
    if (shippingCents && !shippingShares.some(Boolean))
        review.push('Shipping cannot be allocated to a sold item.');
    const date = soldAt.toISOString();
    for (const [index, item] of lines.entries()) {
        if (item.isBonus || item.quantity * item.unitPriceCents === 0)
            continue;
        const atVenue = item.taxCategory === 'admission' || !item.requiresShipping;
        const country = atVenue ? 'US' : String(destination.country || '').toUpperCase(), state = atVenue ? 'NC' : String(destination.state || '').toUpperCase();
        const rate = getNcCountyTaxRate(atVenue ? 'Wake' : destination.county || '');
        let reason = '', county = atVenue ? 'Wake' : rate?.county || destination.county || '', bps = 0, localBps = 0, transitBps = 0, stateBps = 0, pfbBps = 0;
        const itemCents = item.quantity * item.unitPriceCents, shipping = shippingShares[index] || 0;
        if (item.taxCategory === 'gift_card')
            reason = 'Gift card: sales tax deferred until redemption';
        else if (!country || !state) {
            reason = 'Delivery location needs review';
            review.push(`${item.name}: delivery state/country missing.`);
        }
        else if (country !== 'US' || state !== 'NC')
            reason = 'Outside NC sales-tax scope';
        else if (item.taxCategory === 'review') {
            reason = 'Item tax classification needs review';
            review.push(`${item.name}: verify the catalog tax category.`);
        }
        else if (!rate) {
            reason = 'NC delivery county needs review';
            review.push(`${item.name}: verify the delivery county.`);
        }
        else if (date < '2026-07-01T00:00:00.000Z') {
            reason = 'Historical rate needs review';
            review.push(`${item.name}: rate before July 2026 needs verification.`);
        }
        else if (item.taxCategory === 'prepared_food' && county !== 'Wake') {
            reason = 'Local prepared-food tax needs review';
            review.push(`${item.name}: verify this county’s additional prepared-food tax rules.`);
        }
        else {
            reason = item.taxCategory === 'admission' ? 'Admission sourced to Wake venue' : 'Taxable NC sale';
            if (item.taxCategory === 'qualifying_food') {
                bps = 200;
                localBps = 200;
                reason = 'Qualifying food: 2% local tax';
            }
            else {
                bps = rate.rateBasisPoints;
                stateBps = 475;
                transitBps = rate.includesTransit ? 50 : 0;
                localBps = bps - stateBps - transitBps;
            }
            if (item.taxCategory === 'prepared_food' && county === 'Wake')
                pfbBps = 100;
        }
        const key = JSON.stringify([country, state, county, item.taxCategory, reason, bps, pfbBps]);
        let group = groups.find(g => (g as ShopTaxGroup & {
            key?: string;
        }).key === key);
        if (!group) {
            group = { country, state, county, category: item.taxCategory, reason, itemCents: 0, shippingCents: 0, taxableCents: 0, rateBasisPoints: bps, stateTaxCents: 0, countyTaxCents: 0, transitTaxCents: 0, salesTaxCents: 0, pfbTaxCents: 0 };
            Object.defineProperty(group, 'key', { value: key });
            Object.defineProperty(group, 'rates', { value: [stateBps, localBps, transitBps, pfbBps] });
            groups.push(group);
        }
        group.itemCents += itemCents;
        group.shippingCents += shipping;
    }
    let salesTaxCents = 0, pfbTaxCents = 0, taxableCents = 0, exemptCents = 0, unresolvedCents = 0;
    for (const g of groups) {
        const rates = (g as ShopTaxGroup & {
            rates: number[];
        }).rates, base = g.itemCents + g.shippingCents;
        if (g.rateBasisPoints) {
            g.taxableCents = basis === 'inclusive' ? Math.round(base * 10000 / (10000 + g.rateBasisPoints + rates[3])) : base;
            const sales = Math.round(g.taxableCents * g.rateBasisPoints / 10000), parts = allocate(sales, rates.slice(0, 3));
            [g.stateTaxCents, g.countyTaxCents, g.transitTaxCents] = parts;
            g.salesTaxCents = sales;
            g.pfbTaxCents = Math.round(g.taxableCents * rates[3] / 10000);
            taxableCents += g.taxableCents;
            salesTaxCents += sales;
            pfbTaxCents += g.pfbTaxCents;
        }
        else if (g.reason.includes("review"))
            unresolvedCents += base;
        else
            exemptCents += base;
    }
    const taxCents = review.length ? null : salesTaxCents + pfbTaxCents;
    return { ruleVersion: SHOP_TAX_RULE_VERSION, assessedAt: date, basis, status: review.length ? 'review' : 'complete', subtotalCents, shippingCents, taxableCents, exemptCents, unresolvedCents, salesTaxCents, pfbTaxCents, taxCents, totalCents: subtotalCents + shippingCents + (basis === 'exclusive' ? (taxCents ?? 0) : 0), groups, review: [...new Set(review)], useTaxReview: items.some(i => i.isBonus), countyMethod: destination.method || 'Saved/customer delivery county; local venue defaults to Wake', lines, sources: SHOP_TAX_SOURCES };
}
