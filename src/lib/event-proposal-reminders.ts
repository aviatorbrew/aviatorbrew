import {createHash,randomBytes} from 'node:crypto';
import type {PoolClient} from 'pg';
import {withDatabase} from '@/lib/database';
import {materialHash,deliverProposalMessages,type EventProposal} from '@/lib/event-proposals';
import {eventIsFuture} from '@/lib/event-booking';
import {eventDateLabel as dateLabel,timeLabel as serviceTime,type EventPlanDetails} from '@/lib/event-plan';
import {releaseProposalHold,stopProposalReminder} from '@/lib/event-proposal-holds';
import {proposalReminderEmail} from '@/lib/event-proposal-reminder-email';
import {sendEventMail} from '@/lib/event-mail';
import {isMailConfigured} from '@/lib/mail';
const DAY=86400000;
const selection=`SELECT p.*,e.data AS event_data,e.status AS event_status,e.deleted_at AS event_deleted,e.proposal_hold_released_at,
 NOT EXISTS(SELECT 1 FROM website.private_event_proposals newer WHERE newer.plan_id=p.plan_id AND newer.version>p.version) AS latest,
 COALESCE((SELECT sum(d.amount_cents) FROM website.private_event_deposits d WHERE d.plan_id=p.plan_id),0)::bigint AS verified_paid,
 EXISTS(SELECT 1 FROM website.private_event_checkout_attempts a JOIN website.private_event_proposals ap ON ap.id=a.proposal_id WHERE ap.plan_id=p.plan_id AND a.status IN ('creating','open','paid')) AS payment_pending
 FROM website.private_event_proposals p JOIN website.private_event_plans e ON e.id=p.plan_id`;
