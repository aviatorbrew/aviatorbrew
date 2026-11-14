import { NextRequest, NextResponse } from 'next/server';
import { prepareShopCart, type ShopCartRequestItem } from '@/lib/shop';
import { normalizeShippingAddress, verifyShippingToken, type ShopShippingAddress } from '@/lib/shop-shipping';
import { createShopTaxQuote } from '@/lib/shop-tax-quote';
import { requestBodyExceeds } from '@/lib/server-file-response';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
    const headers = { 'Cache-Control': 'no-store' };
    try {
        if (requestBodyExceeds(request, 50000))
            return NextResponse.json({ error: 'Cart is too large.' }, { status: 413, headers });
        const body = await request.json() as {
            items?: ShopCartRequestItem[];
            address?: Partial<ShopShippingAddress>;
            shippingToken?: string;
        };
        const cart = await prepareShopCart(body.items || []);
        let address: ShopShippingAddress | undefined, shipping = 0;
        if (cart.requiresShipping) {
            address = normalizeShippingAddress(body.address || {});
            shipping = verifyShippingToken(String(body.shippingToken || ''), cart, address).amountCents;
        }
        return NextResponse.json(await createShopTaxQuote(cart, shipping, address), { headers });
    }
    catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not calculate tax.' }, { status: 400, headers });
    }
}
