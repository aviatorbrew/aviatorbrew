import {NextRequest,NextResponse} from 'next/server';
import {getShopTicketAvailability} from '@/lib/shop';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:NextRequest){const id=Number(request.nextUrl.searchParams.get('productId'));if(!Number.isInteger(id)||id<1)return NextResponse.json({error:'Choose a valid event.'},{status:400});const product=await getShopTicketAvailability(id);return NextResponse.json(product?{product}:{error:'Tickets are not currently available.'},{status:product?200:404,headers:{'Cache-Control':'no-store'}});}
