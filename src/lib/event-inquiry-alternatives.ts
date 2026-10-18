import {createHash} from "node:crypto";
import {withDatabase} from "@/lib/database";
import {inquiryAvailability} from "@/lib/event-inquiry-availability";
import {EventPlanError,saveEventPlan,getEventPlan,emailEventUpdate} from "@/lib/event-plans";
import {emptyEventPlan,type EventPlanDetails} from "@/lib/event-plan";
import {getPrivateEventSettings} from "@/lib/private-event-settings";
import {isMailConfigured} from "@/lib/mail";
import {closeUnpaidEventCheckouts} from "@/lib/event-proposals";

export async function offerInquiryAlternative(id:string,input:{date:string;requestId:string;subject:string;message:string;expectedEmail:string;emailApproved?:boolean}) {
  if(input.emailApproved!==true)throw new EventPlanError("Review and approve this customer email before sending.",403);
  if(!/^[1-9]\d{0,18}$/.test(id)||!/^\d{4}-\d{2}-\d{2}$/.test(input.date)||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId)||typeof input.subject!=="string"||!input.subject.trim()||input.subject.length>160||/[\r\n]/.test(input.subject)||typeof input.message!=="string"||!input.message.trim()||input.message.length>5000||typeof input.expectedEmail!=="string")throw new EventPlanError("Choose an available alternative and review the email.");
  if(!isMailConfigured())throw new EventPlanError("Email delivery is not configured. The event date has not changed.",503);
  const hash=createHash("sha256").update(JSON.stringify([id,input.date,input.subject,input.message,input.expectedEmail])).digest("hex");
  const settings=await getPrivateEventSettings();
  const saved=await withDatabase(async client=>{
    await client.query("BEGIN");
    try{
      await client.query("SELECT pg_advisory_xact_lock(hashtext('aviator-private-event-booking'))");
      const inquiry=(await client.query("SELECT * FROM website.form_inquiries WHERE id=$1 AND kind='event' FOR UPDATE",[id])).rows[0];
      if(!inquiry)throw new EventPlanError("Inquiry not found.",404);
      const payload=inquiry.payload||{},previous=payload.alternativeDateRequest;
      if(previous?.requestId===input.requestId){
        if(previous.hash!==hash)throw new EventPlanError("Use a new request after changing the alternative date or email.",409);
        await client.query("COMMIT");return {id:previous.planId as string,version:previous.planVersion as number};
      }
      if((Array.isArray(payload.eventDateHistory)&&payload.eventDateHistory.some((item:{requestId?:string})=>item.requestId===input.requestId))||(await client.query("SELECT 1 FROM website.private_event_updates WHERE request_id=$1 LIMIT 1",[input.requestId])).rowCount)throw new EventPlanError("This date offer was already processed. Refresh the inquiry before choosing another date.",409);
      const current=(await client.query("SELECT * FROM website.private_event_plans WHERE source_inquiry_id=$1 AND deleted_at IS NULL FOR UPDATE",[id])).rows[0];
      if(current&&!['Draft','Tentative'].includes(current.status))throw new EventPlanError("Open this event for review before offering another date.",409);
      const available=(await inquiryAvailability([{id,payload:current?{...payload,cateringPlan:{...payload.cateringPlan,date:current.data.date,startTime:current.data.startTime,endTime:current.data.endTime}}:payload}],new Date(),client)).get(id);
      const candidate=available?.alternatives.find(item=>item.date===input.date);
      if(!candidate)throw new EventPlanError("This alternative is no longer available. Refresh the inquiry and choose an open date.",409);
      const base:EventPlanDetails=current?.data||{...emptyEventPlan(settings.bookingFeeCents),...(payload.cateringPlan||{}),title:payload.cateringPlan?.title||`${payload.eventType||"Private event"} — ${inquiry.name||"Guest"}`,contactName:inquiry.name||payload.name||"",contactEmail:inquiry.email||payload.email||"",phone:payload.phone||"",guestCount:Number(payload.guestCount)||payload.cateringPlan?.guestCount||0,location:payload.location||settings.catering.venue,notes:payload.message||"",paidCents:0,internalNotes:""};
      if(!base.contactEmail||base.contactEmail!==input.expectedEmail)throw new EventPlanError("The recipient changed. Refresh the inquiry and approve the updated email address.",409);
      if(current)await closeUnpaidEventCheckouts(client,current.id);
      const plan=await saveEventPlan({...base,date:candidate.date,startTime:candidate.startTime,endTime:candidate.endTime,status:"Tentative"},current?.id,current?.version,id,client,settings.catering);
      const next={...payload,eventDate:plan.details.date,eventTime:plan.details.startTime,endTime:plan.details.endTime,bookingStage:"Under Review",...(payload.cateringPlan?{cateringPlan:{...payload.cateringPlan,date:plan.details.date,startTime:plan.details.startTime,endTime:plan.details.endTime}}:{}),eventDateHistory:[...(Array.isArray(payload.eventDateHistory)?payload.eventDateHistory:[]),{from:current?.data.date||payload.eventDate||payload.cateringPlan?.date,to:plan.details.date,requestId:input.requestId,changedAt:new Date().toISOString()}],alternativeDateRequest:{requestId:input.requestId,hash,planId:plan.id,planVersion:plan.version}};
      await client.query("UPDATE website.form_inquiries SET payload=$1::jsonb WHERE id=$2",[JSON.stringify(next),id]);
      await client.query("COMMIT");return {id:plan.id,version:plan.version};
    }catch(error){await client.query("ROLLBACK").catch(()=>undefined);throw error;}
  });
  const plan=await getEventPlan(saved.id);
  if(!plan||plan.version!==saved.version||plan.details.status!=="Tentative")throw new EventPlanError("The event changed after scheduling. Review it before sending an email.",409);
  const delivery=await emailEventUpdate({...plan,details:{...plan.details,guestEmails:[]}},{requestId:input.requestId,version:saved.version,subject:input.subject,message:input.message,includeSummary:false,emailApproved:true});
  return {plan,...delivery};
}
