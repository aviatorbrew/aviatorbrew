import { getNcCountyTaxRate } from '@/lib/nc-sales-tax';
const cache = new Map<string, {
    county: string;
    expires: number;
}>();
export async function resolveShopNcCounty(address: Record<string, string | undefined>) {
    const supplied = getNcCountyTaxRate(address.county || '');
    if (supplied)
        return { county: supplied.county, method: 'Saved/customer-supplied NC county' };
    if (address.state?.toUpperCase() !== 'NC' || !address.street1 || !address.city || !address.zip)
        return null;
    const key = JSON.stringify([address.street1, address.city, address.state, address.zip]).toUpperCase(), cached = cache.get(key);
    if (cached && cached.expires > Date.now())
        return { county: cached.county, method: 'US Census address/city county lookup' };
    const params = new URLSearchParams({ street: address.street1, city: address.city, state: 'NC', zip: address.zip, benchmark: 'Public_AR_Current', vintage: 'Current_Current', layers: 'Counties', format: 'json' });
    try {
        const response = await fetch('https://geocoding.geo.census.gov/geocoder/geographies/address?' + params, { signal: AbortSignal.timeout(10000), cache: 'no-store' });
        if (!response.ok)
            return null;
        const data = await response.json(), matches = data.result?.addressMatches;
        if (!Array.isArray(matches) || matches.length !== 1 || matches[0].addressComponents?.state !== 'NC')
            return null;
        const counties = matches[0].geographies?.Counties;
        if (!Array.isArray(counties) || counties.length !== 1 || counties[0].STATE !== '37')
            return null;
        const county = getNcCountyTaxRate(String(counties[0].BASENAME || counties[0].NAME || '').replace(/ County$/i, ''));
        if (!county)
            return null;
        if (cache.size > 1000)
            cache.clear();
        cache.set(key, { county: county.county, expires: Date.now() + 86400000 });
        return { county: county.county, method: 'US Census address/city county lookup' };
    }
    catch {
        return null;
    }
}
