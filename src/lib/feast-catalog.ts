import {getUploadedKegInventory} from '@/lib/keg-inventory';
import {feastBeerItems} from '@/lib/feast-beer';
import type {FeastItem,FeastSettings} from '@/lib/feast';
export async function loadFeastBeers(){try{return feastBeerItems((await getUploadedKegInventory())?.items||[]);}catch{return [];}}
export function currentFeastCatalog(settings:FeastSettings,beers:FeastItem[]):FeastSettings{return {...settings,items:settings.items.filter(i=>i.category!=='services'&&!i.beerKey),beers};}
