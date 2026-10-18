import { createHmac,timingSafeEqual } from "node:crypto";
export function verifyStripeSignature(secret:string,header:string,body:string,now=Date.now()){
 const parts=header.split(',').map(p=>p.trim()),timestamp=parts.find(p=>p.startsWith('t='))?.slice(2);
 if(!timestamp||!/^\d+$/.test(timestamp)||Math.abs(now/1000-Number(timestamp))>300)return false;
 const expected=createHmac('sha256',secret).update(timestamp+'.'+body).digest('hex');
 return parts.filter(p=>p.startsWith('v1=')).some(p=>{const signature=p.slice(3);return /^[a-f0-9]{64}$/i.test(signature)&&timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(signature,'hex'));});
}
