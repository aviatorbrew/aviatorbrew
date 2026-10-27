import { createHash } from "node:crypto";
import { withDatabase } from "@/lib/database";
import { getPrivateEventSettings } from "@/lib/private-event-settings";
import { cateringSummary, inquiryAcknowledgement, validateCateringRequest } from "@/lib/event-booking";
import { eventTotals, money } from "@/lib/event-plan";
import {sendEventMail as sendMail} from "@/lib/event-mail";
import { buildEventInquiryEmail } from "@/lib/event-inquiry-email";

export async function submitCateringInquiry(body: Record<string, unknown>) {
  if (body.website || body.humanCheck !== "yes" || typeof body.requestId !== "string" || !/^[a-f0-9-]{36}$/i.test(body.requestId)) throw new Error("Confirm you are a real person and submit a valid request.");
  const settings=await getPrivateEventSettings(), details=validateCateringRequest(body.cateringPlan,settings.catering,settings.bookingFeeCents);
  const summary=cateringSummary(details,settings.catering), totals=eventTotals(details,settings.catering);
  const payload={kind:"event",name:details.contactName,email:details.contactEmail,phone:details.phone,eventDate:details.date,eventTime:details.startTime,endTime:details.endTime,eventType:details.title,location:details.location,guestCount:String(details.guestCount),message:details.notes || "Online buffet request",estimatedSubtotal:money(totals.subtotal),estimatedTax:money(totals.tax),estimatedTotal:money(totals.total),orderSummary:summary,cateringPlan:details,requestId:body.requestId,bookingStage:"Inquiry Received"};
  const hash=createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const result=await withDatabase(async client=>{
    await client.query("BEGIN");
    try {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",["event-inquiry:"+body.requestId]);
      const existing=await client.query("SELECT id,payload FROM website.form_inquiries WHERE kind='event' AND payload->>'requestId'=$1",[body.requestId]);
      if(existing.rowCount){ if(existing.rows[0].payload.requestHash!==hash)throw new Error("Use a new request after changing the event details."); await client.query("COMMIT"); return {id:existing.rows[0].id,created:false}; }
      const inserted=await client.query("INSERT INTO website.form_inquiries(kind,email,name,payload,source) VALUES('event',$1,$2,$3::jsonb,'Aviator Event') RETURNING id",[details.contactEmail,details.contactName,JSON.stringify({...payload,requestHash:hash})]);
      await client.query("COMMIT"); return {id:inserted.rows[0].id,created:true};
    }catch(error){await client.query("ROLLBACK");throw error;}
  });
  if(result.created){
    const messages=[
      {to:process.env.PRIVATE_EVENT_INQUIRY_RECIPIENT_EMAIL||"events@aviatorbrew.com",subject:"New online private event request #"+result.id,replyTo:details.contactEmail,fromName:"Aviator Events",...buildEventInquiryEmail(details,settings.catering,String(result.id),"internal")},
      {to:details.contactEmail,subject:"We received your Aviator event request #"+result.id,replyTo:"events@aviatorbrew.com",fromName:"Aviator Events",...buildEventInquiryEmail(details,settings.catering,String(result.id),"customer")},
    ];
    const sent=await Promise.allSettled(messages.map(message=>sendMail(message)));
    if(sent.some(r=>r.status==="rejected"||!r.value))console.error("private_event.inquiry_email_delivery_failed",{inquiryId:String(result.id)});
  }
  return {ok:true,inquiryId:String(result.id),message:inquiryAcknowledgement};
}
