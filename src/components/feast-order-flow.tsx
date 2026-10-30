'use client';
import {feastBalance,feastFlowStatus,type FeastFlowEvent} from '@/lib/feast-flow';
import {feastMoney,type FeastOrder} from '@/lib/feast';
const date=(value:string)=>new Date(value).toLocaleString('en-US',{timeZone:'America/New_York',dateStyle:'medium',timeStyle:'short'})+' Eastern';
export function FeastOrderFlow({order,events}:{order:FeastOrder;events:FeastFlowEvent[]}){
 const stage=feastFlowStatus(order),balance=feastBalance(order),steps=['Request received','Approved & payment requested','Customer paid','Preparing','Ready for pickup','Completed'];
 return <section className={'feast-order-flow tone-'+stage.tone} aria-label="Feast order flow"><h2>FEAST ORDER FLOW</h2><p className="feast-flow-current" role="status"><span>CURRENT STATUS</span><strong>{stage.label}</strong></p>
 <ol className="feast-flow-steps">{steps.map((s,i)=><li key={s} className={stage.step===i?'is-current':stage.step>i?'is-done':''} aria-current={stage.step===i?'step':undefined}><b>{stage.step>i?'✓':i+1}</b>{s}</li>)}</ol>
 {order.automationAttention?<p className="feast-notice">{order.automationAttention}</p>:null}
 {order.state==='Approved'&&balance!==null&&balance>0?<div className="feast-payment-request"><div><span>FEAST BALANCE DUE</span><strong>{feastMoney(balance)}</strong><p>{order.paymentRequestedAt?'Payment request sent '+date(order.paymentRequestedAt):'Approve and send the payment request to start the payment window.'}</p>{order.paymentWarningSentAt?<p><b>Cancellation deadline: {date(new Date(new Date(order.paymentWarningSentAt).getTime()+24*3600000).toISOString())}</b></p>:order.paymentRequestedAt?<p>Warning scheduled after {date(new Date(new Date(order.paymentRequestedAt).getTime()+48*3600000).toISOString())} if unpaid.</p>:null}</div></div>:null}
 <details open><summary>Order flow history</summary><ol className="feast-flow-history">{!events.some(e=>e.kind==='request')?<li><time>{date(order.createdAt)}</time> Order received</li>:null}{events.map(e=><li key={e.id}><time>{date(e.created_at)}</time> {e.label} <small>· v.{e.version}</small></li>)}</ol></details>
 </section>;
}
