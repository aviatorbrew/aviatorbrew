import {NextRequest,NextResponse} from 'next/server';
import {sendFeastVerification,verifyFeastEmail} from '@/lib/feast-email-verification';
import {publicSiteUrl} from '@/lib/site-url';
import {FeastError} from '@/lib/feast-errors';
export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
export async function POST(request:NextRequest){try{
 const origin=request.headers.get('origin');if(origin&&new URL(origin).host!==request.headers.get('host')&&origin!==request.nextUrl.origin&&origin!==publicSiteUrl())throw new FeastError('Use the Feast page to verify your email.',403);
 const raw=await request.text();if(raw.length>3000)throw new FeastError('Request too large.',413);const b=JSON.parse(raw);if(b.website)throw new FeastError('Please leave the website field empty.');
 if(b.action==='send')return NextResponse.json(await sendFeastVerification(b.email,request.headers.get('x-forwarded-for')?.split(',')[0].trim()||'unknown'),{headers});
 if(b.action==='verify')return NextResponse.json(await verifyFeastEmail(b),{headers});throw new FeastError('Unknown verification action.');
 }catch(e){return NextResponse.json({error:e instanceof FeastError?e.message:'Could not verify the email address.'},{status:e instanceof FeastError?e.status:400,headers});}}
