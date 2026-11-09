import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {withDatabase} from '@/lib/database';
import {parseEventFoodCosts,type EventFoodCostSettings} from '@/lib/event-food-cost';
import {foodBenchmarks,foodBenchmarkRules,foodCostWeek,readFoodBenchmarkHtml,adjustedFoodCost} from '@/lib/food-cost-benchmarks';
import seed from '../../scripts/data/food-cost-estimates-2026-11-09.json';
const key='food_cost_updates',privateKey='private_event_settings';
type Rate=EventFoodCostSettings[string];
export type FoodCostUpdateStatus={enabled:boolean;source:string;schedule:string;seededAt?:string;lastAttemptAt?:string;lastCheckedAt?:string;lastUpdatedAt?:string;lastWeek?:string;updatedFoods?:string[];unavailableSources?:string[];manualFoods?:string[];unmappedFoods?:number;attention?:string;baseline?:Record<string,number>;lastApplied?:Record<string,Rate>;history?:{at:string;updatedFoods:string[];unavailableSources:string[]}[]};
const empty:FoodCostUpdateStatus={enabled:false,source:'US Foods CHEF’STORE public benchmarks — not account invoice prices',schedule:'Mondays at 8:00 a.m. Eastern (checked by the existing 15-minute scheduled job)'};
export async function getFoodCostUpdates(){return withDatabase(async c=>{const rows=(await c.query('SELECT key,value FROM website.settings WHERE key=ANY($1::text[])',[[key,privateKey]])).rows,settings=rows.find(r=>r.key===privateKey)?.value;const status={...empty,...rows.find(r=>r.key===key)?.value};delete status.baseline;delete status.lastApplied;return {costs:parseEventFoodCosts(settings?.foodCosts||{}),status};});}
export async function installRoughFoodCosts(){
 const costs=parseEventFoodCosts(seed.costs),now=new Date().toISOString();for(const rate of Object.values(costs))rate.updatedAt=now;
 return withDatabase(async c=>{await c.query('BEGIN');try{
 const old=(await c.query('SELECT value FROM website.settings WHERE key=$1 FOR UPDATE',[privateKey])).rows[0]?.value;if(!old)throw new Error('Load the existing Private Events settings before installing estimates.');
 const existing=(await c.query('SELECT value FROM website.settings WHERE key=$1 FOR UPDATE',[key])).rows[0]?.value;if(existing?.seededAt)throw new Error('The rough estimates are already installed. Edit individual internal costs instead.');
 const merged={...old.foodCosts};for(const [name,rate]of Object.entries(costs)){const before=merged[name];if(before&&!String(before.source||'').startsWith('Earlier manager estimate'))continue;merged[name]=rate;}
 parseEventFoodCosts(merged);await c.query("UPDATE website.settings SET value=jsonb_set(value,'{foodCosts}',$2::jsonb),updated_at=now() WHERE key=$1",[privateKey,JSON.stringify(merged)]);
 const lastApplied=Object.fromEntries(Object.keys(foodBenchmarkRules).filter(n=>isDeepStrictEqual(merged[n],costs[n])).map(n=>[n,merged[n]]));
 const status:FoodCostUpdateStatus={...empty,enabled:true,seededAt:now,lastUpdatedAt:now,lastApplied,baseline:{},unmappedFoods:Object.keys(merged).length-Object.keys(lastApplied).length,attention:'Initial rough recipe estimates. Weekly checks update only mapped public supplier benchmarks; other items require invoice/recipe review.'};
 await c.query("INSERT INTO website.settings(key,value,description) VALUES($1,$2::jsonb,'Internal food cost update history') ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()",[key,JSON.stringify(status)]);await c.query('COMMIT');return {installed:Object.keys(merged).length};
 }catch(e){await c.query('ROLLBACK');throw e;}});
}
async function fetchBenchmark(b:typeof foodBenchmarks[number]){
 const response=await fetch(b.url,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000),headers:{'User-Agent':'AviatorBrewing-FoodCostCheck/1.0 (+https://aviatorbrew.com)'}});if(!response.ok||!response.headers.get('content-type')?.includes('text/html'))throw new Error('Supplier page unavailable.');
 const reader=response.body?.getReader();if(!reader)throw new Error('Supplier page empty.');let size=0,html='';const decoder=new TextDecoder();try{for(;;){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>1000000)throw new Error('Supplier page exceeds limit.');html+=decoder.decode(r.value,{stream:true});}}finally{await reader.cancel().catch(()=>{});}return readFoodBenchmarkHtml(html,b);
}
export async function processWeeklyFoodCosts(force=false){
 return withDatabase(async c=>{const locked=(await c.query('SELECT pg_try_advisory_lock(59372, 1109) AS locked')).rows[0].locked;if(!locked)return {skipped:'already running'};
 try{const state=(await c.query('SELECT value FROM website.settings WHERE key=$1',[key])).rows[0]?.value as FoodCostUpdateStatus|undefined,week=foodCostWeek();if(!state?.enabled||!force&&state.lastWeek===week)return {skipped:state?.enabled?'not due':'not enabled'};
 const fresh:Record<string,number>={},unavailable:string[]=[];let index=0;await Promise.all(Array.from({length:3},async()=>{while(index<foodBenchmarks.length){const b=foodBenchmarks[index++];try{fresh[b.id]=await fetchBenchmark(b);}catch{unavailable.push(b.label);}}}));
 const now=new Date().toISOString();await c.query('BEGIN');try{
 const settings=(await c.query('SELECT value FROM website.settings WHERE key=$1 FOR UPDATE',[privateKey])).rows[0]?.value,costs=parseEventFoodCosts(settings?.foodCosts||{}),status=(await c.query('SELECT value FROM website.settings WHERE key=$1 FOR UPDATE',[key])).rows[0]?.value as FoodCostUpdateStatus;
 const baseline={...status.baseline},lastApplied={...status.lastApplied},updated:string[]=[],manual:string[]=[];for(const [id,cents]of Object.entries(fresh))if(!baseline[id])baseline[id]=cents;
 for(const [name,weights]of Object.entries(foodBenchmarkRules)){const old=lastApplied[name];if(!old||!isDeepStrictEqual(costs[name],old)){manual.push(name);continue;}const base=(seed.costs as Record<string,Rate>)[name],amount=adjustedFoodCost(base.costCents,weights,baseline,fresh);if(amount===null){unavailable.push(name+' — missing price or change over 20%; review required');continue;}if(amount!==costs[name].costCents){costs[name]={...old,costCents:amount,updatedAt:now,source:('Rough US Foods benchmark adjustment '+now.slice(0,10)+'. Recipe proportions estimated; not invoice cost. '+base.source).slice(0,300)};lastApplied[name]=costs[name];updated.push(name);}}
 const next:FoodCostUpdateStatus={...status,lastWeek:week,lastAttemptAt:now,...(Object.keys(fresh).length?{lastCheckedAt:now}:{}),...(updated.length?{lastUpdatedAt:now}:{}),baseline,lastApplied,updatedFoods:updated,manualFoods:manual,unavailableSources:[...new Set(unavailable)],unmappedFoods:Object.keys(costs).filter(n=>!foodBenchmarkRules[n]).length,attention:unavailable.length?'Some public prices could not be verified. Previous costs were retained; review the listed sources.':'Mapped public benchmarks checked. Unmapped foods and manager overrides retain their recipe estimates.',history:[{at:now,updatedFoods:updated,unavailableSources:[...new Set(unavailable)]},...(status.history||[])].slice(0,52)};
 if(updated.length)await c.query("UPDATE website.settings SET value=jsonb_set(value,'{foodCosts}',$2::jsonb),updated_at=now() WHERE key=$1",[privateKey,JSON.stringify(costs)]);
 await c.query('UPDATE website.settings SET value=$2::jsonb,updated_at=now() WHERE key=$1',[key,JSON.stringify(next)]);await c.query('COMMIT');return {checked:Object.keys(fresh).length,updated:updated.length,attention:unavailable.length,week};
 }catch(e){await c.query('ROLLBACK');throw e;}
 }finally{await c.query('SELECT pg_advisory_unlock(59372, 1109)');}});
}

