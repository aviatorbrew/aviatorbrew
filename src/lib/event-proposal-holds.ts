import type {PoolClient} from 'pg';
export async function stopProposalReminder(client:PoolClient,proposalId:string){
 const row=(await client.query("UPDATE website.private_event_proposal_reminders SET status='stopped',updated_at=now() WHERE proposal_id=$1 AND status IN ('sending','sent') AND released_at IS NULL RETURNING original_expires_at",[proposalId])).rows[0];
 if(!row)return null;
 return (await client.query('UPDATE website.private_event_proposals SET expires_at=GREATEST(expires_at,$2::timestamptz) WHERE id=$1 RETURNING expires_at',[proposalId,row.original_expires_at])).rows[0].expires_at as Date;
}
export async function releaseProposalHold(client:PoolClient,planId:string,reason:'declined'|'no-response',at=new Date()){
 await client.query("UPDATE website.private_event_plans SET status='Draft',data=jsonb_set(data,'{status}','\"Draft\"'::jsonb),proposal_hold_released_at=$2,proposal_hold_release_reason=$3,proposal_review='{}'::jsonb,version=version+1,updated_at=now() WHERE id=$1 AND status IN ('Draft','Tentative')",[planId,at,reason]);
}
