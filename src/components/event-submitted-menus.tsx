"use client";

import {useEffect,useState} from "react";
import {getManagerJson} from "@/lib/manager-fetch";
import {eventDateLabel,type EventPlan} from "@/lib/event-plan";

type Submission={id:string;name:string;eventType:string;guestCount:string;createdAt:string;orderSummary:string;message:string;planId?:string};

export function EventSubmittedMenus({plan,onReview}:{plan:EventPlan;onReview:(id:string)=>void}){
  const [submissions,setSubmissions]=useState<Submission[]>([]),[error,setError]=useState("");
  useEffect(()=>{
    const controller=new AbortController();setSubmissions([]);setError("");
    if(plan.sourceInquiryId)return ()=>controller.abort();
    getManagerJson('/api/manager/inquiries?'+new URLSearchParams({kind:'event',eventDate:plan.details.date,limit:'250'}),controller.signal)
      .then(body=>setSubmissions((body.inquiries||[]).filter((item:Submission)=>item.id!==plan.sourceInquiryId&&item.planId!==plan.id&&item.orderSummary?.trim())))
      .catch(e=>{if(!controller.signal.aborted)setError(e.message);});
    return ()=>controller.abort();
  },[plan.id,plan.details.date,plan.sourceInquiryId]);
  if(!submissions.length&&!error)return null;
  return <section className="event-submitted-menus" aria-label="Website menu submissions">
    <h4>Website menu submissions for {eventDateLabel(plan.details.date)}</h4>
    <p>These requests are separate from this saved event. Review the customer’s submission before updating or linking the event plan.</p>
    {error?<p role="alert">Could not check website menu submissions: {error}</p>:null}
    {submissions.map(item=><div className="event-submitted-menu" key={item.id}>
      <p><strong>{item.name}: {item.eventType||'Private event'}</strong> · {item.guestCount} guests</p>
      <p>Received {new Date(item.createdAt).toLocaleString('en-US',{timeZone:'America/New_York',dateStyle:'medium',timeStyle:'short'})} Eastern</p>
      <details><summary>View submitted menu</summary><pre>{item.orderSummary}</pre>{item.message?<p className="preserve">{item.message}</p>:null}</details>
      <button type="button" onClick={()=>onReview(item.id)}>Review website inquiry</button>
    </div>)}
  </section>;
}
