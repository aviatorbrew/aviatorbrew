import {isDeepStrictEqual} from 'node:util';
import {createHash} from 'node:crypto';
import {withDatabase} from '@/lib/database';
import {getPrivateEventSettings} from '@/lib/private-event-settings';
import {EventPlanError,getEventPlan,saveEventPlan} from '@/lib/event-plans';
import {inquiryLastNameMatches,mergeInquiryMenuDetails} from '@/lib/event-inquiry-menu';
import type {EventPlanDetails} from '@/lib/event-plan';

type Inquiry={id:string;name:string;email:string;payload:{cateringPlan?:EventPlanDetails;orderSummary?:string;message?:string;menuImportedPlanId?:string;menuImportedFingerprint?:string;menuMergeHistory?:unknown[]}};
function fingerprint(i:Inquiry,catering:unknown){return createHash('sha256').update(JSON.stringify([String(i.id),i.name,i.email,i.payload.cateringPlan,i.payload.orderSummary,i.payload.message,catering])).digest('hex');}
function validId(id:string){if(!/^[1-9]\d{0,18}$/.test(id))throw new EventPlanError('Choose a valid website inquiry.');}
export async function inquiryMergeCandidates(id:string,search=''){
  validId(id);const q=search.trim();if(q.length>200)throw new EventPlanError('Keep event searches under 200 characters.');
  const catering=(await getPrivateEventSettings()).catering;
  return withDatabase(async client=>{
    const i=(await client.query("SELECT id,name,email,payload FROM website.form_inquiries WHERE id=$1 AND kind='event'",[id])).rows[0] as Inquiry|undefined;
    if(!i)throw new EventPlanError('Website inquiry not found.',404);
    const rows=(await client.query("SELECT id,version,data,count(*) OVER()::int AS total FROM website.private_event_plans WHERE status='Confirmed' AND deleted_at IS NULL AND ($1::text='' OR title ILIKE $2 OR data->>'contactName' ILIKE $2 OR data->>'contactEmail' ILIKE $2 OR event_date::text ILIKE $2) ORDER BY abs(event_date-COALESCE($3::date,current_date)),event_date,id LIMIT 200",[q,'%'+q+'%',i.payload.cateringPlan?.date||null])).rows;
    const candidates=rows.map(row=>({id:String(row.id),version:Number(row.version),details:row.data as EventPlanDetails,lastNameMatch:inquiryLastNameMatches(i.name,row.data)})).sort((a,b)=>Number(b.lastNameMatch)-Number(a.lastNameMatch));
    return {fingerprint:fingerprint(i,catering),candidates,total:rows[0]?.total||0,catering};
  });
}
export async function mergeInquiryIntoEvent(id:string,input:{targetId?:string;version?:number;fingerprint?:string;confirmed?:boolean}){
  validId(id);if(input?.confirmed!==true||typeof input.targetId!=='string'||!input.targetId||!Number.isInteger(input.version)||typeof input.fingerprint!=='string')throw new EventPlanError('Review the selected event and confirm the menu merge.',403);
  const catering=(await getPrivateEventSettings()).catering;
  const result=await withDatabase(async client=>{
    await client.query('BEGIN');
    try{
      await client.query("SELECT pg_advisory_xact_lock(hashtext('aviator-private-event-booking'))");
      const inquiry=(await client.query("SELECT * FROM website.form_inquiries WHERE id=$1 AND kind='event' FOR UPDATE",[id])).rows[0] as Inquiry|undefined;
      if(!inquiry)throw new EventPlanError('Website inquiry not found.',404);
      if(fingerprint(inquiry,catering)!==input.fingerprint)throw new EventPlanError('The website inquiry or menu pricing changed. Reload and review the menu again.',409);
      const target=(await client.query('SELECT * FROM website.private_event_plans WHERE id=$1 FOR UPDATE',[input.targetId])).rows[0];
      if(!target||target.deleted_at||target.status!=='Confirmed')throw new EventPlanError('Choose an active confirmed event.',409);
      if(inquiry.payload.menuImportedPlanId&&inquiry.payload.menuImportedPlanId!==target.id){
        const prior=(await client.query('SELECT id FROM website.private_event_plans WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[inquiry.payload.menuImportedPlanId])).rows[0];
        if(prior)throw new EventPlanError('This inquiry was already merged into another event. Open that event to review its records first.',409);
      }
      const incoming=inquiry.payload.cateringPlan;if(!incoming)throw new EventPlanError('This inquiry has no saved menu to merge.');
      const details=mergeInquiryMenuDetails(target.data,{...incoming,contactName:incoming.contactName||inquiry.name,contactEmail:incoming.contactEmail||inquiry.email},catering);
      if(inquiry.payload.menuImportedPlanId===target.id&&inquiry.payload.menuImportedFingerprint===input.fingerprint&&isDeepStrictEqual(JSON.parse(JSON.stringify(details)),target.data)){await client.query('COMMIT');return {id:target.id,alreadyMerged:true};}
      if(target.version!==input.version)throw new EventPlanError('The confirmed event changed. Reload and review it before merging.',409);
      const others=(await client.query('SELECT * FROM website.private_event_plans WHERE source_inquiry_id=$1 AND id<>$2 AND deleted_at IS NULL FOR UPDATE',[id,target.id])).rows;
      for(const old of others){
        const used=(await client.query("SELECT EXISTS(SELECT 1 FROM website.private_event_proposals WHERE plan_id=$1 AND (sent_at IS NOT NULL OR approved_at IS NOT NULL OR accepted_at IS NOT NULL)) OR EXISTS(SELECT 1 FROM website.private_event_deposits WHERE plan_id=$1) OR EXISTS(SELECT 1 FROM website.private_event_checkout_attempts a JOIN website.private_event_proposals p ON p.id=a.proposal_id WHERE p.plan_id=$1) AS used",[old.id])).rows[0].used;
        if(old.calendar_sync?.eventId||!['Draft','Tentative'].includes(old.status)||Number(old.data.paidCents)>0||used)throw new EventPlanError('This inquiry already has another event with confirmation, proposal delivery or payment history. Open that event to review its records before merging.',409);
        await client.query("UPDATE website.private_event_plans SET deleted_at=now(),status='Cancelled',data=data||jsonb_build_object('status','Cancelled','deletedOriginalStatus',status,'deletedSourceInquiryId',source_inquiry_id),source_inquiry_id=NULL,calendar_sync=calendar_sync||jsonb_build_object('menuMergedIntoPlanId',$1::text),version=version+1,updated_at=now() WHERE id=$2",[target.id,old.id]);
      }
      const saved=await saveEventPlan(details,target.id,target.version,undefined,client,catering);
      if(!target.source_inquiry_id){const owner=(await client.query('SELECT id FROM website.private_event_plans WHERE source_inquiry_id=$1',[id])).rows[0];if(!owner)await client.query('UPDATE website.private_event_plans SET source_inquiry_id=$1 WHERE id=$2',[id,target.id]);}
      const at=new Date().toISOString(),history=Array.isArray(inquiry.payload.menuMergeHistory)?inquiry.payload.menuMergeHistory:[];
      const payload={...inquiry.payload,menuImportedPlanId:target.id,menuImportedPlanVersion:saved.version,menuImportedFingerprint:input.fingerprint,menuImportedAt:at,menuMergeHistory:[...history,{planId:target.id,planVersion:saved.version,at,previousDetails:target.data}]};
      await client.query('UPDATE website.form_inquiries SET reviewed_at=COALESCE(reviewed_at,now()),payload=$1::jsonb WHERE id=$2',[JSON.stringify(payload),id]);
      await client.query('COMMIT');return {id:target.id,alreadyMerged:false};
    }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}
  });
  return {plan:await getEventPlan(result.id),alreadyMerged:result.alreadyMerged,message:'Menu merged into the confirmed event. No customer email was sent. Review the event and create a revised proposal before sending.'};
}