async function locked<T>(work:(client:PoolClient)=>Promise<T>){return withDatabase(async client=>{await client.query('BEGIN');try{await client.query("SELECT pg_advisory_xact_lock(hashtext('aviator-private-event-booking'))");const result=await work(client);await client.query('COMMIT');return result;}catch(error){await client.query('ROLLBACK');throw error;}});}
function eligible(row:Record<string,any>,now:Date){
 return row.latest&&row.sent_at&&row.approved_at&&!row.accepted_at&&row.state==='sent'&&!row.event_deleted&&!row.proposal_hold_released_at&&row.event_status==='Tentative'&&Math.max(Number(row.verified_paid),Number(row.event_data.paidCents||0))===0&&!row.payment_pending&&materialHash(row.event_data)===row.material_hash&&eventIsFuture(row.event_data,now);
}
async function deliverReminder(message:Parameters<typeof sendEventMail>[0]){
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([sendEventMail(message),new Promise<boolean>(resolve=>{timer=setTimeout(()=>resolve(false),30000);timer.unref();})]);}
 finally{clearTimeout(timer);}
}
export async function processEventProposalReminders(referenceTime?:Date){
 const now=referenceTime||new Date();
 const result={examined:0,sent:0,released:0,stopped:0,attention:0};
 const active=await withDatabase(async client=>(await client.query("SELECT proposal_id FROM website.private_event_proposal_reminders WHERE status='sent' ORDER BY release_at LIMIT 100")).rows);
 for(const item of active){
  const outcome=await locked(async client=>{
   const row=(await client.query(selection+' WHERE p.id=$1 FOR UPDATE OF p,e',[item.proposal_id])).rows[0];
   const reminder=(await client.query('SELECT * FROM website.private_event_proposal_reminders WHERE proposal_id=$1 FOR UPDATE',[item.proposal_id])).rows[0];
   if(!row||reminder?.status!=='sent')return 'unchanged';
   if(!eligible(row,now)){await stopProposalReminder(client,row.id);return 'stopped';}
   if(new Date(reminder.release_at).getTime()>now.getTime())return 'unchanged';
   await releaseProposalHold(client,row.plan_id,'no-response',now);
   await client.query("UPDATE website.private_event_proposals SET state='expired',token_hash=NULL WHERE id=$1",[row.id]);
   await client.query("UPDATE website.private_event_proposal_reminders SET status='released',released_at=$2,updated_at=now() WHERE proposal_id=$1",[row.id,now]);
   const d=row.event_data as EventPlanDetails;
   const message=[`The tentative date for ${row.number} was released after the 24-hour follow-up deadline.`,d.title,dateLabel(d.date)+' '+serviceTime(d.startTime)+'–'+serviceTime(d.endTime),'No acceptance or payment was recorded. The event plan, menu and proposal history are retained. Review availability and send a revised proposal if the customer returns.'].join('\n\n');
   await client.query("INSERT INTO website.private_event_deliveries(key,proposal_id,recipient,subject,message) VALUES($1,$2,'events@aviatorbrew.com',$3,$4) ON CONFLICT DO NOTHING",['proposal-hold-released:'+row.id,row.id,'Date released: '+row.number,message]);
   return 'released';
  });
  if(outcome==='released'){result.released++;await deliverProposalMessages(item.proposal_id,'proposal-hold-released:'+item.proposal_id).catch(()=>false);}
  else if(outcome==='stopped')result.stopped++;
 }
 // A crash or uncertain SMTP result must never produce duplicate automatic
 // reminders or release a date on an email whose delivery was not recorded.
 await withDatabase(client=>client.query("UPDATE website.private_event_proposal_reminders SET status='unknown',updated_at=now() WHERE status='sending' AND created_at<$1::timestamptz-interval '10 minutes'",[now]));
 if(!isMailConfigured()&&process.env.MAIL_MODE!=='record')return result;
 const candidates=await withDatabase(async client=>(await client.query(selection+` WHERE p.state='sent' AND p.accepted_at IS NULL AND p.sent_at<=$1::timestamptz-interval '2 days' AND p.expires_at>=$1::timestamptz+interval '24 hours' AND e.status='Tentative' AND e.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM website.private_event_proposal_reminders r WHERE r.proposal_id=p.id) ORDER BY p.sent_at`,[now])).rows);
 for(const candidate of candidates.filter(row=>eligible(row,now)&&eventIsFuture(row.event_data,new Date(now.getTime()+DAY))).slice(0,25)){
  result.examined++;
  const token=randomBytes(32).toString('hex'),sendTime=referenceTime||new Date(),releaseAt=new Date(sendTime.getTime()+DAY);
  const claimed=await locked(async client=>{
   const row=(await client.query(selection+' WHERE p.id=$1 FOR UPDATE OF p,e',[candidate.id])).rows[0];
   if(!row||!eligible(row,now)||!eventIsFuture(row.event_data,new Date(now.getTime()+DAY))||new Date(row.sent_at).getTime()>now.getTime()-2*DAY||new Date(row.expires_at).getTime()<releaseAt.getTime())return false;
   const saved=await client.query("INSERT INTO website.private_event_proposal_reminders(proposal_id,token_hash,original_expires_at,release_at) VALUES($1,$2,$3,$4) ON CONFLICT(proposal_id) DO NOTHING RETURNING proposal_id",[row.id,createHash('sha256').update(token).digest('hex'),row.expires_at,releaseAt]);return saved.rowCount===1;
  });
  if(!claimed)continue;
  const sent=await locked(async client=>{
   const row=(await client.query(selection+' WHERE p.id=$1 FOR UPDATE OF p,e',[candidate.id])).rows[0];
   const reminder=(await client.query('SELECT status FROM website.private_event_proposal_reminders WHERE proposal_id=$1 FOR UPDATE',[candidate.id])).rows[0];
   if(!row||reminder?.status!=='sending'||!eligible(row,now)){await stopProposalReminder(client,candidate.id);return false;}
   // Bound the booking lock if the mail provider stalls. An uncertain result
   // keeps the original hold and never schedules automatic release or retries.
   let delivered=false;try{delivered=await deliverReminder(proposalReminderEmail(row as EventProposal,token,releaseAt));}catch{}
   if(!delivered){await client.query("UPDATE website.private_event_proposal_reminders SET status='unknown',updated_at=now() WHERE proposal_id=$1",[row.id]);return false;}
   await client.query("UPDATE website.private_event_proposal_reminders SET status='sent',sent_at=$2,updated_at=now() WHERE proposal_id=$1",[row.id,sendTime]);
   await client.query('UPDATE website.private_event_proposals SET expires_at=$2 WHERE id=$1',[row.id,releaseAt]);
   return true;
  });
  if(sent)result.sent++;else result.attention++;
 }
 return result;
}
export function startEventProposalReminderWorker(){
 const state=globalThis as typeof globalThis&{aviatorProposalReminderWorker?:boolean};if(state.aviatorProposalReminderWorker)return;state.aviatorProposalReminderWorker=true;
 async function tick(){try{const result=await processEventProposalReminders();if(result.sent||result.released||result.attention)console.info('events.proposal_followup',result);}catch{console.error('events.proposal_followup_retry');}setTimeout(tick,60000).unref();}
 setTimeout(tick,10000).unref();
}
