import {NextRequest,NextResponse} from 'next/server';
import {feastEmailCookie,feastEmailRememberSeconds,forgetFeastEmail,resumeFeastEmail,sendFeastVerification,verifyFeastEmail} from '@/lib/feast-email-verification';
import {publicSiteUrl} from '@/lib/site-url';
import {FeastError} from '@/lib/feast-errors';
export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
export async function POST(request:NextRequest){try{
 const origin=request.headers.get('origin');if(origin&&new URL(origin).host!==request.headers.get('host')&&origin!==request.nextUrl.origin&&origin!==publicSiteUrl())throw new FeastError('Use the Feast page to verify your email.',403);
 const raw=await request.text();if(raw.length>3000)throw new FeastError('Request too large.',413);const b=JSON.parse(raw);if(b.website)throw new FeastError('Please leave the website field empty.');
 if(b.action==='send')return NextResponse.json(await sendFeastVerification(b.email,request.headers.get('x-forwarded-for')?.split(',')[0].trim()||'unknown'),{headers});
 if(b.action==='resume'){const saved=await resumeFeastEmail(request.cookies.get(feastEmailCookie)?.value,b.email);return NextResponse.json(saved?{remembered:true,...saved}:{remembered:false},{headers});}
 if(b.action==='forget'){await forgetFeastEmail(request.cookies.get(feastEmailCookie)?.value);const response=NextResponse.json({forgotten:true},{headers});response.cookies.set(feastEmailCookie,'',{httpOnly:true,secure:process.env.NODE_ENV==='production'||request.nextUrl.protocol==='https:',sameSite:'lax',path:'/api/feast',maxAge:0});return response;}
 if(b.action==='verify'){const {rememberToken,...proof}=await verifyFeastEmail(b),response=NextResponse.json(proof,{headers});response.cookies.set(feastEmailCookie,rememberToken,{httpOnly:true,secure:process.env.NODE_ENV==='production'||request.nextUrl.protocol==='https:',sameSite:'lax',path:'/api/feast',maxAge:feastEmailRememberSeconds});return response;}throw new FeastError('Unknown verification action.');
 }catch(e){return NextResponse.json({error:e instanceof FeastError?e.message:'Could not verify the email address.'},{status:e instanceof FeastError?e.status:400,headers});}}
