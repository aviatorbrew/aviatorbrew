import { NextRequest,NextResponse } from 'next/server';
import { authorizedSalesPublisher,mergeBrewOpsSalesSnapshot,SalesSyncError } from '@/lib/brewops-sales-sync';
import { databaseConfigured,withDatabase } from '@/lib/database';
import { getUploadedKegInventory,type KegInventory } from '@/lib/keg-inventory';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const snapshotKey='brewops_sales_snapshot';
export async function POST(request:NextRequest) {
 if(!authorizedSalesPublisher(request.headers.get('authorization'),process.env.BREWOPS_SALES_SYNC_TOKEN))return NextResponse.json({error:'Unauthorized'},{status:401});
 if(!databaseConfigured())return NextResponse.json({error:'Persistent inventory storage is not configured'},{status:503});
 const id=request.headers.get('idempotency-key');if(!id||!/^[0-9a-f-]{36}$/i.test(id))return NextResponse.json({error:'An inventory operation ID is required'},{status:422});
 try {
  if(Number(request.headers.get('content-length')||0)>1024*1024)throw new SalesSyncError(413,'Snapshot is too large');
  const reader=request.body?.getReader();if(!reader)throw new SalesSyncError(422,'Snapshot is required');
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>1024*1024){await reader.cancel();throw new SalesSyncError(413,'Snapshot is too large');}chunks.push(part.value);}
  const payload:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const fallback=await getUploadedKegInventory({includeHidden:true});if(!fallback)throw new SalesSyncError(409,'Website inventory must be reviewed before enabling synchronization');
  const result=await withDatabase(async c=>{
   await c.query('BEGIN');
   try{
    await c.query("SELECT pg_advisory_xact_lock(hashtext('brewops-sales-publisher'))");
    const stored=(await c.query('SELECT value FROM website.settings WHERE key=$1 FOR UPDATE',[snapshotKey])).rows[0]?.value as {inventory:KegInventory;sha256:string;operationId:string;revision:string;publishedAt:string}|undefined;
    const merged=mergeBrewOpsSalesSnapshot(payload,stored?.inventory??fallback);
    if(stored?.operationId===id){if(stored.sha256!==merged.sha256)throw new SalesSyncError(409,'Operation ID already used for a different snapshot');await c.query('COMMIT');return {ok:true,sha256:stored.sha256,duplicate:true};}
    if(stored&&BigInt(merged.revision)<BigInt(stored.revision))throw new SalesSyncError(409,'Stale inventory revision');
    if(stored&&Date.now()-Date.parse(stored.publishedAt)<30*60000)throw new SalesSyncError(429,'Inventory can be updated only once every 30 minutes');
    const state={...merged,operationId:id,publishedAt:new Date().toISOString()};
    await c.query(`INSERT INTO website.settings(key,value,description) VALUES($1,$2,'Verified BrewOps sales counts; website pricing preserved') ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=now()`,[snapshotKey,JSON.stringify(state)]);
    await c.query('COMMIT');return {ok:true,sha256:merged.sha256};
   }catch(e){await c.query('ROLLBACK');throw e;}
  });
  return NextResponse.json(result);
 }catch(e){if(e instanceof SalesSyncError)return NextResponse.json({error:e.message},{status:e.status});if(e instanceof SyntaxError)return NextResponse.json({error:'Invalid JSON'},{status:422});console.error('brewops.sales_sync_failed');return NextResponse.json({error:'Inventory update was not committed'},{status:500});}
}
