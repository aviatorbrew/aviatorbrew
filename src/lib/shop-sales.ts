import {withDatabase} from '@/lib/database';

export type ShopSalesItem={productId:string;variantId:string;name:string;option:string;kind:string;units:number;bonusUnits:number;salesCents:number;orders:number};
export type ShopSalesOrder={id:string;paidAt:string;status:string;sessionId:string;salesCents:number;shippingCents:number;taxCents:number|null;collectedCents:number;differenceCents:number;units:number;bonusUnits:number;country:string;state:string;county:string;notes:string[]};
export type ShopSalesLocation={country:string;state:string;county:string;orders:number;salesCents:number;shippingCents:number;taxCents:number|null;missingTaxOrders:number;collectedCents:number};
export type ShopSalesReport={month:string;monthLabel:string;generatedAt:string;timezone:string;orders:ShopSalesOrder[];items:ShopSalesItem[];locations:ShopSalesLocation[];totals:{orders:number;units:number;bonusUnits:number;salesCents:number;shippingCents:number;collectedCents:number;taxCents:number|null;knownTaxCents:number;missingTaxOrders:number;reviewOrders:number;refundReviewOrders:number};excluded:{unpaid:number;test:number;missingPaidDate:number};notes:string[]};
export type SalesSourceItem={productId?:unknown;variantId?:unknown;name:string;option:string;kind:string;quantity:number;unitPriceCents:number;isBonus:boolean};
export type SalesSourceOrder={id:unknown;paidAt:string;status:string;sessionId:string;salesCents:number;shippingCents:number;collectedCents:number;metadata:Record<string,unknown>;address:Record<string,unknown>;items:SalesSourceItem[]};
export function shopSalesMonth(value:string){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)||Number(value.slice(0,4))<2000||Number(value.slice(0,4))>9998)throw new Error('Choose a valid report month.');
 return value;
}
export function currentShopSalesMonth(now=new Date()){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit'}).formatToParts(now);
 return parts.find(p=>p.type==='year')!.value+'-'+parts.find(p=>p.type==='month')!.value;
}
const add=(a:number,b:number)=>{const value=a+b;if(!Number.isSafeInteger(value))throw new Error('The sales total is too large to report accurately.');return value;};
function cents(value:unknown,label:string){const result=Number(value);if(!Number.isSafeInteger(result)||result<0)throw new Error('Invalid '+label+' in a stored order.');return result;}
function recordedTax(metadata:Record<string,unknown>){
 const value=metadata.taxCents??metadata.tax_cents;
 return (typeof value==='number'||typeof value==='string'&&/^\d+$/.test(value))&&Number.isSafeInteger(Number(value))&&Number(value)>=0?Number(value):null;
}
export function buildShopSalesReport(month:string,source:SalesSourceOrder[],excluded:ShopSalesReport['excluded'],now=new Date()):ShopSalesReport{
 shopSalesMonth(month);
 const itemGroups=new Map<string,{item:ShopSalesItem;orders:Set<string>}>(),locationGroups=new Map<string,ShopSalesLocation>();
 const totals:ShopSalesReport['totals']={orders:source.length,units:0,bonusUnits:0,salesCents:0,shippingCents:0,collectedCents:0,taxCents:0,knownTaxCents:0,missingTaxOrders:0,reviewOrders:0,refundReviewOrders:0};
 const orders=source.map(row=>{
  const order:ShopSalesOrder={id:String(row.id),paidAt:new Date(row.paidAt).toISOString(),status:row.status,sessionId:row.sessionId,salesCents:cents(row.salesCents,'item sales'),shippingCents:cents(row.shippingCents,'shipping'),collectedCents:cents(row.collectedCents,'payment'),taxCents:recordedTax(row.metadata||{}),differenceCents:0,units:0,bonusUnits:0,country:row.address?.country?String(row.address.country).toUpperCase():'Not recorded',state:row.address?.state?String(row.address.state).toUpperCase():'Not recorded',county:String(row.address?.county||'Not recorded'),notes:[]};
  if(order.taxCents===null){totals.missingTaxOrders++;order.notes.push('Sales tax not separately recorded');}else totals.knownTaxCents=add(totals.knownTaxCents,order.taxCents);
  order.differenceCents=order.collectedCents-order.salesCents-order.shippingCents-(order.taxCents??0);
  if(order.differenceCents)order.notes.push('Payment total has an unexplained adjustment');
  if(['refunded','cancelled'].includes(order.status)){order.notes.push('Reconcile refund amount and date in Stripe');totals.refundReviewOrders++;}
  let lineSales=0;
  for(const rowItem of row.items){
   const quantity=cents(rowItem.quantity,'item quantity'),line=cents(rowItem.unitPriceCents,'item price')*quantity;
   if(!Number.isSafeInteger(line))throw new Error('A stored item total is too large.');
   const isBonus=rowItem.isBonus===true;
   order.units=add(order.units,isBonus?0:quantity);order.bonusUnits=add(order.bonusUnits,isBonus?quantity:0);lineSales=add(lineSales,isBonus?0:line);
   const key=JSON.stringify([String(rowItem.productId??''),String(rowItem.variantId??''),rowItem.name,rowItem.option,rowItem.kind]);
   let group=itemGroups.get(key);if(!group){group={item:{productId:String(rowItem.productId??''),variantId:String(rowItem.variantId??''),name:rowItem.name,option:rowItem.option,kind:rowItem.kind,units:0,bonusUnits:0,salesCents:0,orders:0},orders:new Set()};itemGroups.set(key,group);}
   group.item.units=add(group.item.units,isBonus?0:quantity);group.item.bonusUnits=add(group.item.bonusUnits,isBonus?quantity:0);group.item.salesCents=add(group.item.salesCents,isBonus?0:line);group.orders.add(order.id);
  }
  if(lineSales!==order.salesCents)order.notes.push('Stored item lines do not match the order subtotal');
  if(order.notes.length)totals.reviewOrders++;
  for(const key of ['units','bonusUnits','salesCents','shippingCents','collectedCents'] as const)totals[key]=add(totals[key],order[key]);
  const locationKey=JSON.stringify([order.country,order.state,order.county]);let location=locationGroups.get(locationKey);
  if(!location){location={country:order.country,state:order.state,county:order.county,orders:0,salesCents:0,shippingCents:0,taxCents:0,missingTaxOrders:0,collectedCents:0};locationGroups.set(locationKey,location);}
  location.orders++;for(const key of ['salesCents','shippingCents','collectedCents'] as const)location[key]=add(location[key],order[key]);
  if(order.taxCents===null){location.missingTaxOrders++;location.taxCents=null;}else if(location.taxCents!==null)location.taxCents=add(location.taxCents,order.taxCents);
  return order;
 });
 totals.taxCents=totals.missingTaxOrders?null:totals.knownTaxCents;
 const notes=['Website shop merchandise and event tickets only. Private events, catering, feast orders, tours and bar/POS sales are outside this report.','Month is based on recorded payment date in America/New_York, not checkout creation date. Test and unpaid orders are excluded.','Sales and payments are shown before refunds. Refund amounts, refund dates and chargebacks are not synced to this order log; reconcile them in Stripe before filing.'];
 if(totals.missingTaxOrders)notes.push(`Sales tax is not separately recorded for ${totals.missingTaxOrders} paid order(s). Missing tax is shown as Not recorded, not zero. Verify tax collected before filing.`);
 if(excluded.missingPaidDate)notes.push(`${excluded.missingPaidDate} order(s) marked paid/processing/shipped have no recorded payment date and are excluded pending review.`);
 return {month,monthLabel:new Date(month+'-15T12:00:00Z').toLocaleString('en-US',{month:'long',year:'numeric',timeZone:'UTC'}),generatedAt:now.toISOString(),timezone:'America/New_York',orders,items:[...itemGroups.values()].map(g=>({...g.item,orders:g.orders.size})).sort((a,b)=>a.name.localeCompare(b.name)||a.option.localeCompare(b.option)||a.kind.localeCompare(b.kind)),locations:[...locationGroups.values()].sort((a,b)=>(a.country+a.state+a.county).localeCompare(b.country+b.state+b.county)),totals,excluded,notes};
}

