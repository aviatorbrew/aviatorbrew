import {sendMail} from '@/lib/mail';

export const eventsEmail='events@aviatorbrew.com';
// Copy the events team on customer correspondence; avoid a redundant CC on internal mail.
export function sendEventMail(message:Parameters<typeof sendMail>[0]){
 const addresses=(value:string|undefined)=>(value||'').split(',').map(s=>s.trim()).filter(Boolean);
 const to=addresses(message.to),cc=addresses(message.cc);
 if(![...to,...cc].some(s=>s.toLowerCase()===eventsEmail))cc.push(eventsEmail);
 return sendMail({...message,cc:cc.length?cc.join(', '):undefined});
}
