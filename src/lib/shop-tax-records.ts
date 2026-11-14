import { createHash } from 'node:crypto';
import { withDatabase } from '@/lib/database';
import { calculateShopTax, shopTaxCategory, SHOP_TAX_RULE_VERSION, type ShopTaxItem, type ShopTaxQuote } from '@/lib/shop-tax';
import { resolveShopNcCounty } from '@/lib/shop-tax-county';
import type { PoolClient } from 'pg';
export type ShopTaxRecord = {
    ruleVersion: string;
    source: 'checkout' | 'historical-assessment';
    status: 'complete' | 'review';
    collectedTaxCents: number | null;
    uncollectedTaxCents: number | null;
    quote: ShopTaxQuote;
    createdAt?: string;
};
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const selection = `SELECT o.id,o.paid_at,o.status,o.is_test_order,o.stripe_session_id,o.subtotal_cents,o.shipping_cents,o.amount_total_cents,o.metadata,o.shipping_address,
 COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id::text,'name',i.product_name,'quantity',i.quantity,'unitPriceCents',i.unit_price_cents,'isBonus',i.is_bonus,'requiresShipping',(i.ticket_details='{}'::jsonb AND (o.shipping_address ? 'state' OR o.shipping_cents>0 OR COALESCE(v.requires_shipping,false))),'category',COALESCE(c.name,''),'productType',CASE WHEN i.ticket_details<>'{}'::jsonb THEN 'ticket' ELSE COALESCE(p.product_type,'merchandise') END) ORDER BY i.id) FROM website.shop_order_items i LEFT JOIN website.shop_products p ON p.id=i.product_id LEFT JOIN website.shop_categories c ON c.id=p.category_id LEFT JOIN website.shop_product_variants v ON v.id=i.variant_id WHERE i.order_id=o.id),'[]'::jsonb) AS items
 FROM website.shop_orders o`;
