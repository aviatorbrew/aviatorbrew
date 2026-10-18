class ManagerResponseError extends Error {
  constructor(message:string,readonly retryable=false){super(message);}
}
export async function readManagerResponse(response:Response) {
  if(response.status===401)throw new ManagerResponseError("Your manager session has expired. Refresh the page and sign in again.");
  let body;
  try{body=await response.json();}catch{
    throw new ManagerResponseError(response.status>=500?"The manager portal is temporarily unavailable. Please try again in a moment.":"The manager portal returned an unreadable response. Please try again.",true);
  }
  if(!body||typeof body!=="object"||Array.isArray(body))throw new ManagerResponseError("The manager portal returned an unreadable response. Please try again.",true);
  if(!response.ok)throw new ManagerResponseError(typeof body.error==="string"?body.error:"The request failed. Please try again.",response.status>=500);
  return body;
}
// Retry only reads. Saves, cancellations, deletions and emails are never replayed here.
export async function getManagerJson(url:string,signal?:AbortSignal) {
  for(let attempt=0;;attempt++){
    try{return await readManagerResponse(await fetch(url,{cache:"no-store",signal}));}
    catch(error){
      if(signal?.aborted)throw error;
      if(attempt>=2||(!(error instanceof TypeError)&&!(error instanceof ManagerResponseError&&error.retryable))){
        if(error instanceof TypeError)throw new Error("Could not reach the manager portal. Check your connection and try again.");
        throw error;
      }
      await new Promise(resolve=>setTimeout(resolve,attempt===0?400:1000));
    }
  }
}
