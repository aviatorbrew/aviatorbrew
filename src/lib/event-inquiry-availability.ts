import { activeEventBookingSql, eventIsFuture, eventRecordConflicts } from "@/lib/event-booking";
import { withDatabase } from "@/lib/database";
import type { EventPlanDetails } from "@/lib/event-plan";
import type { PoolClient } from "pg";

type Schedule={date:string;startTime:string;endTime:string};
type Inquiry={id:string;payload:Record<string,unknown>};
type Booking={source_inquiry_id:string|number|null;data:EventPlanDetails;calendar_sync?:{status?:string;source?:Schedule}};
export type InquiryAvailability={status:"available"|"unavailable"|"incomplete";alternatives:Schedule[];reason?:string};
function time(value:unknown) {
  if(typeof value!=="string")return "";
  if(/^([01]\d|2[0-3]):[0-5]\d$/.test(value))return value;
  const match=value.trim().match(/^(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(am|pm)$/i);
  if(!match)return "";
  return `${String(Number(match[1])%12+(/pm/i.test(match[3])?12:0)).padStart(2,"0")}:${match[2]||"00"}`;
}
function schedule(inquiry:Inquiry):Schedule|null {
  const p=inquiry.payload,plan=p.cateringPlan&&typeof p.cateringPlan==="object"?p.cateringPlan as Record<string,unknown>:{};
  const date=String(plan.date||p.eventDate||p.date||""),startTime=time(plan.startTime||p.eventTime||p.time),rawEnd=plan.endTime||p.endTime,endTime=time(rawEnd);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+"T12:00:00Z"))||new Date(date+"T12:00:00Z").toISOString().slice(0,10)!==date||!startTime||(rawEnd&&!endTime))return null;
  return {date,startTime,endTime};
}
function shift(date:string,days:number){const value=new Date(date+"T12:00:00Z");value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10);}
export function inquiryAlternativeDates(date:string) {
  const saturday=(6-new Date(date+"T12:00:00Z").getUTCDay()+7)%7||7;
  return [...new Set([-2,-1,1,2,saturday,saturday+1].map(days=>shift(date,days)))].sort();
}
export async function inquiryAvailability(inquiries:Inquiry[],now=new Date(),client?:PoolClient):Promise<Map<string,InquiryAvailability>> {
  const schedules=new Map(inquiries.map(item=>[item.id,schedule(item)]));
  const dates=[...schedules.values()].filter((item):item is Schedule=>Boolean(item)).flatMap(item=>[item.date,...inquiryAlternativeDates(item.date)]).sort();
  const query=async (connection:PoolClient)=>(await connection.query("SELECT source_inquiry_id,data,calendar_sync FROM website.private_event_plans WHERE deleted_at IS NULL AND "+activeEventBookingSql+" AND (event_date BETWEEN $1::date-1 AND $2::date+1 OR calendar_sync->'source'->>'date' BETWEEN ($1::date-1)::text AND ($2::date+1)::text)",[dates[0],dates.at(-1)])).rows;
  const bookings:Booking[]=dates.length?(client?await query(client):await withDatabase(query)):[];
  return new Map(inquiries.map((item):[string,InquiryAvailability]=>{
    const requested=schedules.get(item.id);
    if(!requested)return [item.id,{status:"incomplete",alternatives:[],reason:"Enter the requested date and start/end times to check availability."}];
    const available=(candidate:Schedule)=>eventIsFuture(candidate,now)&&!bookings.some(booking=>String(booking.source_inquiry_id)!==item.id&&eventRecordConflicts(candidate,booking));
    if(available(requested))return [item.id,{status:"available",alternatives:[]}];
    const alternatives=inquiryAlternativeDates(requested.date).map(date=>({...requested,date})).filter(available);
    return [item.id,{status:"unavailable",alternatives,reason:eventIsFuture(requested,now)?"Another event overlaps this time, including setup and cleanup.":"The requested date or start time has passed."}];
  }));
}
