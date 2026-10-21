import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import nodemailer from 'nodemailer';
import ts from 'typescript';

const require=createRequire(import.meta.url),originalEnv={...process.env},actualFetch=globalThis.fetch;
const directory=await mkdtemp(path.join(tmpdir(),'aviator-mail-test-')),attachment=path.join(directory,'proposal.pdf');
await writeFile(attachment,'%PDF-1.4\nFixture proposal only');
const code=ts.transpileModule(await readFile(new URL('../src/lib/mail.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
globalThis.fetch=()=>{throw new Error('External requests forbidden in mail tests');};
try{
 for(const mode of ['smtp','sendmail']){
  Object.assign(process.env,{MAIL_MODE:mode,SMTP_HOST:'fixture.invalid',SMTP_USER:'fixture',SMTP_PASSWORD:'fixture-only',SMTP_VERIFY_ON_START:'false',MAIL_FROM_EMAIL:'sender@example.invalid'});
  let delivered;
  const stream=nodemailer.createTransport({streamTransport:true,buffer:true,newline:'unix'});
  const fakeMailer={createTransport:()=>({sendMail:async input=>{delivered=await stream.sendMail(input);return delivered;}})},module={exports:{}};
  new Function('require','module','exports',code)(name=>name==='nodemailer'?fakeMailer:name==='@/lib/site-branding'?{findCustomLogo:async()=>undefined}:require(name),module,module.exports);
  const message={to:'customer@example.invalid',cc:'events@aviatorbrew.com',replyTo:'events@aviatorbrew.com',subject:'Fixture proposal',text:'Fixture exact quoted version',html:'<p>Fixture quoted proposal</p>',attachments:[{filename:'proposal.pdf',path:attachment,contentType:'application/pdf'}]};
  assert.equal(await module.exports.sendMail(message),true);
  assert.deepEqual(delivered.envelope.to,['customer@example.invalid','events@aviatorbrew.com']);
  const mime=delivered.message.toString();
  assert.match(mime,/^To: customer@example.invalid$/m);assert.match(mime,/^Cc: events@aviatorbrew.com$/m);assert.match(mime,/^Reply-To: events@aviatorbrew.com$/m);
  assert.ok(mime.includes('Fixture quoted proposal')&&mime.includes('filename=proposal.pdf'));
  await module.exports.sendMail({...message,cc:undefined});
  assert.deepEqual(delivered.envelope.to,['customer@example.invalid']);assert.doesNotMatch(delivered.message.toString(),/^Cc:/m,'Unrelated messages do not acquire a copy recipient');
 }
 console.log('Mail passed: SMTP/sendmail messages include the proposal CC in the actual MIME headers and recipient envelope, preserve the customer, reply address, HTML and PDF, and keep unrelated mail unchanged. Stream transport only; no external delivery.');
}finally{globalThis.fetch=actualFetch;for(const key of Object.keys(process.env))if(!(key in originalEnv))delete process.env[key];Object.assign(process.env,originalEnv);await rm(directory,{recursive:true,force:true});}
