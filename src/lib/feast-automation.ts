import {withDatabase} from '@/lib/database';
import {deliverFeastMessages,queueFeastMessage} from '@/lib/feast-messages';
import {getFeastOrder,verifyFeastForAutomation} from '@/lib/feast-store';
import {feastBalance} from '@/lib/feast-flow';
export async function processFeastFollowups(){
 // The lock is session-scoped only for this short run; business changes also lock each order and settings row.
 return withDatabase(async lock=>{const acquired=(await lock.query("SELECT pg_try_advisory_lock(hashtext('aviator-feast-followups')) AS ok")).rows[0].ok;if(!acquired)return {busy:true,checked:0,warnings:0,cancelled:0,attention:0};
 const started=Date.now(),result={busy:false,checked:0,warnings:0,cancelled:0,attention:0};try{
 const rows=(await lock.query("SELECT id,version FROM website.feast_orders WHERE (state='Approved' AND paid_cents<coalesce((quote->>'totalCents')::integer,0) AND payment_requested_at<=now()-interval '48 hours') OR (state='Cancelled' AND payment_cancelled_at IS NOT NULL AND EXISTS(SELECT 1 FROM website.feast_message_deliveries d WHERE d.order_id=feast_orders.id AND d.version=feast_orders.version AND d.kind='cancelled' AND d.status IN ('pending','failed'))) ORDER BY updated_at LIMIT 100")).rows;
 for(const row of rows){if(Date.now()-started>150000)break;result.checked++;try{
  let o=await getFeastOrder(row.id);if(!o)continue;
  if(o.state==='Cancelled'){await deliverFeastMessages(o.id,'cancelled');continue;}
  o=await verifyFeastForAutomation(o.id,row.version,false);if(feastBalance(o)===0){await deliverFeastMessages(o.id,'paid');continue;}if(o.state!=='Approved')continue;
  if(!o.paymentWarningSentAt){const current=o;await withDatabase(c=>queueFeastMessage(c,current.id,current.version,'payment_warning',current.input.email));const sent=await deliverFeastMessages(o.id,'payment_warning');if(sent.status==='sent')result.warnings++;}
  else if(Date.now()>=new Date(o.paymentWarningSentAt).getTime()+24*3600000){o=await verifyFeastForAutomation(o.id,o.version,true);if(o.state==='Cancelled'){result.cancelled++;await deliverFeastMessages(o.id,'cancelled');}}
 }catch(e){result.attention++;await lock.query("UPDATE website.feast_orders SET automation_attention=$2 WHERE id=$1 AND version=$3",[row.id,e instanceof Error?e.message.slice(0,500):'Payment verification requires staff attention.',row.version]);}}
 await lock.query("INSERT INTO website.settings(key,value) VALUES('feast_automation_status',$1::jsonb) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=now()",[JSON.stringify({...result,lastRunAt:new Date().toISOString()})]);return result;
 }finally{await lock.query("SELECT pg_advisory_unlock(hashtext('aviator-feast-followups'))");}});
}
