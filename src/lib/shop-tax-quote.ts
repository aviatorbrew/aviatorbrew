import { createHmac, timingSafeEqual } from 'node:crypto';
import { calculateShopTax, SHOP_TAX_RULE_VERSION, type ShopTaxQuote } from '@/lib/shop-tax';
import { resolveShopNcCounty } from '@/lib/shop-tax-county';
import { shopCartFingerprint, type ShopShippingAddress } from '@/lib/shop-shipping';
import type { PreparedShopCart } from '@/lib/shop';
const secret = () => { const value = process.env.SHOP_CHECKOUT_SIGNING_SECRET || process.env.STRIPE_SECRET_KEY; if (!value)
    throw Error('Tax quote signing is not configured.'); return value; };
const fingerprint = (cart: PreparedShopCart, shipping: number, address: Partial<ShopShippingAddress>) => JSON.stringify([SHOP_TAX_RULE_VERSION, shopCartFingerprint(cart), cart.items.map(i => [i.variantId, i.taxCategory, i.requiresShipping, i.ticketLocationSlug]), shipping, address.country || '', address.state || '', address.county || '', address.street1 || '', address.city || '', address.zip || '']);
export async function createShopTaxQuote(cart: PreparedShopCart, shipping: number, address: Partial<ShopShippingAddress> = {}) {
    let county = address.county || '', method = 'Local Wake venue';
    if (cart.requiresShipping && address.state?.toUpperCase() === 'NC') {
        const resolved = await resolveShopNcCounty(address);
        if (!resolved && cart.merchandiseItems.some(i => i.requiresShipping && i.taxCategory !== 'gift_card'))
            throw Error('We could not identify your NC delivery county. Choose your county and calculate shipping again.');
        county = resolved?.county || '';
        method = resolved?.method || 'County unresolved; gift-card tax deferred';
    }
    const quote = calculateShopTax(cart.items.map(i => ({ id: String(i.variantId), name: i.productName, quantity: i.quantity, unitPriceCents: i.unitPriceCents, isBonus: i.isBonus, requiresShipping: i.requiresShipping, taxCategory: i.taxCategory || 'review' })), shipping, { ...address, county, method });
    if (quote.status !== 'complete' || quote.taxCents === null)
        throw Error('This order needs a tax review. Please contact Aviator before paying.');
    const payload = Buffer.from(JSON.stringify({ exp: Date.now() + 15 * 60000, fingerprint: fingerprint(cart, shipping, address), quote })).toString('base64url'), signature = createHmac('sha256', secret()).update(payload).digest('hex');
    return { quote, token: payload + '.' + signature };
}
export function verifyShopTaxQuote(token: string, cart: PreparedShopCart, shipping: number, address: Partial<ShopShippingAddress> = {}) {
    const [payload, signature] = token.split('.');
    if (!payload || !signature || signature.length !== 64)
        throw Error('Refresh the tax total before checkout.');
    const expected = createHmac('sha256', secret()).update(payload).digest('hex');
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected)))
        throw Error('The tax quote is invalid. Refresh the totals.');
    let data;
    try {
        data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    }
    catch {
        throw Error('Refresh the tax total before checkout.');
    }
    if (!data.exp || data.exp < Date.now() || data.fingerprint !== fingerprint(cart, shipping, address) || data.quote?.status !== 'complete' || data.quote?.ruleVersion !== SHOP_TAX_RULE_VERSION)
        throw Error('Your order changed. Refresh the tax total before checkout.');
    return data.quote as ShopTaxQuote;
}
