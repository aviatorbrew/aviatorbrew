import { withDatabase } from "@/lib/database";
import { expireShopCheckout, markShopOrderPaid } from "@/lib/shop";
import { closeShopStripeSession, readShopStripeSession } from "@/lib/shop-ticket-checkout";

export async function processShopTicketCutoffs() {
  const rows=await withDatabase(async c=>(await c.query("SELECT stripe_session_id FROM website.shop_orders WHERE status='pending' AND stripe_session_id LIKE 'cs_%' AND (metadata->>'containsTickets'='true' OR metadata->>'ticketOnly'='true') AND ((metadata->>'ticketCutoffAt')::timestamptz<=now() OR checkout_expires_at<=now()) ORDER BY checkout_expires_at LIMIT 100")).rows);
  let expired=0,paid=0,attention=0;
  let cursor=0;
  async function run(){while(cursor<rows.length){const row=rows[cursor++];
    try{
      const session=await readShopStripeSession(row.stripe_session_id);
      if(session.payment_status==='paid'){await markShopOrderPaid(session.id,session);paid++;}
      else if(session.status==='expired'||await closeShopStripeSession(session.id,session)){await expireShopCheckout(session.id);expired++;}
      else if(session.status==='complete'){
        // A provider processing state must keep its seats until a verified payment or failure.
        await withDatabase(async c=>c.query("UPDATE website.shop_orders SET checkout_expires_at=GREATEST(checkout_expires_at,now()+interval '30 minutes') WHERE stripe_session_id=$1 AND status='pending'",[session.id]),{skipSchema:true});attention++;
      }else attention++;
    }catch{attention++;}
  }}
  await Promise.all(Array.from({length:Math.min(8,rows.length)},run));
  return {examined:rows.length,expired,paid,attention};
}

export function startShopTicketCutoffWorker(){
  const state=globalThis as typeof globalThis & {aviatorTicketCutoffWorker?:boolean};
  if(state.aviatorTicketCutoffWorker)return;state.aviatorTicketCutoffWorker=true;
  console.info('shop.ticket_cutoff_worker_started');
  async function tick(){
    let delay=60000;
    try{
      const result=await processShopTicketCutoffs();
      if(result.examined>=100)delay=1;
      if(result.attention){delay=5000;console.error('shop.ticket_cutoff_retry_needed',{count:result.attention});}
      const next=await withDatabase(async c=>(await c.query("SELECT min(next_time) AS next FROM (SELECT LEAST((metadata->>'ticketCutoffAt')::timestamptz,checkout_expires_at) AS next_time FROM website.shop_orders WHERE status='pending' AND stripe_session_id LIKE 'cs_%' AND (metadata->>'containsTickets'='true' OR metadata->>'ticketOnly'='true')) q WHERE next_time>now()")).rows[0]?.next,{skipSchema:true});
      if(next)delay=Math.min(delay,Math.max(1,new Date(next).getTime()-Date.now()));
    }catch{delay=5000;console.error('shop.ticket_cutoff_worker_retry');}
    setTimeout(tick,delay).unref();
  }
  void tick();
}
