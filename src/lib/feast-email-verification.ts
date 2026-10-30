import {createHash,randomBytes,randomInt,randomUUID,timingSafeEqual} from 'node:crypto';
import type {PoolClient} from 'pg';
import {subscribeVerifiedNewsletterEmail} from '@/lib/newsletter';
import {withDatabase} from '@/lib/database';
import {isMailConfigured,sendMail} from '@/lib/mail';
import {FeastError} from '@/lib/feast-errors';
import type {FeastEmailProof} from '@/lib/feast';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const equal=(a:string,b:string)=>a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
function emailValue(value:unknown){const email=typeof value==='string'?value.trim().toLowerCase():'';if(email.length>200||!/^\S+@[^\s@,;]+\.[^\s@,;]+$/.test(email)||/[\r\n,;]/.test(email))throw new FeastError('Enter a valid email address.');return email;}
export async function sendFeastVerification(value:unknown,ip:string){
 const email=emailValue(value);if(!isMailConfigured())throw new FeastError('Email verification is temporarily unavailable. Please contact events@aviatorbrew.com.',503);
 const id=randomUUID(),session=randomBytes(32).toString('hex'),code=String(randomInt(1000000)).padStart(6,'0'),ipHash=hash(ip||'unknown');
 await withDatabase(async c=>{await c.query('BEGIN');try{
  await c.query("SELECT pg_advisory_xact_lock(hashtext('feast-email-verification-rate'))");
  const rate=(await c.query("SELECT count(*) FILTER(WHERE email=$1 AND created_at>now()-interval '15 minutes')::int AS email_recent,count(*) FILTER(WHERE email=$1)::int AS email_day,count(*) FILTER(WHERE ip_hash=$2 AND created_at>now()-interval '15 minutes')::int AS ip_recent,count(*) FILTER(WHERE ip_hash=$2)::int AS ip_day,coalesce(bool_or(email=$1 AND created_at>now()-interval '60 seconds'),false) AS cooldown FROM website.feast_email_verifications WHERE state<>'remembered' AND created_at>now()-interval '1 day'",[email,ipHash])).rows[0];
  if(rate.cooldown||rate.email_recent>=3||rate.email_day>=10||rate.ip_recent>=10||rate.ip_day>=40)throw new FeastError('Please wait before requesting another verification code.',429);
  await c.query("INSERT INTO website.feast_email_verifications(id,email,session_hash,code_hash,ip_hash,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '10 minutes')",[id,email,hash(session),hash(id+':'+session+':'+code),ipHash]);await c.query('COMMIT');
 }catch(e){await c.query('ROLLBACK');throw e;}});
 try{const sent=await sendMail({to:email,fromName:'Feast by Aviator',replyTo:'events@aviatorbrew.com',subject:'Verify your email for Feast by Aviator',text:`Your Feast by Aviator verification code is: ${code}\n\nEnter this code on the Feast page to verify ${email}. It expires in 10 minutes. Verifying also joins the Aviator Flight Crew newsletter. You can unsubscribe at any time. This does not place or approve an order. If you did not request it, ignore this email.`,html:`<div style="font:16px/1.6 Arial,sans-serif;color:#17332b;max-width:600px;margin:auto"><h1 style="font-size:25px">Verify your Feast email</h1><p>Enter this code on the Feast page:</p><p style="font-size:32px;letter-spacing:6px;font-weight:bold;background:#f5f0e4;padding:18px">${code}</p><p>Your code expires in 10 minutes. Verifying also joins the Aviator Flight Crew newsletter. You can unsubscribe at any time. This does not place or approve an order.</p><p>If you did not request it, ignore this email.</p><p>Feast by Aviator · events@aviatorbrew.com</p></div>`});if(!sent)throw new Error('Mail unavailable');
  await withDatabase(c=>c.query("UPDATE website.feast_email_verifications SET state='sent' WHERE id=$1",[id]));
 }catch{await withDatabase(c=>c.query("UPDATE website.feast_email_verifications SET state='failed' WHERE id=$1",[id]));throw new FeastError('The verification email could not be confirmed as sent. Please wait, then request another code.',503);}
 return {id,session,expiresInSeconds:600};
}
export async function verifyFeastEmail(input:{id:unknown;session:unknown;code:unknown;email:unknown}){
 const email=emailValue(input.email);if(typeof input.id!=='string'||!/^[-a-f0-9]{36}$/.test(input.id)||typeof input.session!=='string'||!/^[a-f0-9]{64}$/.test(input.session)||typeof input.code!=='string'||!/^\d{6}$/.test(input.code))throw new FeastError('Enter the 6-digit code from your email.');
 const {id,session,code}=input as {id:string;session:string;code:string};
 const result=await withDatabase(async c=>{await c.query('BEGIN');try{
  const row=(await c.query('SELECT * FROM website.feast_email_verifications WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if(!row||row.email!==email||!equal(row.session_hash,hash(session))||row.state!=='sent'||new Date(row.expires_at).getTime()<=Date.now()||row.attempts>=5){await c.query('COMMIT');return {error:'This code is invalid or expired. Request a new code.'};}
  await c.query('UPDATE website.feast_email_verifications SET attempts=attempts+1 WHERE id=$1',[id]);
  if(!equal(row.code_hash,hash(id+':'+session+':'+code))){await c.query('COMMIT');return {error:'Incorrect verification code. Check your email and try again.'};}
  const proof=randomBytes(32).toString('hex'),rememberToken=randomBytes(32).toString('hex');await c.query("UPDATE website.feast_email_verifications SET state='verified',proof_hash=$2,verified_at=now(),expires_at=now()+interval '30 minutes' WHERE id=$1",[id,hash(proof)]);
  await c.query('INSERT INTO website.feast_verified_customers(email) VALUES($1) ON CONFLICT(email) DO NOTHING',[email]);const contact=(await c.query('SELECT * FROM website.feast_verified_customers WHERE email=$1 FOR UPDATE',[email])).rows[0];
  // Enroll once. Remembered visits and later code checks never undo an unsubscribe.
  if(!contact.newsletter_enrolled_at){await subscribeVerifiedNewsletterEmail(c,email,'feast-verified');await c.query('UPDATE website.feast_verified_customers SET newsletter_enrolled_at=now() WHERE email=$1',[email]);}
  await c.query("INSERT INTO website.feast_email_sessions(token_hash,email,expires_at) VALUES($1,$2,now()+interval '365 days')",[hash(rememberToken),email]);await c.query('COMMIT');return {proof,rememberToken};
 }catch(e){await c.query('ROLLBACK');throw e;}});
 if('error' in result)throw new FeastError(result.error!);return {id,session,proof:result.proof!,rememberToken:result.rememberToken!};
}
export async function requireFeastVerifiedEmail(c:PoolClient,email:string,input:FeastEmailProof|undefined){
 if(!input||typeof input.id!=='string'||typeof input.session!=='string'||typeof input.proof!=='string'||!/^[a-f0-9]{64}$/.test(input.session)||!/^[a-f0-9]{64}$/.test(input.proof))throw new FeastError('Verify your email address before submitting your order.',403);
 const row=(await c.query('SELECT * FROM website.feast_email_verifications WHERE id=$1 FOR UPDATE',[input.id])).rows[0];
 if(!row||row.email!==email||!['verified','remembered'].includes(row.state)||new Date(row.expires_at).getTime()<=Date.now()||!equal(row.session_hash,hash(input.session))||!equal(row.proof_hash||'',hash(input.proof)))throw new FeastError('Your email verification is invalid or expired. Verify the current email address again.',403);
 return row as {id:string;verified_at:Date;used_order_id:string|null};
}

export const feastEmailCookie='aviator_feast_email';
export const feastEmailRememberSeconds=365*24*60*60;
export async function resumeFeastEmail(token:unknown,value?:unknown){
 if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))return null;
 const email=value?emailValue(value):'';
 return withDatabase(async c=>{await c.query('BEGIN');try{
  const saved=(await c.query('SELECT s.email,c.verified_at FROM website.feast_email_sessions s JOIN website.feast_verified_customers c ON c.email=s.email WHERE s.token_hash=$1 AND s.expires_at>now() FOR UPDATE OF s',[hash(token)])).rows[0];
  if(!saved||email&&email!==saved.email){await c.query('COMMIT');return null;}
  const rate=Number((await c.query("SELECT count(*) FROM website.feast_email_verifications WHERE email=$1 AND state='remembered' AND created_at>now()-interval '1 minute'",[saved.email])).rows[0].count);if(rate>=30)throw new FeastError('Please wait a moment before continuing.',429);
  const id=randomUUID(),session=randomBytes(32).toString('hex'),proof=randomBytes(32).toString('hex');
  await c.query("INSERT INTO website.feast_email_verifications(id,email,session_hash,code_hash,proof_hash,state,verified_at,expires_at) VALUES($1,$2,$3,'',$4,'remembered',$5,now()+interval '30 minutes')",[id,saved.email,hash(session),hash(proof),saved.verified_at]);
  await c.query('UPDATE website.feast_email_sessions SET last_used_at=now() WHERE token_hash=$1',[hash(token)]);await c.query('COMMIT');return {email:saved.email as string,verification:{id,session,proof}};
 }catch(e){await c.query('ROLLBACK');throw e;}});
}
export async function forgetFeastEmail(token:unknown){if(typeof token==='string'&&/^[a-f0-9]{64}$/.test(token))await withDatabase(c=>c.query('DELETE FROM website.feast_email_sessions WHERE token_hash=$1',[hash(token)]));}
