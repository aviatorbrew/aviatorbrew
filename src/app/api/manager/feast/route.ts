import {NextRequest,NextResponse} from 'next/server';
import {isManager} from '@/lib/manager-auth';
import {changeFeastState,getFeastOrder,createFeastOrder,feastAccessLink,FeastError,getFeastSettings,listFeastOrders,manualFeastPayment,refreshFeastPayment,saveFeastSettings,updateFeastOrder} from '@/lib/feast-store';
import {deliverFeastMessages,listFeastDeliveries} from '@/lib/feast-messages';
import {feastToday} from '@/lib/feast';
import {publicSiteUrl} from '@/lib/site-url';
export const runtime='nodejs';export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
export async function GET(r:NextRequest){if(!isManager(r))return NextResponse.json({error:'Unauthorized'},{status:401,headers});try{const [settings,orders]=await Promise.all([getFeastSettings(),listFeastOrders(r.nextUrl.searchParams.get('month')||feastToday().slice(0,7),r.nextUrl.searchParams.get('q')||'')]);return NextResponse.json({settings,orders,deliveries:await listFeastDeliveries(orders.map(o=>o.id)),stripeConfigured:!!process.env.STRIPE_SECRET_KEY&&!!process.env.STRIPE_WEBHOOK_SECRET},{headers});}catch(e){return fail(e);}}
function fail(e:unknown){return NextResponse.json({error:e instanceof Error?e.message:'Could not update Feast orders.'},{status:e instanceof FeastError?e.status:400,headers});}
export async function POST(r:NextRequest){if(!isManager(r))return NextResponse.json({error:'Unauthorized'},{status:401,headers});try{const raw=await r.text();if(raw.length>250000)throw new FeastError('Request too large.',413);const b=JSON.parse(raw);
 switch(b.action){
 case 'settings':return NextResponse.json({settings:await saveFeastSettings(b.settings,b.version)},{headers});
 case 'create':{const result=await createFeastOrder(b.input,b.requestKey,true);return NextResponse.json({order:result.order},{status:201,headers});}
 case 'save':return NextResponse.json({order:await updateFeastOrder(b.id,b.version,b.input,b.internalNotes||'')},{headers});
 case 'state':{const before=await getFeastOrder(b.id),order=await changeFeastState(b.id,b.version,b.state,b.internalNotes),notification=b.state==='Approved'&&before?.state!=='Approved'?await deliverFeastMessages(b.id,'approval').catch(()=>({status:'unknown'})):null;return NextResponse.json({order,notification,deliveries:await listFeastDeliveries([b.id])},{headers});}
 case 'retry-email':{if(b.confirmed!==true||!['request','approval'].includes(b.kind)||!Number.isInteger(b.version)||typeof b.deliveryId!=='string')throw new FeastError('Confirm the customer email before retrying.');const notification=await deliverFeastMessages(b.id,b.kind,b.retryUncertainConfirmed===true,{version:b.version,id:b.deliveryId});return NextResponse.json({notification,deliveries:await listFeastDeliveries([b.id])},{headers});}
 case 'manual-payment':if(b.confirmed!==true)throw new FeastError('Confirm that full payment was received.');return NextResponse.json({order:await manualFeastPayment(b.id,b.version,b.reference)},{headers});
 case 'access-link':{const {token}=await feastAccessLink(b.id);return NextResponse.json({url:publicSiteUrl()+'/feast#token='+token},{headers});}
 case 'refresh-payment':return NextResponse.json({order:await refreshFeastPayment(b.id)},{headers});
 case 'expire-checkout':if(b.confirmed!==true)throw new FeastError('Confirm expiry of the active checkout.');return NextResponse.json({order:await refreshFeastPayment(b.id,true)},{headers});
 default:throw new FeastError('Unknown Feast action.');}
 }catch(e){return fail(e);}}
