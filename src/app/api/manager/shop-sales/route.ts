import {NextRequest,NextResponse} from 'next/server';
import {isManager} from '@/lib/manager-auth';
import {currentShopSalesMonth,getShopSalesReport,shopSalesMonth} from '@/lib/shop-sales';
import {shopSalesCsv,shopSalesPrintHtml} from '@/lib/shop-sales-documents';
export const runtime='nodejs';export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer'};
export async function GET(request:NextRequest){
 if(!isManager(request))return NextResponse.json({error:'Unauthorized'},{status:401,headers});
 try{
  const params=request.nextUrl.searchParams,month=shopSalesMonth(params.get('month')??currentShopSalesMonth()),format=params.get('format')||'json';
  if(!['json','print','summary-csv','items-csv','orders-csv'].includes(format))return NextResponse.json({error:'Choose a valid report format.'},{status:400,headers});
  const report=await getShopSalesReport(month);
  if(format==='print')return new Response(shopSalesPrintHtml(report),{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}});
  if(format.endsWith('-csv')){const kind=format.slice(0,-4) as 'summary'|'items'|'orders';return new Response(shopSalesCsv(report,kind),{headers:{...headers,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="aviator-shop-${kind}-${month}.csv"`}});}
  return NextResponse.json(report,{headers});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Could not load the monthly sales report.'},{status:error instanceof Error&&error.message==='Choose a valid report month.'?400:500,headers});}
}
