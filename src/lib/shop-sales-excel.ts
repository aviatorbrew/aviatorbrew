import ExcelJS from 'exceljs';
import {shopSalesRows} from '@/lib/shop-sales-documents';
import type {ShopSalesReport} from '@/lib/shop-sales';

const currencyFormat='"$"#,##0.00;[Red]("$"#,##0.00)';
const date=(value:string)=>new Date(value).toLocaleString('en-US',{timeZone:'America/New_York',dateStyle:'medium',timeStyle:'short'})+' Eastern';
const amount=(cents:number|null)=>cents===null?'Not recorded':cents/100;
type Column={header:string;width:number;format?:string};

// Only primitive numbers and text are written. Product names and notes that
// start with =, +, - or @ remain text, never spreadsheet formulas or links.
function cell(value:unknown,column:Column):string|number{
 if(column.format===currencyFormat){if(value===''||value===null||value===undefined)return 'Not recorded';const number=Number(value);return Number.isFinite(number)?number:String(value);}
 if(column.format==='0.00%')return value===''?'Not recorded':Number(value)/100;
 return typeof value==='number'?value:String(value??'');
}
function addSheet(workbook:ExcelJS.Workbook,name:string,columns:Column[],rows:unknown[][],hasTotal=false){
 const sheet=workbook.addWorksheet(name,{views:[{state:'frozen',ySplit:1}],pageSetup:{orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0}});
 sheet.columns=columns.map(c=>({header:c.header,width:c.width,style:{alignment:{vertical:'top',wrapText:true},...(c.format?{numFmt:c.format}:{})}}));
 for(const values of rows)sheet.addRow(columns.map((column,i)=>cell(values[i],column)));
 const header=sheet.getRow(1);header.height=32;header.font={bold:true,color:{argb:'FFFFFFFF'}};header.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF102B3E'}};
 if(rows.length)sheet.autoFilter={from:{row:1,column:1},to:{row:rows.length+1-(hasTotal?1:0),column:columns.length}};
 if(hasTotal){const total=sheet.lastRow!;total.font={bold:true};total.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFEAF0F3'}};}
 sheet.pageSetup.printTitlesRow='1:1';
 return sheet;
}
function exportSheet(workbook:ExcelJS.Workbook,report:ShopSalesReport,kind:'items'|'orders'|'tax',name:string){
 const [headers,...rows]=shopSalesRows(report,kind);
 if(kind==='tax'){const reason=headers.indexOf('Reason'),rate=headers.indexOf('Rate percent');for(const row of rows)if(String(row[reason]).includes('review'))row[rate]='';}
 const columns=headers.map((value):Column=>{const header=String(value);return {header,width:/notes|review|reason|lookup/i.test(header)?65:/Item$|Option|Stripe session/.test(header)?34:22,...(header.endsWith(' USD')?{format:currencyFormat}:header==='Rate percent'?{format:'0.00%'}:{})};});
 addSheet(workbook,name,columns,rows,kind==='items'||kind==='orders');
}
export async function shopSalesExcel(report:ShopSalesReport){
 const workbook=new ExcelJS.Workbook();
 workbook.creator='Aviator Brewing Company';workbook.title='Shop Sales — '+report.monthLabel;workbook.subject='Monthly website shop sales and tax records';workbook.created=new Date(report.generatedAt);
 const [metrics,values]=shopSalesRows(report,'summary');
 const summaryRows=metrics.flatMap((metric,i)=>metric==='Report notes'?[]:[[String(metric),values[i]]]);
 summaryRows.push(['Report period',report.monthLabel],['Payment date timezone',report.timezone],['Generated',date(report.generatedAt)],['Orders requiring refund reconciliation',report.totals.refundReviewOrders]);
 summaryRows.push(...report.notes.map((note,i)=>['Report note '+(i+1),note]));
 const sources=[...new Set(report.taxRecords.flatMap(r=>r.quote.sources))];
 summaryRows.push(...sources.map((source,i)=>['Tax reference '+(i+1),source]));
 const summary=addSheet(workbook,'Summary',[{header:'Metric',width:45},{header:'Value',width:110}],summaryRows);
 summary.autoFilter=undefined;
 for(let i=0;i<summaryRows.length;i++){
  const [label,value]=summaryRows[i],row=summary.getRow(i+2);
  if(String(label).endsWith(' USD')){row.getCell(2).value=value===''?'Not recorded':Number(value);row.getCell(2).numFmt=currencyFormat;}
  else if(typeof value==='number')row.getCell(2).numFmt='#,##0';
  if(String(label).startsWith('Report note'))row.height=Math.max(30,Math.ceil(String(value).length/105)*15);
 }
 exportSheet(workbook,report,'items','Items sold');
 exportSheet(workbook,report,'orders','Orders');
 addSheet(workbook,'Destinations',[
  {header:'Country',width:18},{header:'State',width:18},{header:'County',width:30},{header:'Paid orders',width:18},
  {header:'Item sales before refunds USD',width:24,format:currencyFormat},{header:'Shipping USD',width:20,format:currencyFormat},
  {header:'Recorded tax USD',width:22,format:currencyFormat},{header:'Payments before refunds USD',width:26,format:currencyFormat},
 ],report.locations.map(l=>[l.country,l.state,l.county,l.orders,l.salesCents/100,l.shippingCents/100,amount(l.taxCents),l.collectedCents/100]));
 exportSheet(workbook,report,'tax','Tax records');
 return workbook.xlsx.writeBuffer();
}
