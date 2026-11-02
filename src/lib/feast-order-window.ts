const zone='America/New_York';
const local=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
export const feastOrderWindowCopy='Pickup days for new orders: Wednesday–Sunday. Please place your order at least 4 days (96 hours) before pickup. Every order requires Aviator approval before it is confirmed.';
export const feastPickupDaysError='Pickups are available Wednesday through Sunday. Please choose one of those days.';
function parts(at:Date){const p=Object.fromEntries(local.formatToParts(at).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));return {date:`${p.year}-${p.month}-${p.day}`,time:`${p.hour}:${p.minute}:${p.second}`};}
export function feastPickupDayAllowed(date:string){const parsed=new Date(date+'T12:00:00Z');return /^\d{4}-\d{2}-\d{2}$/.test(date)&&!Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===date&&[0,3,4,5,6].includes(parsed.getUTCDay());}
export function feastPickupInstant(date:string,time:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)||Number.isNaN(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw new Error('Choose a valid pickup date and time.');
 const target=Date.parse(date+'T'+time+':00Z');let utc=target;
 for(let n=0;n<4;n++){const p=parts(new Date(utc)),view=Date.parse(p.date+'T'+p.time+'Z'),difference=target-view;if(!difference)return new Date(utc);utc+=difference;}
 throw new Error('This pickup time does not exist in Eastern time. Choose another time.');
}
export function feastPickupLeadTimeError(date:string,time:string,orderedAt=new Date()):string|null {
 let pickup:Date;try{pickup=feastPickupInstant(date,time);}catch(e){return (e as Error).message;}
 return pickup.getTime()-orderedAt.getTime()<96*3600000?'Please allow at least 4 days (96 hours) between ordering and pickup.':null;
}
export function feastPickupWindowError(date:string,time:string,orderedAt=new Date()):string|null {
 const leadTime=feastPickupLeadTimeError(date,time,orderedAt);return leadTime||(!feastPickupDayAllowed(date)?feastPickupDaysError:null);
}
export function assertFeastPickupWindow(date:string,time:string,orderedAt=new Date()){const error=feastPickupWindowError(date,time,orderedAt);if(error)throw new Error(error);}
export function earliestFeastPickupDate(now=new Date()){
 const first=parts(new Date(now.getTime()+96*3600000)).date;
 for(let n=0;n<10;n++){const date=new Date(Date.parse(first+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);if(!feastPickupWindowError(date,'17:00',now))return date;}
 return first;
}
export function feastOrderWindowNotice(date:string,alreadyApproved:boolean){return alreadyApproved&&!feastPickupDayAllowed(date)?'Your previously approved pickup date is retained. Contact Aviator before changing it. '+feastOrderWindowCopy:feastOrderWindowCopy;}
