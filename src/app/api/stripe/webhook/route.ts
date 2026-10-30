import {deliverFeastMessages} from '@/lib/feast-messages';
import {processFeastPayment,markFeastAttempt,FeastError} from "@/lib/feast-store";
import { verifyStripeSignature } from "@/lib/stripe-webhook-signature";
import { processProposalPayment, markProposalAttempt, ProposalError } from "@/lib/event-proposals";
import { NextRequest, NextResponse } from "next/server";
import { notifyPrivateEventPayment, type PrivateEventCheckoutSession } from "@/lib/private-event-payments";
import { markTourPaid } from "@/lib/tours";
import { expireShopCheckout, markShopOrderPaid } from "@/lib/shop";

export const runtime = "nodejs";

type StripeCheckoutEvent = {
  id?: string;
  type?: string;
  data?: {
    object?: PrivateEventCheckoutSession & {
      payment_status?: string;
    };
  };
};

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Stripe webhook is not configured." }, { status: 503 });
  const raw = await request.text();
  if (!verifyStripeSignature(secret, request.headers.get("stripe-signature") || "", raw)) return NextResponse.json({ error: "Invalid Stripe signature." }, { status: 400 });
  let event: StripeCheckoutEvent;
  try {event=JSON.parse(raw) as StripeCheckoutEvent;} catch {return NextResponse.json({error:"Invalid webhook JSON."},{status:400});}
  const session = event.data?.object;
  if(session?.metadata?.item === "aviator-feast") {
    try {
      if(!session.id||!event.id)return NextResponse.json({error:"Missing payment references."},{status:400});
      if((event.type==="checkout.session.completed"||event.type==="checkout.session.async_payment_succeeded")&&session.payment_status==="paid"){await processFeastPayment(session,event.id);const delivered=await deliverFeastMessages(session.metadata.orderId!,'paid');if(!['sent','none','skipped'].includes(delivered.status))return NextResponse.json({error:'FEAST payment recorded; customer notification requires retry.'},{status:503});}
      if(event.type==="checkout.session.expired")await markFeastAttempt(session,"expired");
      if(event.type==="checkout.session.async_payment_failed")await markFeastAttempt(session,"failed");
      return NextResponse.json({received:true});
    } catch(error){return NextResponse.json({error:error instanceof FeastError?error.message:"Could not record Feast payment; provider retry required."},{status:error instanceof FeastError?error.status:503});}
  }
  if(session?.metadata?.item === "private-event-proposal") {
    try {
      if(!session.id || !event.id) return NextResponse.json({error:"Missing Stripe event or session reference."},{status:400});
      if((event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") && session.payment_status === "paid") {
        if(!await processProposalPayment(session,event.id))return NextResponse.json({error:"Deposit recorded; confirmation delivery will retry."},{status:503});
      }
      if(event.type === "checkout.session.expired")await markProposalAttempt(session,"expired");
      if(event.type === "checkout.session.async_payment_failed")await markProposalAttempt(session,"failed");
      return NextResponse.json({received:true});
    } catch(error) {return NextResponse.json({error:error instanceof ProposalError ? error.message : "Could not record the deposit; provider retry required."},{status:error instanceof ProposalError?error.status:503});}
  }
  if (event.type === "checkout.session.expired" && session?.metadata?.item === "shop-new" && session.id) await expireShopCheckout(session.id);
  if (event.type === "checkout.session.completed" && session?.payment_status === "paid") {
    const signupId = session.metadata?.tourSignupId;
    if (signupId) await markTourPaid(signupId, session.id || "");
    if (session.metadata?.item === "shop-new" && session.id) {
      const notified = await markShopOrderPaid(session.id);
      if (!notified) return NextResponse.json({ error: "Payment received, but the shop order notification email could not be sent." }, { status: 503 });
    }
    if (session.metadata?.item === "private-event-room-booking") {
      if (!session.id) return NextResponse.json({ error: "Stripe Checkout session ID is missing." }, { status: 400 });
      const notified = await notifyPrivateEventPayment(session);
      if (!notified) return NextResponse.json({ error: "Payment received, but the event notification email could not be sent." }, { status: 503 });
    }
  }
  return NextResponse.json({ received: true });
}
