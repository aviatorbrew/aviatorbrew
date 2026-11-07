import {NextRequest,NextResponse} from 'next/server';
import {isManager} from '@/lib/manager-auth';
import {getShopTicketGuestRoster} from '@/lib/shop';
export const runtime='nodejs';export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store, max-age=0','X-Robots-Tag':'noindex, nofollow'};
export async function GET(request:NextRequest){if(!isManager(request))return NextResponse.json({error:'Unauthorized'},{status:401,headers});try{const id=Number(request.nextUrl.searchParams.get('productId'));if(!Number.isInteger(id)||id<1)throw Error('Choose a valid ticket event.');return new Response(await getShopTicketGuestRoster(id),{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'"}});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Could not load guest check-in list.'},{status:400,headers});}}
