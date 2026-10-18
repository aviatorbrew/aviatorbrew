import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=ts.transpileModule(await readFile(new URL('../src/lib/manager-fetch.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {getManagerJson,readManagerResponse}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const actual=globalThis.fetch;let calls=0;
try{
 globalThis.fetch=async()=>{calls++;return calls===1?new Response('<!DOCTYPE html>Restarting',{status:502}):Response.json({plan:{status:'Cancelled'}});};
 assert.equal((await getManagerJson('/fixture')).plan.status,'Cancelled');assert.equal(calls,2);
 calls=0;globalThis.fetch=async()=>{calls++;return new Response('<!DOCTYPE html>Upstream error',{status:502});};
 await assert.rejects(()=>getManagerJson('/fixture'),error=>/temporarily unavailable/.test(error.message)&&!error.message.includes('<!DOCTYPE'));assert.equal(calls,3);
 calls=0;globalThis.fetch=async()=>{calls++;return Response.json({error:'Unauthorized'},{status:401});};
 await assert.rejects(()=>getManagerJson('/fixture'),/session has expired/);assert.equal(calls,1);
 calls=0;globalThis.fetch=async()=>{calls++;return Response.json({error:'This event changed in another window.'},{status:409});};
 await assert.rejects(()=>getManagerJson('/fixture'),/changed in another window/);assert.equal(calls,1);
 calls=0;await assert.rejects(()=>readManagerResponse(new Response('<!DOCTYPE html>Restarting',{status:503})),/temporarily unavailable/);assert.equal(calls,0,'Mutation response handling never replays a request');
 const controller=new AbortController();controller.abort();globalThis.fetch=async()=>{calls++;throw new DOMException('Aborted','AbortError');};await assert.rejects(()=>getManagerJson('/fixture',controller.signal),/Aborted/);assert.equal(calls,1);
 console.log('Manager requests passed: safe GET recovery, readable HTML/upstream errors, bounded retries, no authentication/conflict retries, no mutation replay, aborted reads. No network requests.');
}finally{globalThis.fetch=actual;}
