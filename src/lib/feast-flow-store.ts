import type {PoolClient} from 'pg';
import {withDatabase} from '@/lib/database';
import type {FeastFlowEvent} from '@/lib/feast-flow';
export async function recordFeastFlow(c:PoolClient,id:string,version:number,kind:string,label:string,key:string){await c.query('INSERT INTO website.feast_order_flow(order_id,version,kind,label,event_key) VALUES($1,$2,$3,$4,$5) ON CONFLICT(event_key) DO NOTHING',[id,version,kind,label,key]);}
export async function listFeastFlow(ids:string[]){if(!ids.length)return [];return withDatabase(async c=>(await c.query('SELECT id::text,order_id,version,kind,label,created_at FROM website.feast_order_flow WHERE order_id=ANY($1::text[]) ORDER BY created_at,id',[ids])).rows as FeastFlowEvent[]);}
