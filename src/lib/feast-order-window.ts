const zone='America/New_York';
const local=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
export const feastOrderWindowCopy='Order at least 4 days (96 hours) before pickup. Thursday and Friday orders cannot be picked up the following Monday or Tuesday. All orders require Aviator approval.';
function parts(at:Date){const p=Object.fromEntries(local.formatToParts(at).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));return {date:`${p.year}-${p.month}-${p.day}`,time:`${p.hour}:${p.minute}:${p.second}`};}
export function feastPickupInstant(date:string,time:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)||Number.isNaN(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw new Error('Choose a valid pickup date and time.');
 const target=Date.parse(date+'T'+time+':00Z');let utc=target;
 for(let n=0;n<4;n++){const p=parts(new Date(utc)),view=Date.parse(p.date+'T'+p.time+'Z'),difference=target-view;if(!difference)return new Date(utc);utc+=difference;}
 throw new Error('This pickup time does not exist in Eastern time. Choose another time.');
}
export function feastPickupWindowError(date:string,time:string,orderedAt=new Date()):string|null {
 let pickup:Date;try{pickup=feastPickupInstant(date,time);}catch(e){return (e as Error).message;}
 const orderDate=parts(orderedAt).date,day=new Date(orderDate+'T12:00:00Z').getUTCDay(),pickupDay=new Date(date+'T12:00:00Z').getUTCDay(),days=(Date.parse(date+'T00:00:00Z')-Date.parse(orderDate+'T00:00:00Z'))/86400000;
 if((day===4||day===5)&&(pickupDay===1||pickupDay===2)&&days>=0&&days<=5)return 'Thursday and Friday orders cannot be picked up the following Monday or Tuesday. Choose Wednesday or later.';
 if(pickup.getTime()-orderedAt.getTime()<96*3600000)return 'Please allow at least 4 days (96 hours) between ordering and pickup.';
 return null;
}
export function assertFeastPickupWindow(date:string,time:string,orderedAt=new Date()){const error=feastPickupWindowError(date,time,orderedAt);if(error)throw new Error(error);}
export function earliestFeastPickupDate(now=new Date()){
 const first=parts(new Date(now.getTime()+96*3600000)).date;
 for(let n=0;n<10;n++){const date=new Date(Date.parse(first+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);if(!feastPickupWindowError(date,'23:59',now))return date;}
 return first;
}
