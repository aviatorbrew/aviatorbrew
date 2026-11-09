import {NextRequest,NextResponse} from 'next/server';
import {isManager} from '@/lib/manager-auth';
import {getFoodCostUpdates,installRoughFoodCosts,processWeeklyFoodCosts} from '@/lib/food-cost-updates';
export const runtime='nodejs';export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow'};
export async function GET(r:NextRequest){if(!isManager(r))return NextResponse.json({error:'Unauthorized'},{status:401,headers});return NextResponse.json(await getFoodCostUpdates(),{headers});}
export async function POST(r:NextRequest){if(!isManager(r))return NextResponse.json({error:'Unauthorized'},{status:401,headers});try{const b=await r.json();if(b.action==='install-rough-estimates')await installRoughFoodCosts();else if(b.action==='check-public-prices')await processWeeklyFoodCosts(true);else throw new Error('Choose a valid internal cost action.');return NextResponse.json(await getFoodCostUpdates(),{headers});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Could not update internal costs.'},{status:400,headers});}}
