import { createHash, timingSafeEqual } from 'node:crypto';
import type { KegInventory } from './keg-inventory';

export function authorizedSalesPublisher(header: string | null, token: string | undefined) {
 if (!token || token.length < 32 || !header?.startsWith('Bearer ')) return false;
 const supplied=Buffer.from(header.slice(7)), expected=Buffer.from(token);
 return supplied.length===expected.length && timingSafeEqual(supplied,expected);
}
export class SalesSyncError extends Error {
 constructor(public status:number,message:string){super(message);}
}
const quantities=['sixthBblKegs','fiftyLKegs','cases12oz','loose12oz','totalCans12oz','unitsPerCase12oz','cases16oz','loose16oz','totalCans16oz','unitsPerCase16oz','fourPacks12oz','sixPacks12oz','fourPacks16oz','sixtelsAvailableViaBackfill'] as const;
const key=(s:string)=>s.trim().toLowerCase();
export function mergeBrewOpsSalesSnapshot(value:unknown,previous:KegInventory,now=new Date()) {
 const fail=(s:string):never=>{throw new SalesSyncError(422,s);};
 if(!value||typeof value!=='object'||Array.isArray(value))fail('Inventory must be an object');
 const data=value as Record<string,unknown>;
 if(data.exportType!=='kegs-for-sale'||!Array.isArray(data.items)||!data.items.length||data.items.length>250)fail('Expected a complete kegs-for-sale snapshot');
 if(typeof data.inventoryRevision!=='string'||!/^\d+$/.test(data.inventoryRevision))fail('Inventory revision is required');
 if(typeof data.inventoryUpdatedAt!=='string'||!Number.isFinite(Date.parse(data.inventoryUpdatedAt))||Date.parse(data.inventoryUpdatedAt)>now.getTime()+300000)fail('Inventory timestamp is invalid');
 const incoming=data.items as unknown[];
 const existing=new Map(previous.items.map(r=>[key(r.beerName),r]));
 if(existing.size!==previous.items.length||incoming.length!==existing.size)fail('Website product coverage changed; review product mappings before publishing');
 const seen=new Set<string>();
 const items=incoming.map((unknownRow:unknown)=>{
  if(!unknownRow||typeof unknownRow!=='object'||Array.isArray(unknownRow))fail('Invalid product row');
  const r=unknownRow as Record<string,unknown>;
  if(typeof r.beerName!=='string')fail('Product name is required');
  const name=r.beerName as string, old=existing.get(key(name));
  if(!old||seen.has(key(name)))fail('Unknown or duplicate website product');seen.add(key(name));
  for(const q of quantities){if(typeof r[q]!=='number'||!Number.isInteger(r[q])||(r[q] as number)<0||(r[q] as number)>(q.startsWith('totalCans')?1000000:10000))fail('Package quantities must be nonnegative whole counts');}
  const n=(q:typeof quantities[number])=>r[q] as number;
  if(n('unitsPerCase12oz')<1||n('unitsPerCase12oz')>100||n('unitsPerCase16oz')<1||n('unitsPerCase16oz')>100)fail('Invalid case configuration');
  for(const f of ['has12ozFourPack','has12ozSixPack','has16ozFourPack'])if(typeof r[f]!=='boolean')fail('Package configuration is required');
  if(r.has12ozFourPack&&r.has12ozSixPack)fail('Ambiguous 12 oz package format');
  if(n('totalCans12oz')!==n('cases12oz')*n('unitsPerCase12oz')+n('loose12oz')||n('totalCans16oz')!==n('cases16oz')*n('unitsPerCase16oz')+n('loose16oz'))fail('Case and loose-can counts do not reconcile');
  if(n('fourPacks12oz')!==(r.has12ozFourPack?Math.floor(n('totalCans12oz')/4):0)||n('sixPacks12oz')!==(r.has12ozSixPack?Math.floor(n('totalCans12oz')/6):0)||n('fourPacks16oz')!==(r.has16ozFourPack?Math.floor(n('totalCans16oz')/4):0))fail('Retail packs must be alternate views of the same cans');
  const bbl=n('sixthBblKegs')/6+n('fiftyLKegs')*50/(31*3.785411784)+n('totalCans12oz')*12/(31*128)+n('totalCans16oz')*16/(31*128);
  if(typeof r.totalBbl!=='number'||Math.abs(r.totalBbl-bbl)>0.000001||r.status!=='Available'||r.forSale!==true)fail('Invalid availability or packaged volume');
  if(n('sixtelsAvailableViaBackfill')!==Math.floor(n('fiftyLKegs')*50/(31*3.785411784/6)))fail('Backfill availability is invalid');
  // Only quantities change. Website prices, labels, hidden state and merchandising survive.
  return {...old!,sixthBblKegs:n('sixthBblKegs'),fiftyLKegs:n('fiftyLKegs'),totalBbl:bbl,case12Count:n('cases12oz'),case12FourPackCount:n('fourPacks12oz'),case12SixPackCount:n('sixPacks12oz'),case16Count:n('cases16oz'),case16FourPackCount:n('fourPacks16oz'),caseCount:n('cases12oz')+n('cases16oz'),sixtelsAvailableViaBackfill:n('sixtelsAvailableViaBackfill')};
 });
 return {inventory:{...previous,items,updatedAt:data.inventoryUpdatedAt as string,inventoryUpdatedAt:data.inventoryUpdatedAt as string,websiteUpdatedAt:now.toISOString(),uploadedAt:now.toISOString()},sha256:createHash('sha256').update(JSON.stringify(value)).digest('hex'),revision:data.inventoryRevision as string};
}