export async function getShopSalesReport(month:string){
 shopSalesMonth(month);
 // One statement keeps monthly totals, historical item snapshots and exclusions consistent.
 const row=await withDatabase(async client=>(await client.query(`WITH bounds AS (SELECT ($1::date::timestamp AT TIME ZONE 'America/New_York') AS start_at,(($1::date+interval '1 month')::timestamp AT TIME ZONE 'America/New_York') AS end_at),
 source AS (SELECT o.*, (o.is_test_order IS TRUE OR o.status='test' OR left(COALESCE(o.stripe_session_id,''),8)='cs_test_') AS test FROM website.shop_orders o),
 paid AS (SELECT o.* FROM source o,bounds b WHERE NOT o.test AND o.paid_at>=b.start_at AND o.paid_at<b.end_at)
 SELECT COALESCE((SELECT jsonb_agg(jsonb_build_object('id',o.id::text,'paidAt',o.paid_at,'status',o.status,'sessionId',o.stripe_session_id,'salesCents',o.subtotal_cents,'shippingCents',o.shipping_cents,'collectedCents',o.amount_total_cents,'metadata',o.metadata,'address',o.shipping_address,'items',COALESCE((SELECT jsonb_agg(jsonb_build_object('productId',i.product_id::text,'variantId',i.variant_id::text,'name',i.product_name,'option',i.variant_label,'kind',CASE WHEN i.ticket_details<>'{}'::jsonb OR EXISTS(SELECT 1 FROM website.shop_ticket_purchases t WHERE t.order_item_id=i.id) OR (o.metadata->>'ticketOnly'='true' AND i.is_bonus=false) THEN 'Ticket' ELSE 'Merchandise' END,'quantity',i.quantity,'unitPriceCents',i.unit_price_cents,'isBonus',i.is_bonus) ORDER BY i.id) FROM website.shop_order_items i WHERE i.order_id=o.id),'[]'::jsonb)) ORDER BY o.paid_at,o.id) FROM paid o),'[]'::jsonb) AS orders,
 (SELECT count(*)::int FROM source o,bounds b WHERE NOT o.test AND o.paid_at IS NULL AND o.created_at>=b.start_at AND o.created_at<b.end_at) AS unpaid,
 (SELECT count(*)::int FROM source o,bounds b WHERE o.test AND COALESCE(o.paid_at,o.created_at)>=b.start_at AND COALESCE(o.paid_at,o.created_at)<b.end_at) AS test,
 (SELECT count(*)::int FROM source o,bounds b WHERE NOT o.test AND o.paid_at IS NULL AND o.status IN ('paid','processing','shipped') AND o.created_at>=b.start_at AND o.created_at<b.end_at) AS missing_paid_date`,[month+'-01'])).rows[0]);
 return buildShopSalesReport(month,row.orders,{unpaid:row.unpaid,test:row.test,missingPaidDate:row.missing_paid_date});
}