export const foodCostEtag=(costs:EventFoodCostSettings)=>'"'+createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(costs).sort(([a],[b])=>a.localeCompare(b))))).digest('hex')+'"';
export async function saveManagerFoodCosts(raw:unknown,expected:string|null){
 const costs=parseEventFoodCosts(raw);return withDatabase(async c=>{await c.query('BEGIN');try{const old=(await c.query('SELECT value FROM website.settings WHERE key=$1 FOR UPDATE',[privateKey])).rows[0]?.value;if(!old)throw new Error('Load existing Private Events settings first.');if(expected&&foodCostEtag(old.foodCosts||{})!==expected)throw new Error('Internal costs changed since this page loaded. Reload the latest costs before saving.');const now=new Date().toISOString();for(const [name,rate]of Object.entries(costs))if(rate.estimate&&!isDeepStrictEqual(rate,old.foodCosts?.[name]))rate.updatedAt=now;await c.query("UPDATE website.settings SET value=jsonb_set(value,'{foodCosts}',$2::jsonb),updated_at=now() WHERE key=$1",[privateKey,JSON.stringify(costs)]);await c.query("UPDATE website.settings SET value=jsonb_set(value,'{lastUpdatedAt}',to_jsonb($2::text)),updated_at=now() WHERE key=$1",[key,now]);await c.query('COMMIT');return costs;}catch(e){await c.query('ROLLBACK');throw e;}});
}
