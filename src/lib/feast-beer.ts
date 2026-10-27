import {createHash} from 'node:crypto';
import type {KegInventoryItem} from '@/lib/keg-inventory';
import type {FeastItem} from '@/lib/feast';
import {feastSeasons} from '@/lib/feast';
const key=(name:string)=>name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
// Legacy website exports use 24-can cases; newer exports retain each format's actual case size.
export function feastBeerItems(items:KegInventoryItem[]):FeastItem[]{return items.flatMap(i=>{
 if(i.hidden||i.forSale===false||i.status&&i.status.toLowerCase()!=='available'||/seltzer|soda|\bthc\b|\bcbd\b|root\s*beer|hop\s*water|kombucha|lemonade|cocktail|cider|wine|\btea\b/i.test(i.beerName+' '+i.category))return [];
 return ([12,16] as const).flatMap(oz=>{const units=oz===12?i.unitsPerCase12oz||24:i.unitsPerCase16oz||24,caseCount=oz===12?i.case12Count||0:i.case16Count||0,total=oz===12?i.totalCans12oz:i.totalCans16oz,retailCans=oz===12?Math.max((i.case12SixPackCount||0)*6,(i.case12FourPackCount||0)*4):(i.case16FourPackCount||0)*4;
 const packs=Math.floor((total??Math.max(caseCount*units,retailCans))/6),caseCents=(oz===12?i.case12PriceCents:i.case16PriceCents)||(/^12\s*oz$/i.test(i.caseSize||'')&&oz===12||/^16\s*oz$/i.test(i.caseSize||'')&&oz===16?i.casePriceCents||0:0);
 if(packs<1)return [];const price=caseCents>0?Math.round(caseCents*6/units):0,beerKey=key(i.beerName);
 return [{id:`beer-${beerKey.slice(0,22)}-${createHash('sha256').update(beerKey).digest('hex').slice(0,10)}-${oz}`,name:`${i.beerName} · ${oz} oz 6-pack`,category:'drinks',priceCents:price,unit:'6-pack',perGuest:false,portion:`6 × ${oz} oz cans${price?'':' · case price awaiting confirmation'}`,yields:[{name:`${i.beerName} (${oz} oz cans)`,amount:6,unit:'cans'}],enabled:price>0,seasons:[...feastSeasons],quoteRequired:price<=0,minimum:1,beerKey,maxQuantity:packs} as FeastItem];});
 }).sort((a,b)=>a.name.localeCompare(b.name));}
