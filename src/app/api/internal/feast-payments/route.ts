import {createHash,timingSafeEqual} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {withDatabase} from '@/lib/database';
import {processFeastFollowups} from '@/lib/feast-automation';
export const runtime='nodejs';export const maxDuration=300;
export async function POST(request:NextRequest){const token=request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{40,100})$/)?.[1];if(!token)return NextResponse.json({error:'Unauthorized'},{status:401});
 const expected=await withDatabase(async c=>(await c.query("SELECT value->>'hash' AS hash FROM website.settings WHERE key='feast_automation_key_hash'")).rows[0]?.hash||''),actual=createHash('sha256').update(token).digest('hex');if(expected.length!==actual.length||!timingSafeEqual(Buffer.from(expected),Buffer.from(actual)))return NextResponse.json({error:'Unauthorized'},{status:401});
 try{return NextResponse.json(await processFeastFollowups(),{headers:{'Cache-Control':'no-store'}});}catch{return NextResponse.json({error:'Feast follow-ups could not complete. Check service logs and retry.'},{status:503});}}
