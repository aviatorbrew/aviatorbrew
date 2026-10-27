import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { authorizedSalesPublisher,mergeBrewOpsSalesSnapshot } from '../src/lib/brewops-sales-sync';
import { getUploadedKegInventory,updateKegItem } from '../src/lib/keg-inventory';
import { withDatabase } from '../src/lib/database';
import { POST } from '../src/app/api/integrations/brewops/inventory/route';
if(process.env.NODE_ENV!=='test'||!process.env.DATABASE_URL||!new URL(process.env.DATABASE_URL).pathname.endsWith('_test'))throw new Error('Receiver tests require a disposable _test database');
const token=randomBytes(32).toString('hex'),at=new Date().toISOString();
const original={items:[{beerName:'Verified test lager',category:'Lager',packaging:'Draft/Cans',sixthBblKegs:1,fiftyLKegs:1,totalBbl:1,sixthBblPrice:95,fiftyLPrice:185,case12ozPrice:40,sixPack12ozPrice:10,has12ozFourPack:false,has12ozSixPack:true,has16ozFourPack:true,hidden:true}],updatedAt:at,uploadedAt:at};
const row={beerName:'Verified test lager',status:'Available',forSale:true,sixthBblKegs:6,fiftyLKegs:2,cases12oz:2,loose12oz:5,totalCans12oz:53,unitsPerCase12oz:24,cases16oz:1,loose16oz:3,totalCans16oz:27,unitsPerCase16oz:24,has12ozFourPack:false,has12ozSixPack:true,has16ozFourPack:true,twelveOzPackFormat:'6-pack',fourPacks12oz:0,sixPacks12oz:8,fourPacks16oz:6,sixtelsAvailableViaBackfill:5,totalBbl:6/6+2*50/(31*3.785411784)+53*12/(31*128)+27*16/(31*128)};
const payload={schemaVersion:7,exportType:'kegs-for-sale',inventoryRevision:'1',inventoryUpdatedAt:at,items:[row]};
let dir:string;
before(async()=>{dir=await mkdtemp(path.join(tmpdir(),'brewops-receiver-'));
process.env.KEG_SNAPSHOT_FILE=path.join(dir,'snapshot.json');process.env.KEG_INVENTORY_DATA_FILE=path.join(dir,'inventory.json');await writeFile(process.env.KEG_SNAPSHOT_FILE,JSON.stringify(original));
process.env.BREWOPS_SALES_SYNC_TOKEN=token;
});
const request=(value:unknown,id:string=randomUUID(),auth=`Bearer ${token}`)=>new NextRequest('https://sales.example.test/api/integrations/brewops/inventory',{method:'POST',headers:{authorization:auth,'content-type':'application/json','idempotency-key':id},body:JSON.stringify(value)});
after(async()=>{await rm(dir,{recursive:true,force:true});});
test('publisher authentication is fail-closed and constant-time for valid tokens',()=>{assert.equal(authorizedSalesPublisher(`Bearer ${token}`,undefined),false);assert.equal(authorizedSalesPublisher(`Bearer ${token}`,token),true);assert.equal(authorizedSalesPublisher('Bearer bad',token),false);});
test('actual receiver rejects unauthorized requests without replacing the existing public stock',async()=>{const r=await POST(request(payload,randomUUID(),'Bearer bad'));assert.equal(r.status,401);assert.equal((await getUploadedKegInventory({includeHidden:true}))!.items[0].sixthBblKegs,1);});
let firstId:string,firstSha:string;
test('authenticated quantities replace stock atomically while prices and hidden state survive',async()=>{
 firstId=randomUUID();const response=await POST(request(payload,firstId));assert.equal(response.status,200,await response.clone().text());firstSha=(await response.json()).sha256;
 const stock=await getUploadedKegInventory({includeHidden:true});assert.equal(stock!.items[0].sixthBblKegs,6);assert.equal(stock!.items[0].sixthBblPriceCents,9500);assert.equal(stock!.items[0].case12PriceCents,4000);assert.equal(stock!.items[0].case12SixPackCount,8);assert.equal(stock!.items[0].totalCans12oz,53);assert.equal(stock!.items[0].totalCans16oz,27);assert.equal(stock!.items[0].unitsPerCase12oz,24);assert.equal(stock!.items[0].unitsPerCase16oz,24);assert.equal(stock!.items[0].hidden,true);
 assert.equal((await getUploadedKegInventory())!.items.length,0);
});
test('duplicate publications are idempotent and another publication is throttled',async()=>{
 const retry=await POST(request(payload,firstId));assert.equal(retry.status,200);assert.equal((await retry.json()).sha256,firstSha);
 assert.equal((await POST(request({...payload,inventoryRevision:'2'},randomUUID()))).status,429);
 assert.equal((await POST(request({...payload,inventoryRevision:'2'},firstId))).status,409);
});
test('partial coverage, malformed counts, unknown products and double-counted packs are rejected',async()=>{
 for(const altered of [{...payload,items:[]},{...payload,items:[{...row,sixthBblKegs:1.5}]},{...payload,items:[{...row,beerName:'Not mapped'}]},{...payload,items:[{...row,totalCans12oz:54}]},{...payload,items:[{...row,sixPacks12oz:99}]}])assert.equal((await POST(request(altered))).status,422);
 assert.equal((await getUploadedKegInventory({includeHidden:true}))!.items[0].sixthBblKegs,6);
});
test('manager pricing changes stay visible after sync without resetting publisher cooldown',async()=>{
 await updateKegItem({beerName:row.beerName,sixthBblPriceCents:11000,fiftyLPriceCents:18500,case12PriceCents:4000,case12SixPackPriceCents:1000,case16FourPackPriceCents:1200});
 assert.equal((await getUploadedKegInventory({includeHidden:true}))!.items[0].sixthBblPriceCents,11000);assert.equal((await POST(request({...payload,inventoryRevision:'2'}))).status,429);
});
test('receiver enforces revision ordering after cooldown, and preserves website prices on the next publication',async()=>{
 await withDatabase(async c=>{await c.query("UPDATE website.settings SET value=jsonb_set(value,'{publishedAt}',to_jsonb((now()-interval '31 minutes')::text)) WHERE key='brewops_sales_snapshot'");});
 assert.equal((await POST(request({...payload,inventoryRevision:'0'}))).status,409);
 const response=await POST(request({...payload,inventoryRevision:'2'}));assert.equal(response.status,200);assert.equal((await getUploadedKegInventory({includeHidden:true}))!.items[0].sixthBblPriceCents,11000);
});
test('pure contract validation keeps missing source values out of numeric assumptions',async()=>{
 const old=(await getUploadedKegInventory({includeHidden:true}))!;
 assert.throws(()=>mergeBrewOpsSalesSnapshot({...payload,items:[{...row,loose12oz:undefined}]},old));
 assert.throws(()=>mergeBrewOpsSalesSnapshot({...payload,items:[{...row,has12ozFourPack:true}]},old));
});
