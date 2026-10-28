import {NextRequest,NextResponse} from 'next/server';
import {calculateFeast} from '@/lib/feast';
import {createFeastOrder,feastOrderByToken,FeastError,getFeastSettings,publicFeastOrder,startFeastCheckout} from '@/lib/feast-store';
import {deliverFeastMessages} from '@/lib/feast-messages';
import {feastDocumentPdf} from '@/lib/feast-documents';
export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow'};
export async function POST(request:NextRequest){try{
 const raw=await request.text();if(raw.length>40000)throw new FeastError('Order is too large.',413);let b;try{b=JSON.parse(raw);}catch{throw new FeastError('Invalid order request.');}
 if(b.action==='quote'){const {quote}=calculateFeast(b.input,await getFeastSettings());const {production:_,productionNotes:__,...customerQuote}=quote;return NextResponse.json({quote:customerQuote},{headers});}
 if(b.action==='submit'){if(b.website)throw new FeastError('Please leave the website field empty.');const r=await createFeastOrder(b.input,b.requestKey,false,b.verification);const notification=await deliverFeastMessages(r.order.id,'request').catch(()=>({status:'unknown'}));return NextResponse.json({order:publicFeastOrder(r.order),token:r.token,notification},{status:201,headers});}
 if(b.action==='checkout')return NextResponse.json(await startFeastCheckout(b.token,{name:b.name,agreed:b.agreed,policyVersion:b.policyVersion,version:b.version,userAgent:request.headers.get('user-agent')||'',ip:request.headers.get('x-forwarded-for')?.split(',')[0]}),{headers});
 const order=await feastOrderByToken(b.token);
 if(b.action==='receipt')return new Response(new Uint8Array(await feastDocumentPdf(order)),{headers:{...headers,'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${order.number}${order.paidCents?'-receipt':'-checkout-summary'}.pdf"`}});
 if(b.action!=='status')throw new FeastError('Unknown action.');
 const s=await getFeastSettings();return NextResponse.json({order:publicFeastOrder(order),paymentEnabled:s.onlinePaymentEnabled&&!!process.env.STRIPE_SECRET_KEY&&!!process.env.STRIPE_WEBHOOK_SECRET},{headers});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Could not process this Feast order.'},{status:e instanceof FeastError?e.status:e instanceof SyntaxError?400:400,headers});}}
