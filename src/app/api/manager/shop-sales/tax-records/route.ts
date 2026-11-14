import { NextRequest, NextResponse } from 'next/server';
import { isManager } from '@/lib/manager-auth';
import { createHistoricalShopTaxRecords } from '@/lib/shop-tax-records';
import { getNcCountyTaxRate } from '@/lib/nc-sales-tax';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
    const headers = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' };
    if (!isManager(request))
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    try {
        const body = await request.json(), orderId = Number(body.orderId || 0), county = typeof body.county === 'string' ? getNcCountyTaxRate(body.county)?.county : undefined;
        if (!(Number.isSafeInteger(orderId) && orderId > 0) && body.allSales !== true)
            throw Error('Choose an order or all paid shop sales.');
        if (body.county && (!county || !orderId))
            throw Error('Choose a valid NC county and order.');
        const result = await createHistoricalShopTaxRecords({ orderId: orderId || undefined, county });
        return NextResponse.json(result, { headers });
    }
    catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not create tax records.' }, { status: 400, headers });
    }
}
