import { verifyShopTaxQuote } from "@/lib/shop-tax-quote";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prepareShopCart, recordShopCheckout, type ShopCartRequestItem } from "@/lib/shop";
import { ticketGuest, ticketGuestLists, ticketCutoff } from "@/lib/shop-tickets";
import { attachShopCheckout, abandonShopCheckout } from "@/lib/shop-ticket-checkout";
import { normalizeShippingAddress, verifyShippingToken, type ShopShippingAddress } from "@/lib/shop-shipping";
import { createShopCartCheckoutSession } from "@/lib/stripe";
import { publicSiteUrl } from "@/lib/site-url";
import { requestBodyExceeds } from "@/lib/server-file-response";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  let reservation: string | undefined, session: Awaited<ReturnType<typeof createShopCartCheckoutSession>> = null;
  try {
    if(requestBodyExceeds(request,200000))return NextResponse.json({error:"The guest list is too large."},{status:413});
    const body = await request.json() as {items?:ShopCartRequestItem[];email?:string;name?:string;firstName?:string;lastName?:string;ticketGuests?:unknown;phone?:string;address?:Partial<ShopShippingAddress>;shippingToken?:string;taxToken?:string};
    const email=String(body.email||"").trim().toLowerCase();
    if(!/^\S+@\S+\.\S+$/.test(email))return NextResponse.json({error:"Enter a valid email address."},{status:400});
    const cart=await prepareShopCart(body.items||[]),tickets=cart.merchandiseItems.filter(i=>i.productType==='ticket');
    const purchaser=tickets.length?ticketGuest({firstName:body.firstName,lastName:body.lastName}):null;
    const guests=ticketGuestLists(body.ticketGuests,cart.merchandiseItems);
    const customerName=purchaser?`${purchaser.firstName} ${purchaser.lastName}`:String(body.name||body.address?.name||"").trim().slice(0,120);
    if(!customerName)throw new Error("Enter the purchaser or shipping name.");
    let address:ShopShippingAddress|undefined,shipping:{carrier:string;service:string;amountCents:number;rateId:string}|undefined;
    if(cart.requiresShipping){address=normalizeShippingAddress({...body.address,name:customerName,phone:body.phone||body.address?.phone||""});if(!body.shippingToken)throw new Error("Calculate and choose a shipping rate.");shipping=verifyShippingToken(body.shippingToken,cart,address);}
    const taxQuote=verifyShopTaxQuote(String(body.taxToken||""),cart,shipping?.amountCents||0,address);
    const deadlines=tickets.map(i=>ticketCutoff({ticketEventStartsAt:i.ticketEventStartsAt,ticketSalesEndAt:i.ticketSalesEndAt||""})).filter((v):v is number=>v!==null),cutoff=deadlines.length?Math.min(...deadlines):null;
    const nowSeconds=Math.floor(Date.now()/1000),standardExpiry=nowSeconds+31*60,proposed=cutoff?Math.min(standardExpiry,Math.floor(cutoff/1000)):standardExpiry,expiresAt=proposed>=nowSeconds+30*60+30?proposed:standardExpiry;
    reservation='shop_pending_'+randomUUID();
    const {orderId}=await recordShopCheckout({stripeSessionId:reservation,checkoutExpiresAt:new Date(expiresAt*1000).toISOString(),cart,taxQuote,customerEmail:email,customerName,customerFirstName:purchaser?.firstName,customerLastName:purchaser?.lastName,ticketGuests:guests,customerPhone:String(body.phone||""),shippingCents:shipping?.amountCents||0,shippingAddress:address,shippingProvider:shipping?.carrier||(cart.ticketOnly?'ticket':''),shippingService:shipping?.service||(cart.ticketOnly?'Event admission':''),shippingRateId:shipping?.rateId||(cart.ticketOnly?'no-shipping-ticket':'')});
    session=await createShopCartCheckoutSession({taxCents:taxQuote.taxCents||0,preparedFoodTaxCents:taxQuote.pfbTaxCents,items:cart.items.map(i=>({name:i.productName,description:i.variantLabel,unitAmount:i.unitPriceCents,quantity:i.quantity})),customerEmail:email,idempotencyKey:'shop-order-'+orderId,expiresAt,cardOnly:tickets.length>0,metadata:{item:'shop-new',shopOrderId:String(orderId),cartItems:String(cart.merchandiseItems.length),bonusApplied:cart.bonusItem?'true':'false',containsTickets:tickets.length?'true':'false'},shipping:shipping&&address?{displayName:shipping.carrier+' '+shipping.service,amountCents:shipping.amountCents,address,phone:String(body.phone||'')}:undefined,successPath:'/shop-new/cart?checkout=success&session_id={CHECKOUT_SESSION_ID}',cancelPath:'/shop-new/cart?checkout=cancel',origin:['aviatorbrew.com','www.aviatorbrew.com'].includes(request.nextUrl.hostname)?'https://aviatorbrew.com':publicSiteUrl(request.nextUrl.origin)});
    if(!session)throw new Error("Online shop payments are not configured yet.");
    await attachShopCheckout(reservation,session);
    return NextResponse.json({url:session.url,id:session.id},{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    if(reservation)try{await abandonShopCheckout(reservation,session?.id);}catch{console.error('Shop checkout cleanup requires retry.');}
    return NextResponse.json({error:error instanceof Error?error.message:'Could not start shop checkout.'},{status:400,headers:{'Cache-Control':'no-store'}});
  }
}
