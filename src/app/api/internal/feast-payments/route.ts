import {createHash,timingSafeEqual} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {withDatabase} from '@/lib/database';
import {processFeastFollowups} from '@/lib/feast-automation';
import {processWeeklyFoodCosts} from '@/lib/food-cost-updates';
import {processShopTicketCutoffs} from '@/lib/shop-ticket-cutoffs';
export const runtime='nodejs';export const maxDuration=300;
export async function POST(request:NextRequest){const token=request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{40,100})$/)?.[1];if(!token)return NextResponse.json({error:'Unauthorized'},{status:401});
 const expected=await withDatabase(async c=>(await c.query("SELECT value->>'hash' AS hash FROM website.settings WHERE key='feast_automation_key_hash'")).rows[0]?.hash||''),actual=createHash('sha256').update(token).digest('hex');if(expected.length!==actual.length||!timingSafeEqual(Buffer.from(expected),Buffer.from(actual)))return NextResponse.json({error:'Unauthorized'},{status:401});
 try{const ticketCutoffs=await processShopTicketCutoffs();const followups=await processFeastFollowups();let foodCosts:unknown;try{foodCosts=await processWeeklyFoodCosts();}catch{foodCosts={attention:'Weekly food-cost check failed; previous estimates retained.'};console.error('food_costs.weekly_check_failed');}return NextResponse.json({...followups,ticketCutoffs,foodCosts},{headers:{'Cache-Control':'no-store'}});}catch{return NextResponse.json({error:'Scheduled follow-ups could not complete. Check service logs and retry.'},{status:503});}}
