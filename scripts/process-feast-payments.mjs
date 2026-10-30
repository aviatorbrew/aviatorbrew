// This job uses the existing website's Stripe/SMTP configuration. No payment credentials live in cron.
const endpoint=process.env.FEAST_AUTOMATION_URL,token=process.env.FEAST_AUTOMATION_KEY;
if(!endpoint||!token||new URL(endpoint).protocol!=='https:')throw new Error('Configure the HTTPS Feast automation endpoint and its secret.');
const response=await fetch(endpoint,{method:'POST',headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(240000)});
if(!response.ok)throw new Error('Feast follow-up endpoint status '+response.status);
console.log('feast.followups',await response.json());