function inputHash(row: Record<string, any>) { return hash([row.id, new Date(row.paid_at).toISOString(), row.subtotal_cents, row.shipping_cents, row.amount_total_cents, row.shipping_address, row.metadata.shopTaxQuote || row.items, row.metadata.taxCents ?? null]); }
export async function persistShopTaxRecord(client: PoolClient, row: Record<string, any>, record: ShopTaxRecord, inputSignature = inputHash(row)) {
    const value = { ...record, createdAt: undefined }, calculationHash = hash(value);
    const result = await client.query(`INSERT INTO website.shop_tax_records(order_id,input_hash,calculation_hash,rule_version,basis,data) VALUES($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT(order_id,input_hash,calculation_hash,rule_version,basis) DO NOTHING RETURNING id`, [row.id, inputSignature, calculationHash, record.ruleVersion, record.source, JSON.stringify(value)]);
    return result.rowCount === 1;
}
export async function saveCollectedShopTax(client: PoolClient, row: Record<string, any>) {
    const quote = row.metadata?.shopTaxQuote as ShopTaxQuote | undefined;
    if (!quote || quote.status !== 'complete' || quote.taxCents === null)
        return;
    if (quote.totalCents !== Number(row.amount_total_cents) || quote.subtotalCents !== Number(row.subtotal_cents) || quote.shippingCents !== Number(row.shipping_cents))
        throw Error('Stored checkout tax does not match the order.');
    await persistShopTaxRecord(client, row, { ruleVersion: quote.ruleVersion, source: 'checkout', status: 'complete', collectedTaxCents: quote.taxCents, uncollectedTaxCents: 0, quote });
}
export async function createHistoricalShopTaxRecords(input: {
    orderId?: number;
    county?: string;
} = {}) {
    const rows = await withDatabase(async (client) => (await client.query(selection + ` WHERE o.paid_at IS NOT NULL AND o.is_test_order=false AND o.status<>'test' AND left(COALESCE(o.stripe_session_id,''),8)<>'cs_test_'${input.orderId ? ' AND o.id=$1' : ''} ORDER BY o.paid_at,o.id`, input.orderId ? [input.orderId] : [])).rows);
    const result = { checked: rows.length, created: 0, unchanged: 0, review: 0, assessedTaxCents: 0, collectedTaxCents: 0 };
    for (const row of rows) {
        if (input.county && String(row.shipping_address?.state).toUpperCase() !== "NC")
            throw Error("County correction is only available for NC delivery orders.");
        const signature = inputHash(row), existing = await withDatabase(async (client) => (await client.query('SELECT data FROM website.shop_tax_records WHERE order_id=$1 AND input_hash=$2 AND rule_version=$3 ORDER BY id DESC LIMIT 1', [row.id, signature, SHOP_TAX_RULE_VERSION])).rows[0]?.data as ShopTaxRecord | undefined);
        const missingCounty = existing?.quote.groups.some(g => g.state === 'NC' && !g.county);
        if (existing?.status === 'complete' && !missingCounty && !input.county) {
            result.unchanged++;
            result.assessedTaxCents += existing.quote.taxCents || 0;
            result.collectedTaxCents += existing.collectedTaxCents || 0;
            continue;
        }
        let record: ShopTaxRecord;
        if (row.metadata?.shopTaxQuote) {
            const quote = row.metadata.shopTaxQuote as ShopTaxQuote;
            if (quote.totalCents !== Number(row.amount_total_cents) || quote.subtotalCents !== Number(row.subtotal_cents) || quote.shippingCents !== Number(row.shipping_cents))
                throw Error('Stored checkout tax does not match the order.');
            record = { ruleVersion: quote.ruleVersion, source: 'checkout', status: quote.status, collectedTaxCents: quote.taxCents, uncollectedTaxCents: 0, quote };
        }
        else {
            const items: ShopTaxItem[] = row.items.map((i: Record<string, any>) => ({ id: i.id, name: i.name, quantity: i.quantity, unitPriceCents: i.unitPriceCents, isBonus: i.isBonus, requiresShipping: i.requiresShipping, taxCategory: shopTaxCategory(i.category, i.productType, i.name) }));
            const address = { ...row.shipping_address, ...(input.county ? { county: input.county } : {}) };
            let county = address.county || '', method = county ? 'Saved/manager-confirmed delivery county' : 'Business/venue default';
            if (!input.county && String(address.state).toUpperCase() === 'NC' && items.some(i => i.requiresShipping)) {
                const resolved = await resolveShopNcCounty(address);
                if (resolved) {
                    county = resolved.county;
                    method = resolved.method;
                }
                else {
                    method = 'NC delivery county unresolved';
                }
            }
            const quote = calculateShopTax(items, Number(row.shipping_cents), { ...address, county, method }, new Date(row.paid_at));
            if (quote.subtotalCents !== Number(row.subtotal_cents)) {
                quote.status = 'review';
                quote.taxCents = null;
                quote.review.push('Historical item lines do not match the saved subtotal.');
            }
            const recorded = row.metadata?.taxCents ?? row.metadata?.tax_cents, explicit = typeof recorded === 'number' && Number.isSafeInteger(recorded) && recorded >= 0 ? recorded : null;
            const collected = explicit ?? (Number(row.amount_total_cents) === Number(row.subtotal_cents) + Number(row.shipping_cents) ? 0 : null);
            if (collected === null) {
                quote.status = 'review';
                quote.review.push('The original payment has an unexplained adjustment; verify tax collected.');
            }
            record = { ruleVersion: SHOP_TAX_RULE_VERSION, source: 'historical-assessment', status: quote.status, collectedTaxCents: collected, uncollectedTaxCents: quote.taxCents !== null && collected !== null ? Math.max(0, quote.taxCents - collected) : null, quote };
        }
        const inserted = await withDatabase(async (client) => {
            await client.query('BEGIN');
            try {
                const current = (await client.query(selection + ' WHERE o.id=$1 FOR UPDATE OF o', [row.id])).rows[0];
                if (!current || inputHash(current) !== signature)
                    throw Error('An order changed during tax review. Refresh and try again.');
                const saved = await persistShopTaxRecord(client, current, record, signature);
                await client.query('COMMIT');
                return saved;
            }
            catch (e) {
                await client.query('ROLLBACK');
                throw e;
            }
        });
        if (inserted)
            result.created++;
        else
            result.unchanged++;
        if (record.status === 'review')
            result.review++;
        result.assessedTaxCents += record.quote.taxCents || 0;
        result.collectedTaxCents += record.collectedTaxCents || 0;
    }
    return result;
}
